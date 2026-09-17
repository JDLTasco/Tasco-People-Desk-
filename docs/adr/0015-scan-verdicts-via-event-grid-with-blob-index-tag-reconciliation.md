# ADR-0015 — Scan verdicts via Event Grid with blob index tag reconciliation

**Status:** Accepted · 2026-09-16

**Context.** Attachments are written `PENDING`. Nothing in the original design ever cleared that status, which would have left every attachment permanently undownloadable in production. Defender surfaces verdicts four ways: blob index tag, Event Grid message, Log Analytics entry, or a security alert.

**Decision.** Event Grid webhook to `/api/scan/notifications` as primary, with `attachment-scan-reconcile` reading the blob index tag every 15 minutes as a safety net. Anything PENDING beyond 60 minutes becomes BLOCKED with reason `SCAN_TIMEOUT` and raises an alert.

**Why two mechanisms.** The same reason Graph ingestion has a webhook and a delta poller: event delivery drops, and a silently stuck attachment fails invisibly. The duplication is deliberate, not redundant.

**Rejected:** Log Analytics (higher latency, designed for audit rather than automation); security alerts alone (only fire on malicious verdicts, so nothing ever clears to CLEAN).

**Three infrastructure constraints that break this silently.** The storage account must be standard GPv2 with **hierarchical namespace disabled** — index tags are unsupported with HNS enabled, so turning on ADLS Gen2 removes the reconciliation path. The Event Grid topic must allow public network access; topics reachable only via private endpoint are unsupported for scan-result delivery. The Defender service principal needs EventGrid Data Sender on the topic.

**One operational rule.** Set all blob metadata in the write options at upload time. Updating metadata shortly after upload can cause the on-upload scan to fail.
