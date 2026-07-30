/**
 * BullMQ worker entry — STUB (Story 1.1).
 *
 * Real queues/jobs arrive in Epic 3:
 *   - `rfq.submitted` → send GLH notification + sender confirmation (retry)
 *   - `email.send`
 *   - ClamAV attachment-scan orchestration
 *
 * For now it starts and idles so `docker-compose` has a healthy `worker` service.
 */
console.log("[worker] GREENLIGHTHOUSE worker started (stub — no queues registered yet)");

// Keep the process alive without busy-waiting.
setInterval(() => {
  /* idle */
}, 1 << 30);
