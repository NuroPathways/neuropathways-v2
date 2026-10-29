import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithServiceRecovery, serviceResponseMessage, scanParentDocument, getParentDocumentContent } from "@workspace/api-client-react";
import { functions, integrations } from "./entities";

const html = '<!DOCTYPE html><html><head><title>Your app is starting…</title><style>font-format: swap</style></head><body>__replco_starting</body></html>';
const starting = (status = 503) => new Response(html, { status, headers: { "Content-Type": "text/html" } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("document request startup recovery", () => {
  it.each(["X-Parent-Token", "X-Family-Token"])("preserves %s authorization through generated parent scan recovery", async (header) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(starting()).mockResolvedValueOnce(json({ ok: true, supportCards: [] }));
    vi.stubGlobal("fetch", fetcher);
    const operation = scanParentDocument("child-1", "document-1", { headers: { [header]: "synthetic" }, credentials: "include" });
    await vi.runAllTimersAsync();
    expect(await operation).toHaveProperty("ok", true);
    expect(fetcher.mock.calls[1][0]).toContain("/children/child-1/documents/document-1/scan");
    expect(fetcher.mock.calls[1][1].headers.get(header)).toBe("synthetic");
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
  });

  it("rejects a wrong HTML route rather than reporting a generated scan as successful", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Wrong route</html>", { headers: { "Content-Type": "text/html" } })));
    await expect(scanParentDocument("child-1", "doc-1")).rejects.toHaveProperty("code", "SERVICE_UNAVAILABLE");
  });

  it("keeps authenticated original file downloads binary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.4 synthetic original", { headers: { "Content-Type": "application/pdf" } })));
    const original = await getParentDocumentContent("doc-1", { headers: { "X-Parent-Token": "synthetic" }, responseType: "blob" });
    expect(await original.text()).toBe("%PDF-1.4 synthetic original");
  });

  it("replays a rejected clinician scan with its original selected document and credentials", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(starting()).mockResolvedValueOnce(json({ scanned: ["document-1"] }));
    vi.stubGlobal("fetch", fetcher);
    const operation = functions.invoke("buildClientProfile", { child_id: "child-1", source_document_id: "document-1" });
    await vi.runAllTimersAsync();
    expect(await operation).toEqual({ data: { scanned: ["document-1"] } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(fetcher.mock.calls[1][1].credentials).toBe("include");
  });

  it("preserves multipart bytes when an upload encounters a startup page", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(starting(200)).mockResolvedValueOnce(json({ file_url: "/api/uploads/test.pdf" }));
    vi.stubGlobal("fetch", fetcher);
    const operation = integrations.Core.UploadFile({ file: new File(["pdf bytes"], "test.pdf", { type: "application/pdf" }) });
    await vi.runAllTimersAsync();
    expect(await operation).toHaveProperty("file_url");
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[1][1].body.get("file").name).toBe("test.pdf");
  });

  it("bounds retries and gives a safe retryable error without HTML", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => starting());
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(fetchWithServiceRecovery("/api/build-client-profile", { method: "POST", body: "{}" }))
      .rejects.toMatchObject({ code: "SERVICE_STARTING", status: 503, retryable: true });
    await vi.runAllTimersAsync();
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(serviceResponseMessage(html)).not.toContain("<html");
  });

  it("does not replay JSON file failures or lose their structured details", async () => {
    const response = json({ error: { code: "invalid_pdf" }, failed: [{ id: "d1" }] }, 422);
    const fetcher = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchWithServiceRecovery("/api/scan", { method: "POST" });
    expect(result.status).toBe(422);
    expect(await result.json()).toHaveProperty("failed", [{ id: "d1" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sanitizes generic gateway HTML without replaying an ambiguous write", async () => {
    const fetcher = vi.fn(async () => new Response("<!DOCTYPE html><html>Gateway timeout</html>", { status: 504, headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchWithServiceRecovery("/api/scan", { method: "POST" }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not mistake an HTML success page for a successful JSON scan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html>Wrong route</html>", { headers: { "Content-Type": "text/html" } })));
    await expect(fetchWithServiceRecovery("/api/scan")).rejects.toHaveProperty("code", "SERVICE_UNAVAILABLE");
  });

  it("recognizes startup HTML even when an intermediary labels it as plain text", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 503, headers: { "Content-Type": "text/plain" } }))
      .mockResolvedValueOnce(json({ ready: true }));
    vi.stubGlobal("fetch", fetcher);
    const operation = fetchWithServiceRecovery("/api/scan");
    await vi.runAllTimersAsync();
    expect(await (await operation).json()).toEqual({ ready: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves authorized HTML attachment downloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Attachment</html>", { headers: { "Content-Type": "text/html" } })));
    const response = await fetchWithServiceRecovery("/api/documents/content", {}, false);
    expect(await response.text()).toBe("<html>Attachment</html>");
  });

  it("does not automatically replay a network error after a potentially accepted scan", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchWithServiceRecovery("/api/scan", { method: "POST" })).rejects.toThrow("Failed to fetch");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels startup recovery when the caller aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn(async () => starting());
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(fetchWithServiceRecovery("/api/scan", { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
