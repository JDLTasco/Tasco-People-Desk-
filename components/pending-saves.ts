// "Save & exit" on the ticket page (John, 2026-10-03). Each part of the page
// that can hold unsaved work (the Actions panel, the new-note box) registers
// a saver here; the Save & exit button runs them all, in registration order,
// and only leaves the page if every one succeeded. Module-level on purpose:
// one ticket page is open per tab, and savers unregister on unmount.
export type SaveResult = { ok: true } | { ok: false; error: string };
export type Saver = () => Promise<SaveResult>;

const savers = new Map<string, Saver>();

export function registerSaver(key: string, saver: Saver): () => void {
  savers.set(key, saver);
  return () => {
    if (savers.get(key) === saver) savers.delete(key);
  };
}

/** Runs every registered saver in turn; stops at the first failure. */
export async function saveAll(): Promise<SaveResult> {
  for (const saver of Array.from(savers.values())) {
    const result = await saver();
    if (!result.ok) return result;
  }
  return { ok: true };
}
