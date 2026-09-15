import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, notFound } from "@/lib/http-errors";
import { processInboundMessage } from "@/lib/ingestion/process-message";
import type { NormalizedMessage } from "@/lib/graph/message-types";

interface MockEmailBody {
  fromAddress: string;
  fromName?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  toRecipients?: string[];
  ccRecipients?: string[];
  receivedAt?: string;
  internetMessageId?: string;
  conversationId?: string;
  internetMessageHeaders?: { name: string; value: string }[];
  attachments?: { filename: string; declaredContentType: string; contentBase64: string; isInline?: boolean }[];
}

// Dev-only: feeds a synthetic email straight into the exact same pipeline
// (lib/ingestion/process-message.ts) the real webhook and delta poller
// will call once §14 exists. This is how Stage 4's ingestion rules
// (suppression, auto-reply, threading, ticket creation, attachment
// handling) get exercised end-to-end without a real or fake Graph client --
// same NODE_ENV convention as Stage 2's dev-mock auth provider.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return notFound();
  }

  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { correlationId } = ctx;

  const body = (await request.json().catch(() => null)) as MockEmailBody | null;
  if (!body?.fromAddress || body.subject === undefined) {
    return badRequest("fromAddress and subject are required");
  }

  const now = new Date();
  const message: NormalizedMessage = {
    graphMessageId: `mock-${crypto.randomUUID()}`,
    internetMessageId: body.internetMessageId ?? `<mock-${crypto.randomUUID()}@mock.local>`,
    conversationId: body.conversationId ?? `mock-conversation-${crypto.randomUUID()}`,
    fromAddress: body.fromAddress,
    fromName: body.fromName ?? body.fromAddress,
    toRecipients: body.toRecipients ?? ["humanresources@tascopetroleum.com.au"],
    ccRecipients: body.ccRecipients ?? [],
    subject: body.subject,
    bodyHtml: body.bodyHtml ?? "",
    bodyText: body.bodyText ?? "",
    receivedAt: body.receivedAt ? new Date(body.receivedAt) : now,
    internetMessageHeaders: body.internetMessageHeaders ?? [],
    attachments: (body.attachments ?? []).map((a) => {
      const content = Buffer.from(a.contentBase64, "base64");
      return {
        filename: a.filename,
        declaredContentType: a.declaredContentType,
        sizeBytes: content.length,
        content,
        isInline: a.isInline ?? false,
      };
    }),
  };

  const outcome = await processInboundMessage(message, correlationId);
  return NextResponse.json({ outcome });
}
