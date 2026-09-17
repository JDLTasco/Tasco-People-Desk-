# ADR-0013 — Target due date editable by all staff

**Status:** Accepted · 2026-09-16 · Amends Spec v1.3 §5

**Context.** The specification named "the assignee, HR_LEAD or ADMIN" for target due dates, matching every other metadata field. The operator asked that it be open to all staff.

**Decision.** `PATCH /api/tickets/[id]` checks permission **per field group**. Subject, priority, category, business unit and CC require `canActOnAssignedTicket`. `target_due_at` and `target_due_reason` require only a valid session.

**Why.** A deadline someone else knows about is more useful recorded than withheld — if a colleague knows a WorkCover response is due Friday, the system should capture it without a permission negotiation. Every signed-in user is HR staff; there is no requester portal, so "all staff" is a bounded and trusted set.

**Consequence.** This is the only split-permission field group in the application, and it will look like an authorisation bug to someone reading the route. It is not. `target_due_reason` remains mandatory whenever a date is set, and both changes are audit-logged.
