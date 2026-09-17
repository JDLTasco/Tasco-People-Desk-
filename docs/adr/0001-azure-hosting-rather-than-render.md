# ADR-0001 — Azure hosting rather than Render

**Status:** Accepted · 2026-09-15

**Context.** Tasco's other internal applications (BSC, Depot Control, Carriers fleet, FMI) run on Next.js + PostgreSQL + Render.com. The HR ticketing system was originally scaffolded for the same stack. Consistency across the suite has real value: one deployment model, one set of habits, one thing to maintain.

**Decision.** HR ticketing hosts on Azure App Service inside Tasco's own tenant, breaking stack consistency with the rest of the suite.

**Why.** HR tickets contain grievances, disciplinary matters, pay disputes and medical-related leave. Hosting that on a US-based third-party PaaS with a third-party mail relay fails any serious internal privacy review and is awkward to defend if breached or subpoenaed. The data-residency and governance argument outweighs suite consistency for this application specifically.

**Rejected:** keeping Render for consistency. Rejected on data classification, not on technical merit — Render is fine for tank dips and fleet records.

**Consequence.** This application diverges from the rest of the suite. That is intentional and is not a reason to migrate it back or to migrate the others to Azure.
