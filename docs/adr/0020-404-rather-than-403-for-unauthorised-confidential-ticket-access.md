# ADR-0020 — 404 rather than 403 for unauthorised confidential ticket access

**Status:** Accepted · 2026-09-15

**Context.** A direct API request for a confidential ticket by a user without access needs a response.

**Decision.** Return **404** with no metadata in the body. Not 403.

**Why.** A 403 confirms the ticket exists. Given ticket numbers are predictable `YYMMDDHHMM` strings, an unauthorised user could enumerate them and learn which matters are confidential and roughly when they were raised — which is itself disclosure, and in a small HR team is often enough to infer who and what. A 404 reveals nothing.

**Consequence.** This will look like a bug to someone testing authorisation and expecting 403. It is not. Every other unauthorised access in the application correctly returns 403; confidential tickets are the deliberate exception.
