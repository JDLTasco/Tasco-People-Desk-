"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminCategory {
  id: string;
  name: string;
  isActive: boolean;
}

async function patchCategory(id: string, body: { name?: string; isActive?: boolean }) {
  const res = await fetch(`/api/admin/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function createCategory(name: string) {
  const res = await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function CategoryAdminPanel({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");

  async function run(action: () => Promise<{ ok: boolean; status: number; data: { error?: string } }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.data?.error ?? `Request failed (${result.status})`);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  return (
    <>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editingId === c.id ? (
                  <span style={{ display: "flex", gap: "0.4rem" }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      disabled={busy}
                      style={{ width: "12rem" }}
                    />
                    <button
                      type="button"
                      disabled={busy || !editingName.trim()}
                      onClick={() => run(() => patchCategory(c.id, { name: editingName.trim() }))}
                    >
                      Save
                    </button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    {c.name}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name);
                      }}
                    >
                      Edit
                    </button>
                  </span>
                )}
              </td>
              <td>
                <span className={c.isActive ? "chip chip-status-ALLOCATED" : "chip chip-status-CLOSED"}>
                  {c.isActive ? "Active" : "Deactivated"}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => run(() => patchCategory(c.id, { isActive: !c.isActive }))}
                >
                  {c.isActive ? "Deactivate" : "Restore"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="section-card">
        <h2>Add a category</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await createCategory(newName.trim());
              if (result.ok) setNewName("");
              return result;
            });
          }}
        >
          <label>
            Name
            <br />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>{" "}
          <button type="submit" disabled={busy || !newName.trim()} style={{ marginTop: "0.75rem" }}>
            Add category
          </button>
        </form>
      </section>
    </>
  );
}
