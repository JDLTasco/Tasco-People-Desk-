import type { NormalizedMessage } from "./message-types";

export interface DeltaResult {
  messages: NormalizedMessage[];
  deltaLink: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  expiresAt: Date;
}

export interface OutboundEmail {
  toRecipients: string[];
  ccRecipients: string[];
  subject: string;
  bodyHtml: string;
  /**
   * §7.4: "with In-Reply-To and References headers set to the original
   * ingestion message." Graph's sendMail action has no dedicated
   * reply-threading parameter for a freshly-composed message (that only
   * exists on the createReply/reply actions, which reply as the literal
   * mail item -- not what this app does, since it renders its own
   * curated body); internetMessageHeaders is Graph's documented
   * mechanism for setting arbitrary standard headers on a sent message,
   * used here for exactly that purpose. Omitted entirely when there is
   * no original message to thread against (e.g. nothing to reply to
   * yet).
   */
  inReplyToInternetMessageId?: string;
  referencesInternetMessageIds?: string[];
}

export interface GraphGroupMember {
  entraObjectId: string;
  displayName: string;
  upn: string;
}

export interface GraphClient {
  getMessage(messageId: string): Promise<NormalizedMessage>;
  /** §7.2: delta query against the inbox. Pass the previous run's deltaLink to resume; omit for a full initial sync. */
  listInboxDelta(deltaLink?: string): Promise<DeltaResult>;
  createSubscription(notificationUrl: string, clientState: string): Promise<SubscriptionResult>;
  renewSubscription(subscriptionId: string): Promise<{ expiresAt: Date }>;
  /** §7.4: sends from the shared HR mailbox via Graph's sendMail action. Throws on any non-2xx response -- the caller (lib/email/send.ts) owns retry/backoff. */
  sendMail(email: OutboundEmail): Promise<void>;
  /** §12 `sync-users`: direct (non-transitive) members of one of the three role groups (§3). Paginates internally. */
  listGroupMembers(groupId: string): Promise<GraphGroupMember[]>;
}

interface GraphMessageResource {
  id: string;
  internetMessageId: string;
  conversationId: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string } }[];
  subject?: string;
  body?: { content?: string };
  receivedDateTime: string;
  internetMessageHeaders?: { name: string; value: string }[];
  attachments?: {
    name: string;
    contentType: string;
    size: number;
    isInline: boolean;
    contentBytes?: string;
  }[];
}

