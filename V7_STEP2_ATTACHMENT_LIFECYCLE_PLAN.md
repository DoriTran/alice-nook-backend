# V7 Step 2 Attachment Lifecycle

## Architecture

R2 objects are tracked by `DiaryAttachmentObject`; `DiaryMessageAttachment` is the durable, shareable Message reference set. Message JSON retains ordering and display metadata. The bucket remains private and signed URLs are never persisted.

## Lifecycle

`pending -> uploaded -> committed -> cleanup_pending -> deleted`. Presign creates `pending`; finalize verifies R2 `ContentLength` and `ContentType`; a PostgreSQL transaction commits Message references. Removing the final reference marks cleanup pending. R2 deletion occurs outside database transactions and failures remain retryable.

## API

- `POST /api/uploads/presign` returns `attachmentId`, a 10-minute PUT URL, expiry, method, and required Content-Type.
- `POST /api/uploads/:attachmentId/finalize` performs an ownership-scoped HeadObject verification and idempotently returns canonical metadata.
- `GET /api/uploads/:attachmentId/url` returns a 10-minute GET URL only for an owned, committed, referenced object.

## Message integration

Durable IDs are collected from top-level and Todo-item attachments. Create, full edit, and Todo PATCH synchronize join rows atomically. Clone may share an attachment. Detaching one reference never deletes an object still referenced elsewhere. Legacy JSON remains readable; `DIARY_DURABLE_ATTACHMENTS_WRITE_ENABLED` gates durable-only new writes for the Step 3 rollout.

## Cleanup and security

Missing or foreign IDs return 404. Object keys, credentials, and signed URLs are not stored in Message JSON or exposed by Diary snapshots. Pending objects past their upload grace, uploaded objects uncommitted for 24 hours, and cleanup-pending objects are deterministic future sweeper candidates. Redis/BullMQ is not required. User deletion is restricted until tracked R2 objects are cleaned.

## Frontend Step 3

Keep local Blob previews, then presign, PUT with progress, finalize, and create the Message with canonical attachment IDs. Retry resumes from the first incomplete stage and reuses finalized IDs. Rendering lazily fetches signed GET URLs and refreshes them shortly before expiry.

## Migration and rollout

The migration adds only the attachment object and join tables; existing Message JSON is not rewritten. Deploy backend with the durable-write gate disabled, deploy Step 3, verify production uploads/reads, then enable the gate. R2 CORS must add GET/HEAD and Range support before private rendering ships.
