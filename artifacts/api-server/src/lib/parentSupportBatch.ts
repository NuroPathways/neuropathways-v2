export type BatchOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export interface ParentSupportBatchOptions<T> {
  concurrency?: number;
  retries?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  onProgress?: (completed: number, total: number, item: T) => void | Promise<void>;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return /429|rate.?limit|quota/i.test(String(error));
  }

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };
  return candidate.status === 429 ||
    candidate.statusCode === 429 ||
    /429|rate.?limit|quota/i.test(
      typeof candidate.message === "string" ? candidate.message : "",
    );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Keep model requests bounded, retry only transient rate limits, and retain
 * successful results when one plan target cannot be generated.
 */
export async function batchProcessParentSupport<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: ParentSupportBatchOptions<T> = {},
): Promise<BatchOutcome<R>[]> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
  const retries = Math.max(0, Math.floor(options.retries ?? 5));
  const minTimeoutMs = Math.max(0, options.minTimeoutMs ?? 2_000);
  const maxTimeoutMs = Math.max(minTimeoutMs, options.maxTimeoutMs ?? 30_000);
  const outcomes = new Array<BatchOutcome<R>>(items.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;

      const item = items[index];
      let outcome: BatchOutcome<R>;
      for (let attempt = 0; ; attempt++) {
        try {
          outcome = { ok: true, value: await processor(item, index) };
          break;
        } catch (error) {
          if (!isRateLimitError(error) || attempt >= retries) {
            outcome = { ok: false, error };
            break;
          }
          await delay(Math.min(minTimeoutMs * 2 ** attempt, maxTimeoutMs));
        }
      }

      outcomes[index] = outcome;
      completed++;
      await options.onProgress?.(completed, items.length, item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return outcomes;
}