function normalizeGraphMessage(msg: GraphMessageResource): NormalizedMessage {
  return {
    graphMessageId: msg.id,
    internetMessageId: msg.internetMessageId,
    conversationId: msg.conversationId,
    fromAddress: msg.from?.emailAddress?.address ?? "",
    fromName: msg.from?.emailAddress?.name ?? "",
    toRecipients: (msg.toRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
    ccRecipients: (msg.ccRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
    subject: msg.subject ?? "",
    bodyHtml: msg.body?.content ?? "",
    bodyText: "", // sanitised/derived at render time (§7.3) -- not needed from Graph directly
    receivedAt: new Date(msg.receivedDateTime),
    internetMessageHeaders: msg.internetMessageHeaders ?? [],
    attachments: (msg.attachments ?? [])
      .filter((a) => a.contentBytes) // file attachments only -- item/reference attachments aren't handled
      .map((a) => ({
        filename: a.name,
        declaredContentType: a.contentType,
        sizeBytes: a.size,
        content: Buffer.from(a.contentBytes!, "base64"),
        isInline: a.isInline,
      })),
  };
}

const MESSAGE_SELECT =
  "id,internetMessageId,conversationId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,internetMessageHeaders";

/**
 * Real Microsoft Graph implementation -- plain fetch + the OAuth 2.0
 * client-credentials flow, no SDK dependency needed since Graph is a
 * REST API. Written to the real spec (§7.1, §7.2, §14 item 2's
 * permissions), but **completely unexercised**: §14 items 1-3 (app
 * registration, admin consent, mailbox scoping) don't exist yet, so
 * nothing has ever called this against a real tenant. Treat every method
 * here as unverified until that changes.
 */
export class GraphApiClient implements GraphClient {
  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly mailboxId: string,
  ) {}

  private async getAccessToken(): Promise<string> {
    const res = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) {
      throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private async graphFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`Graph API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async getMessage(messageId: string): Promise<NormalizedMessage> {
    const msg = await this.graphFetch<GraphMessageResource>(
      `/users/${this.mailboxId}/messages/${messageId}?$select=${MESSAGE_SELECT}&$expand=attachments`,
    );
    return normalizeGraphMessage(msg);
  }

  async listInboxDelta(deltaLink?: string): Promise<DeltaResult> {
    const path =
      deltaLink ??
      `/users/${this.mailboxId}/mailFolders/inbox/messages/delta?$select=${MESSAGE_SELECT}`;
    const data = await this.graphFetch<{ value: GraphMessageResource[]; "@odata.deltaLink"?: string }>(
      path.startsWith("http") ? path.replace("https://graph.microsoft.com/v1.0", "") : path,
    );
    return {
      messages: data.value.map(normalizeGraphMessage),
      deltaLink: data["@odata.deltaLink"] ?? "",
    };
  }

  async createSubscription(notificationUrl: string, clientState: string): Promise<SubscriptionResult> {
    const expirationDateTime = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
    const data = await this.graphFetch<{ id: string; expirationDateTime: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        resource: `/users/${this.mailboxId}/mailFolders/inbox/messages`,
        expirationDateTime,
        clientState,
      }),
    });
    return { subscriptionId: data.id, expiresAt: new Date(data.expirationDateTime) };
  }

  async renewSubscription(subscriptionId: string): Promise<{ expiresAt: Date }> {
    const expirationDateTime = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
    const data = await this.graphFetch<{ expirationDateTime: string }>(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime }),
    });
    return { expiresAt: new Date(data.expirationDateTime) };
  }

  async listGroupMembers(groupId: string): Promise<GraphGroupMember[]> {
    const members: GraphGroupMember[] = [];
    let path: string | null = `/groups/${groupId}/members?$select=id,displayName,userPrincipalName`;
    while (path) {
      const data: { value: { id: string; displayName?: string; userPrincipalName?: string }[]; "@odata.nextLink"?: string } =
        await this.graphFetch(path.startsWith("http") ? path.replace("https://graph.microsoft.com/v1.0", "") : path);
      for (const m of data.value) {
        members.push({ entraObjectId: m.id, displayName: m.displayName ?? "", upn: m.userPrincipalName ?? "" });
      }
      path = data["@odata.nextLink"] ?? null;
    }
    return members;
  }

  async sendMail(email: OutboundEmail): Promise<void> {
    const internetMessageHeaders: { name: string; value: string }[] = [];
    if (email.inReplyToInternetMessageId) {
      internetMessageHeaders.push({ name: "In-Reply-To", value: email.inReplyToInternetMessageId });
    }
    if (email.referencesInternetMessageIds?.length) {
      internetMessageHeaders.push({ name: "References", value: email.referencesInternetMessageIds.join(" ") });
    }

    const token = await this.getAccessToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${this.mailboxId}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: email.subject,
          body: { contentType: "HTML", content: email.bodyHtml },
          toRecipients: email.toRecipients.map((address) => ({ emailAddress: { address } })),
          ccRecipients: email.ccRecipients.map((address) => ({ emailAddress: { address } })),
          ...(internetMessageHeaders.length > 0 ? { internetMessageHeaders } : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
    }
  }
}

/** True once §14 items 1-3 have supplied real credentials -- see .env.example. */
export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.HR_MAILBOX_ID,
  );
}

export function getGraphClient(): GraphClient {
  if (!isGraphConfigured()) {
    throw new Error(
      "Graph is not configured (§14 items 1-3 not done yet). Use the dev-only /api/dev/mock-inbound-email " +
        "endpoint to exercise the ingestion pipeline without a real Graph connection.",
    );
  }
  return new GraphApiClient(
    process.env.AZURE_AD_TENANT_ID!,
    process.env.AZURE_AD_CLIENT_ID!,
    process.env.AZURE_AD_CLIENT_SECRET!,
    process.env.HR_MAILBOX_ID!,
  );
}
