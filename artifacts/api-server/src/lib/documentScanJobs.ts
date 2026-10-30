import crypto from "node:crypto";
import type { Response } from "express";

type ScanJob = {
  id: string;
  scope: string;
  createdAt: number;
  completedAt?: number;
  resultStatus?: number;
  result?: unknown;
  stage: string;
  controller: AbortController;
};

// Only transport state lives here. The existing scan continues to persist its
// findings and enforce sharing/review rules in the normal database tables.
export class DocumentScanJobs {
  private jobs = new Map<string, ScanJob>();
  constructor(private readonly deadlineMs = 6 * 60_000) {}

  cancelDocument(documentId: string) {
    for (const job of this.jobs.values()) {
      if (!job.completedAt && JSON.parse(job.scope).includes(documentId)) {
        job.controller.abort();
        job.resultStatus = 409;
        job.result = { error: { message: "The document was deleted. This scan has been stopped." } };
        job.completedAt = Date.now();
        job.stage = "Stopped";
      }
    }
  }

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
    const job: ScanJob = { id: crypto.randomUUID(), scope, createdAt: now, stage: "Reading document", controller: new AbortController() };
    this.jobs.set(job.id, job);
    response.status(202).json(this.snapshot(job));
    let status = 200;
    const timer = setTimeout(() => {
      if (job.completedAt) return;
      job.controller.abort();
      job.resultStatus = 503;
      job.result = { error: { code: "scan_timeout", message: "The document reader took too long to finish. Your file and previous findings are saved. Retry Scan to start another attempt." } };
      job.stage = "Timed out";
      job.completedAt = Date.now();
    }, this.deadlineMs);
    timer.unref();
    const collector = {
      locals: {
        documentScanSignal: job.controller.signal,
        setScanStage: (stage: string) => { if (!job.completedAt) job.stage = stage; },
      },
      status(code: number) { status = code; return collector; },
      json: (result: unknown) => {
        if (job.completedAt) return collector;
        clearTimeout(timer);
        job.result = result;
        job.resultStatus = status;
        job.completedAt = Date.now();
        job.stage = status >= 400 ? "Failed" : "Finished";
        return collector;
      },
    };
    return collector as unknown as Response;
  }

  private snapshot(job: ScanJob) {
    return {
      scan_job_id: job.id,
      status: job.completedAt ? "complete" : "processing",
      stage: job.stage,
      started_at: new Date(job.createdAt).toISOString(),
      ...(job.completedAt ? { result_status: job.resultStatus, result: job.result } : {}),
    };
  }
}

export const documentScanJobs = new DocumentScanJobs();
