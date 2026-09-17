# ADR-0014 — Attachment policy: `.zip` accepted, other containers blocked, fail closed

**Status:** Accepted · 2026-09-16

**Context.** A proposal was made to treat `.zip`, `.rar`, `.iso` and `.img` conservatively as a group.

**Decision.** Executable extensions are blocked outright. `.iso .img .vhd .vhdx .rar .7z .cab .ace` are blocked outright. **`.zip` is accepted**, stored and quarantined until Defender returns CLEAN. Extension checks are backed by magic-byte content sniffing; a mismatch is `BLOCKED` with reason `TYPE_MISMATCH`. Server-side archive extraction is forbidden anywhere in the codebase.

**Why `.zip` is different.** Law firms, recruiters, insurers and payroll providers routinely send zipped document packs. Blocking them would generate daily friction and push correspondence back to personal inboxes, defeating the whole system. The other container formats have essentially no legitimate HR use and are standard malware delivery vehicles.

**Why no server-side extraction.** Zip bombs and path traversal during extraction are a larger exposure than the threat being addressed. Archives are stored whole, scanned whole, downloaded whole.

**Fail closed.** PENDING, BLOCKED, MALICIOUS and scan timeout all mean not downloadable. The default is never CLEAN. Defender is the primary control; extension and type checks are supporting controls, not the security boundary.
