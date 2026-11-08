export class AiOperationalError extends Error {
  constructor(
    message: string,
    readonly code: "ai_disabled" | "ai_rate_limited" | "ai_capacity_limited",
    readonly status: number,
  ) {
    super(message);
    this.name = "AiOperationalError";
  }
}

type AiControlsOptions = {
  isDisabled?: () => boolean;
  maxRequestsPerActor?: number;
  windowMs?: number;
  maxInFlight?: number;
  now?: () => number;
};

export class AiOperationalControls {
  private readonly requestTimesByActor = new Map<string, number[]>();
  private activeRequests = 0;
  private readonly isDisabled: () => boolean;
  private readonly maxRequestsPerActor: number;
  private readonly windowMs: number;
  private readonly maxInFlight: number;
  private readonly now: () => number;

  constructor(options: AiControlsOptions = {}) {
    this.isDisabled = options.isDisabled ?? (() => process.env.NEUROPATH_AI_DISABLED === "true");
    this.maxRequestsPerActor = options.maxRequestsPerActor ?? 60;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.maxInFlight = options.maxInFlight ?? 8;
    this.now = options.now ?? Date.now;
  }

  async run<T>(actorId: string | null | undefined, operation: () => Promise<T>): Promise<T> {
    if (this.isDisabled()) {
      throw new AiOperationalError(
        "AI processing is temporarily disabled by the administrator. Saved information is unchanged.",
        "ai_disabled",
        503,
      );
    }
    if (this.activeRequests >= this.maxInFlight) {
      throw new AiOperationalError(
        "AI processing is temporarily busy. Please wait and try again.",
        "ai_capacity_limited",
        429,
      );
    }

    const now = this.now();
    const key = actorId?.trim() || "unattributed";
    const recent = (this.requestTimesByActor.get(key) || [])
      .filter((timestamp) => timestamp > now - this.windowMs);
    if (recent.length >= this.maxRequestsPerActor) {
      this.requestTimesByActor.set(key, recent);
      throw new AiOperationalError(
        "The AI request limit has been reached. Please wait before trying again.",
        "ai_rate_limited",
        429,
      );
    }

    this.requestTimesByActor.set(key, [...recent, now]);
    if (this.requestTimesByActor.size > 10_000) {
      for (const [actor, timestamps] of this.requestTimesByActor) {
        if (!timestamps.some((timestamp) => timestamp > now - this.windowMs)) {
          this.requestTimesByActor.delete(actor);
        }
      }
    }

    this.activeRequests += 1;
    try {
      return await operation();
    } finally {
      this.activeRequests -= 1;
    }
  }
}

export const aiOperationalControls = new AiOperationalControls();
