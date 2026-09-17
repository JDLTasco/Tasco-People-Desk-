import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { getBlobServiceClient, splitBlobPath } from "./azure/blob-client";

// Stand-in for Azure Blob Storage (§2) until Stage 7 actually provisions
// the `attachments`/`hr-archive` storage account -- same reasoning as
// Stage 1's local-Postgres-via-Docker: the real architecture is fixed,
// this is just how it's exercised before the real infrastructure exists.
// blob_path values are identical either way (a relative path string), so
// swapping in a real @azure/storage-blob-backed implementation later
// doesn't change anything upstream of this module.
export interface BlobStore {
  save(path: string, content: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  /** Stage 6: the archive writer needs this to pick the next version number when re-archiving an amended ticket -- "original artefacts are never overwritten." */
  exists(path: string): Promise<boolean>;
  /** Stage 6: the retention-purge job needs this -- "hard-deletes ... blob artefacts" (§10). Removes everything under the given path prefix. */
  deletePrefix(pathPrefix: string): Promise<void>;
}

const LOCAL_ROOT = join(process.cwd(), ".local-blob-store");

class LocalFilesystemBlobStore implements BlobStore {
  async save(path: string, content: Buffer): Promise<void> {
    const fullPath = join(LOCAL_ROOT, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  async read(path: string): Promise<Buffer> {
    return readFile(join(LOCAL_ROOT, path));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(join(LOCAL_ROOT, path));
      return true;
    } catch {
      return false;
    }
  }

  async deletePrefix(pathPrefix: string): Promise<void> {
    await rm(join(LOCAL_ROOT, pathPrefix), { recursive: true, force: true });
  }
}

// Stage 7: real Azure Blob Storage, authenticated via the App Service's
// managed identity (see lib/azure/blob-client.ts) -- no account key or
// connection string. `blob_path` values are unchanged (`{container}/...`),
// so every caller upstream of this module is unaffected by the swap.
class AzureBlobStore implements BlobStore {
  async save(path: string, content: Buffer): Promise<void> {
    const { container, blobName } = splitBlobPath(path);
    const containerClient = getBlobServiceClient().getContainerClient(container);
    // §7.3.2's operational rule: "set all blob metadata in the write
    // options at upload time" -- a separate metadata-set call shortly
    // after upload can cause the on-upload malware scan to fail. This is
    // the one and only write call, so there is no later call to get this
    // wrong.
    await containerClient.getBlockBlobClient(blobName).uploadData(content, {
      blobHTTPHeaders: { blobContentType: "application/octet-stream" },
    });
  }

  async read(path: string): Promise<Buffer> {
    const { container, blobName } = splitBlobPath(path);
    const blobClient = getBlobServiceClient().getContainerClient(container).getBlockBlobClient(blobName);
    return blobClient.downloadToBuffer();
  }

  async exists(path: string): Promise<boolean> {
    const { container, blobName } = splitBlobPath(path);
    return getBlobServiceClient().getContainerClient(container).getBlockBlobClient(blobName).exists();
  }

  async deletePrefix(pathPrefix: string): Promise<void> {
    const { container, blobName } = splitBlobPath(pathPrefix);
    const containerClient = getBlobServiceClient().getContainerClient(container);
    for await (const blob of containerClient.listBlobsFlat({ prefix: blobName })) {
      await containerClient.getBlockBlobClient(blob.name).deleteIfExists();
    }
  }
}

// Real Azure Blob Storage once Stage 7's storage account exists and
// AZURE_STORAGE_ACCOUNT_NAME is set (App Service application setting);
// the local filesystem stand-in otherwise, unchanged from Stages 1-6.
export const blobStore: BlobStore = process.env.AZURE_STORAGE_ACCOUNT_NAME
  ? new AzureBlobStore()
  : new LocalFilesystemBlobStore();
