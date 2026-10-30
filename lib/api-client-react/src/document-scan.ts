import { fetchWithServiceRecovery } from "./service-recovery";

/**
 * Keep AI processing off a single long-lived HTTP connection. Every poll uses
 * the original auth and document identifiers, and cannot start another scan.
 */
export async function fetchDocumentScan(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const request = (extra: Record<string, unknown>) => fetchWithServiceRecovery(input, {
    ...init,
    headers,
    body: JSON.stringify({ ...body, async_scan: true, ...extra }),
  });
  let response = await request({});
  if (!response.ok) return response;
  let snapshot = await response.json();
  // Backwards compatible with older servers and synchronous test fixtures.
  if (!snapshot?.scan_job_id) return new Response(JSON.stringify(snapshot), {
    status: response.status || 200, headers: { "Content-Type": "application/json" },
  });
  const jobId = snapshot.scan_job_id;
  const deadline = Date.now() + 20 * 60_000;
  while (snapshot.status === "processing") {
    if (Date.now() >= deadline) {
      throw new Error("The document is still processing. Your file is saved. Retry Scan to reconnect to its progress.");
    }
    await new Promise<void>((resolve, reject) => {
      const signal = init.signal;
      const cancel = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error("Scan progress check cancelled"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      }, 2000);
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
    });
    // Retrying a poll is safe: it only observes the already-authorized job.
    for (let attempt = 0; ; attempt++) {
      try {
        response = await request({ scan_job_id: jobId });
        if (response.status >= 500 && attempt < 2) continue;
        break;
      } catch (error) {
        if (init.signal?.aborted || attempt >= 2) throw error;
      }
    }
    if (!response.ok) return response;
    snapshot = await response.json();
    if (snapshot.scan_job_id !== jobId) throw new Error("The scan progress response was invalid. Your document remains saved.");
  }
  if (snapshot.status !== "complete" || !Number.isInteger(snapshot.result_status)) {
    throw new Error("The scan progress response was incomplete. Retry Scan to check again.");
  }
  return new Response(JSON.stringify(snapshot.result), {
    status: snapshot.result_status,
    headers: { "Content-Type": "application/json" },
  });
}
