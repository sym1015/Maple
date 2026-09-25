import { config } from "./config";

export interface HttpResult {
  url: string;
  ok: boolean;
  /** 0 when no HTTP response was received (DNS failure, timeout, reset). */
  status: number;
  contentType: string;
  /** Access-Control-Allow-Origin response header, if any. */
  cors?: string;
  body: Buffer;
  attempts: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry on network errors, 429 and 5xx; never on other 4xx. */
function retryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

export async function request(url: string, opts: { retries?: number } = {}): Promise<HttpResult> {
  const retries = opts.retries ?? config.retries;
  let last: HttpResult | undefined;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
      const body = Buffer.from(await res.arrayBuffer());
      last = {
        url,
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        cors: res.headers.get("access-control-allow-origin") ?? undefined,
        body,
        attempts: attempt,
      };
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      last = {
        url,
        ok: false,
        status: 0,
        contentType: "",
        body: Buffer.alloc(0),
        attempts: attempt,
        error: e.cause?.code ?? e.name ?? String(err),
      };
    }
    if (last.ok || !retryable(last.status) || attempt > retries) break;
    // Exponential backoff with jitter: 1s, 2s, 4s ... (+0-250ms)
    await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 250);
  }
  return last!;
}
