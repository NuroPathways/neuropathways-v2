import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDocumentScan } from "../../../../lib/api-client-react/src/document-scan";
import { functions } from "./entities";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("short-lived document scan requests", () => {
  it("routes clinician scans through the job flow using their signed-in cookie and selected document", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ scan_job_id: "clinician-job", status: "processing" }, 202))
      .mockResolvedValueOnce(json({
        scan_job_id: "clinician-job", status: "complete", result_status: 200,
        result: { scanned: ["clinician-doc"], failed: [] },
      }));
    vi.stubGlobal("fetch", fetcher);
    const operation = functions.invoke("buildClientProfile", {
      child_id: "clinical-child", source_document_id: "clinician-doc", force_rebuild: true,
    });
    await vi.runAllTimersAsync();
    expect(await operation).toEqual({ data: { scanned: ["clinician-doc"], failed: [] } });
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe("/api/build-client-profile");
      expect(init.credentials).toBe("include");
      expect(JSON.parse(init.body)).toMatchObject({
        child_id: "clinical-child", source_document_id: "clinician-doc", force_rebuild: true, async_scan: true,
      });
    }
    expect(JSON.parse(fetcher.mock.calls[1][1].body).scan_job_id).toBe("clinician-job");
  });
  it("polls the same job across a lengthy scan without starting it twice", async () => {
    vi.useFakeTimers();
    const processing = { scan_job_id: "job-1", status: "processing" };
    const fetcher = vi.fn().mockResolvedValueOnce(json(processing, 202))
      .mockResolvedValueOnce(json(processing)).mockResolvedValueOnce(json({
        scan_job_id: "job-1", status: "complete", result_status: 200, result: { scanned: ["doc"] },
      }));
    vi.stubGlobal("fetch", fetcher);
    const operation = fetchDocumentScan("/api/build-client-profile", {
      method: "POST", credentials: "include", headers: { "X-Family-Token": "synthetic" },
      body: JSON.stringify({ child_id: "child", source_document_id: "doc" }),
    });
    await vi.runAllTimersAsync();
    expect(await (await operation).json()).toEqual({ scanned: ["doc"] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).scan_job_id).toBeUndefined();
    for (const [, init] of fetcher.mock.calls.slice(1)) {
      expect(JSON.parse(init.body)).toMatchObject({ child_id: "child", source_document_id: "doc", scan_job_id: "job-1" });
      expect(new Headers(init.headers).get("X-Family-Token")).toBe("synthetic");
      expect(init.credentials).toBe("include");
    }
  });

  it("preserves real scan failures instead of turning HTTP 202 into a success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      scan_job_id: "job-1", status: "complete", result_status: 422,
      result: { error: "Synthetic unreadable file" },
    })));
    const response = await fetchDocumentScan("/scan", { method: "POST" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Synthetic unreadable file" });
  });

  it("retries a lost progress request with the same ID, never another start", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ scan_job_id: "job", status: "processing" }, 202))
      .mockRejectedValueOnce(new TypeError("Synthetic connection interruption"))
      .mockResolvedValueOnce(json({ scan_job_id: "job", status: "complete", result_status: 200, result: { ok: true } }));
    vi.stubGlobal("fetch", fetcher);
    const operation = fetchDocumentScan("/scan", { method: "POST" });
    await vi.runAllTimersAsync();
    expect(await (await operation).json()).toEqual({ ok: true });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).scan_job_id).toBe("job");
    expect(JSON.parse(fetcher.mock.calls[2][1].body).scan_job_id).toBe("job");
  });
});
