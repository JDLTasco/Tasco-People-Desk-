import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

// Stage 7: the app authenticates to Blob Storage via the App Service's
// system-assigned managed identity (RBAC role "Storage Blob Data
// Contributor", granted in infra/modules/appservice.bicep) -- no account
// key or connection string anywhere (build spec §0.1.8, §2 "Secrets:
// Azure Key Vault via App Service system-assigned managed identity").
// DefaultAzureCredential resolves to that managed identity on App Service
// and to `az login`'s credential locally, so the same code path works in
// both places.
let cached: BlobServiceClient | null = null;

export function getBlobServiceClient(): BlobServiceClient {
  if (cached) return cached;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error("AZURE_STORAGE_ACCOUNT_NAME is not set -- see lib/blob-store.ts for the local stand-in used without it.");
  }
  cached = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, new DefaultAzureCredential());
  return cached;
}

/** blob_path values are `{container}/{blob name...}` -- e.g. `attachments/{ticketId}/{messageId}/{filename}` or `hr-archive/{YYYY}/{MM}/{ticketNo}/ticket.xml` (§5, §10). Split once on the first "/" to recover the two Azure Blob concepts from one path string. */
export function splitBlobPath(path: string): { container: string; blobName: string } {
  const idx = path.indexOf("/");
  if (idx === -1) {
    throw new Error(`blob_path "${path}" has no container segment`);
  }
  return { container: path.slice(0, idx), blobName: path.slice(idx + 1) };
}
