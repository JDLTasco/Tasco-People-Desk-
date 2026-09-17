# ADR-0002 — Entra ID SSO, no local password store

**Status:** Accepted · 2026-09-15

**Context.** The original request was for per-user portal passwords with an administrator who adds and removes users.

**Decision.** Authentication is Microsoft Entra ID SSO. Roles derive from Entra security group membership. There is no local credential store anywhere in the system.

**Why.** A second credential store next to one that already exists is strictly worse: it lacks MFA, conditional access, password reset and lockout, and — critically — offboarding. When someone leaves Tasco, IT disables their Entra account and they lose email, Teams and SharePoint immediately. A local password would still work until someone remembered the HR portal existed. Storing password hashes also transfers breach liability to this application for no gain. The administrative workflow the operator wanted is unchanged: adding a user is adding them to a security group.

**Rejected:** local usernames and passwords; a hybrid with local fallback. For a non-Tasco user, the answer is an Entra B2B guest invitation, never a local account.

**Consequence.** The system cannot be used by anyone without a Tasco Entra identity. Accepted — there is no requester portal by design.
