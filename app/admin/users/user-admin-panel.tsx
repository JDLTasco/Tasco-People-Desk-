"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

async function patchUser(id: string, body: { role?: Role; isActive?: boolean }) {
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

  async function run(action: () => Promise<{ ok: boolean; status: number; data: { error?: string } }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(
        result.status === 403
          ? "Step-up re-authentication required for a role change -- sign out and back in with \"Simulate step-up\" checked, then retry."
          : result.data?.error ?? `Request failed (${result.status})`,
      );
      return;
    }
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
              <td>{u.displayName}</td>
              <td>{u.initials}</td>
              <td>{u.upn}</td>
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
              <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}</td>
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
