import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";

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

// No AZURE_STORAGE_CONNECTION_STRING yet (Stage 7) -- always the local
// stand-in for now. The env check exists so this file doesn't need to
// change shape when Stage 7 adds the real implementation, only this
// export.
export const blobStore: BlobStore = new LocalFilesystemBlobStore();
