---
name: Document scan lifecycle constraints
description: Long AI reads can outlast web connections; an incomplete classification response is not an invalid source file.
---

Do not tie completion of a document scan to one uninterrupted browser request. A disconnected request is not proof that the scan stopped or that its source is invalid.

**Why:** Real source reading reached AI processing successfully, but long responses overlapped with disconnected requests and repeated scan attempts. Some otherwise valid profile responses also omitted the separate classification field, causing the entire scan to be rejected.

**How to apply:** Separate progress checks from processing; deduplicate active work for the same authorized source. Recheck authorization on every progress request. Never grant access based only on a job ID, and do not claim process-local progress state survives a server restart. Recover missing classification from the actual source independently rather than inventing records or discarding an already-read profile.
