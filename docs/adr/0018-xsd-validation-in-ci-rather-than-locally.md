# ADR-0018 — XSD validation in CI rather than locally

**Status:** Accepted · 2026-09-16

**Context.** The acceptance test requires `ticket.xml` to validate against the committed XSD. The local development environment has no XSD validator — no `xmllint`, no `lxml` — and Tasco's network gateway blocks the binaries needed to install one. The interim check was a hand-written balanced-tag test.

**Decision.** Real XSD validation runs in the GitHub Actions pipeline, where hosted runners provide `xmllint` and Tasco's gateway does not apply. Delivered at Stage 8.

**Why this matters.** Well-formed and valid are not the same thing, and a balanced-tag check proves neither structure nor types. Until CI validation exists, that acceptance test is not passing regardless of what the local suite reports.

**Rejected:** adding a JavaScript XSD validator as a dependency (none is credible and it would be a second new dependency); dropping the XSD (the archive's machine-readability after database purge is the reason it exists).
