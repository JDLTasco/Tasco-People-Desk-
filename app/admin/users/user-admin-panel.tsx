"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { formatAuDateTime } from "@/lib/format-date";

type Role = "ADMIN" | "HR_LEAD" | "HR_OFFICER";

interface AdminUser {
  id: string;
  displayName: string;
  initials: string;
  upn: string;
  role: Role;
  isActive: boolean;
  entraObjectId: string;
  lastLoginAt: string | null;
}

const ROLES: Role[] = ["ADMIN", "HR_LEAD", "HR_OFFICER"];

async function patchUser(
  id: string,
  body: { role?: Role; isActive?: boolean; displayName?: string; upn?: string; entraObjectId?: string },
) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function UserAdminPanel({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [initials, setInitials] = useState("");
  const [upn, setUpn] = useState("");
  const [role, setRole] = useState<Role>("HR_OFFICER");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Re-pointing upn+entraObjectId is a distinct, rarer operation from the
  // display-name edit above -- see the API route's own comment on why the
  // two fields must move together (this is how a dev-mock/placeholder
  // user gets linked to a real person's actual Entra account ahead of
  // their first real sign-in).
  const [editingIdentityId, setEditingIdentityId] = useState<string | null>(null);
  const [editingUpn, setEditingUpn] = useState("");
  const [editingEntraObjectId, setEditingEntraObjectId] = useState("");

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
    setEditingIdentityId(null);
    router.refresh();
  }

  return (
    <>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
          {/* §6's step-up flow had no real trigger anywhere in the UI --
              nothing ever called signIn("azure-ad-step-up"), so role
              changes and identity relinks (both step-up-gated) were
              unreachable for a real Entra sign-in until this button
              existed (found 2026-09-19). */}
          {error.startsWith("Step-up re-authentication required") && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => signIn("azure-ad-step-up", { callbackUrl: window.location.href })}
              >
                Re-authenticate
              </button>
            </>
          )}
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Initials</th>
            <th>UPN / email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {editingId === u.id ? (
                  <span style={{ display: "flex", gap: "0.4rem" }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      disabled={busy}
                      style={{ width: "10rem" }}
                    />
                    <button
                      type="button"
                      disabled={busy || !editingName.trim()}
                      onClick={() => run(() => patchUser(u.id, { displayName: editingName.trim() }))}
                    >
                      Save
                    </button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    {u.displayName}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(u.id);
                        setEditingName(u.displayName);
                      }}
                    >
                      Edit
                    </button>
                  </span>
                )}
              </td>
              <td>{u.initials}</td>
              <td>
                {editingIdentityId === u.id ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    <input
                      value={editingUpn}
                      onChange={(e) => setEditingUpn(e.target.value)}
                      placeholder="Real UPN / email"
                      disabled={busy}
                    />
                    <input
                      value={editingEntraObjectId}
                      onChange={(e) => setEditingEntraObjectId(e.target.value)}
                      placeholder="Real Entra Object ID"
                      disabled={busy}
                    />
                    <span style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        disabled={busy || !editingUpn.trim() || !editingEntraObjectId.trim()}
                        onClick={() =>
                          run(() =>
                            patchUser(u.id, {
                              upn: editingUpn.trim(),
                              entraObjectId: editingEntraObjectId.trim(),
                            }),
                          )
                        }
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditingIdentityId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  </span>
                ) : (
                  <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    {u.upn}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingIdentityId(u.id);
                        setEditingUpn(u.upn);
                        setEditingEntraObjectId(u.entraObjectId);
                      }}
                    >
                      Link to real account
                    </button>
                  </span>
                )}
              </td>
              <td>
                <select
                  disabled={busy}
                  defaultValue={u.role}
                  onChange={(e) => run(() => patchUser(u.id, { role: e.target.value as Role }))}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <span className={u.isActive ? "chip chip-status-ALLOCATED" : "chip chip-status-CLOSED"}>
                  {u.isActive ? "Active" : "Archived"}
                </span>
              </td>
              <td>{u.lastLoginAt ? formatAuDateTime(u.lastLoginAt) : "never"}</td>
              <td>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => run(() => patchUser(u.id, { isActive: !u.isActive }))}
                >
                  {u.isActive ? "Archive" : "Restore"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="section-card">
        <h2>Add a user</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName, initials, upn, role }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok) {
                setDisplayName("");
                setInitials("");
                setUpn("");
                setRole("HR_OFFICER");
              }
              return { ok: res.ok, status: res.status, data };
            });
          }}
        >
          <label>
            Display name
            <br />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <br />
          <label>
            Initials
            <br />
            <input value={initials} onChange={(e) => setInitials(e.target.value)} required maxLength={4} />
          </label>
          <br />
          <label>
            UPN / email
            <br />
            <input type="email" value={upn} onChange={(e) => setUpn(e.target.value)} required />
          </label>
          <br />
          <label>
            Role
            <br />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <br />
          <button type="submit" disabled={busy || !displayName || !initials || !upn} style={{ marginTop: "0.75rem" }}>
            Add user
          </button>
        </form>
      </section>
    </>
  );
}
