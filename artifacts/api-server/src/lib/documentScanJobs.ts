import crypto from "node:crypto";
import type { Response } from "express";

type ScanJob = {
  id: string;
  scope: string;
  createdAt: number;
  completedAt?: number;
  resultStatus?: number;
  result?: unknown;
};

// Only transport state lives here. The existing scan continues to persist its
// findings and enforce sharing/review rules in the normal database tables.
export class DocumentScanJobs {
  private jobs = new Map<string, ScanJob>();

  attach(body: Record<string, unknown>, scope: string, response: Response): Response | null {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > 10 * 60_000) this.jobs.delete(id);
    }
    if (typeof body.scan_job_id === "string") {
      const job = this.jobs.get(body.scan_job_id);
      if (!job || job.scope !== scope) {
        response.status(404).json({ error: "This scan is no longer available. Retry Scan to reconnect or start a new scan." });
      } else {
        response.json(this.snapshot(job));
      }
      return null;
    }
    const active = [...this.jobs.values()].find(job => job.scope === scope && !job.completedAt);
    if (active) {
      response.status(202).json(this.snapshot(active));
      return null;
    }
    if (this.jobs.size >= 200) {
      response.status(503).json({ error: "The document reader is busy. Your document is saved; please retry shortly." });
      return null;
    }
    const job: ScanJob = { id: crypto.randomUUID(), scope, createdAt: now };
    this.jobs.set(job.id, job);
    response.status(202).json(this.snapshot(job));
    let status = 200;
    const collector = {
      status(code: number) { status = code; return collector; },
      json: (result: unknown) => {
        job.result = result;
        job.resultStatus = status;
        job.completedAt = Date.now();
        return collector;
      },
    };
    return collector as unknown as Response;
  }

  private snapshot(job: ScanJob) {
    return {
      scan_job_id: job.id,
      status: job.completedAt ? "complete" : "processing",
      ...(job.completedAt ? { result_status: job.resultStatus, result: job.result } : {}),
    };
  }
}

export const documentScanJobs = new DocumentScanJobs();
