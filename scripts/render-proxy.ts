/**
 * Dev/preview-server proxy for character renders.
 *
 *   GET /render/character/{skinId}/{itemIds}/{action}/{frame}.png
 *     → ${MAPLE_API_BASE}/${region}/${version}/Character/{skinId}/{itemIds}/{action}/{frame}
 *   GET /render/character/{center|navelCenter|feetCenter}/{skinId}/{itemIds}/{action}/{frame}.png
 *     → …/Character/{variant}/{skinId}/{itemIds}/{action}/{frame}
 *   GET /render/actions/{itemIds}.json
 *     → ${MAPLE_API_BASE}/${region}/${version}/Character/actions/{itemIds}
 *     (verified: JSON array of action names; 500 when no item ids are given)
 *
 * Why: the API composites body, head and equipment in the game's layer order (zmap), but
 * its responses carry no CORS header, so the browser cannot fetch them for PNG export.
 * Serving them same-origin fixes that; each result is cached under assets/renders/ so a
 * combination is only requested from the API once.
 *
 * region/version are taken from data/manifest.json (written by `npm run assets:collect`)
 * so renders always match the collected items. Only digits / plain action names are
 * accepted, so the proxy cannot be used to reach other URLs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";

const ACTIONS_ROUTE = /^\/render\/actions\/(\d{1,8}(?:,\d{1,8}){0,39})\.json$/;
// Optional positioning variant (verified: center, navelCenter, feetCenter return image/png).
const ROUTE = /^\/render\/character\/(?:(center|navelCenter|feetCenter)\/)?(\d{1,6})\/(\d{1,8}(?:,\d{1,8}){0,39})?\/([A-Za-z][A-Za-z0-9]{0,23})\/(\d{1,2})\.png$/;
const MAX_PARALLEL = 2;
const TIMEOUT_MS = 30_000;

interface Options {
  root: string;
  apiBase: string | undefined;
}

function send(res: ServerResponse, status: number, body: Buffer | string, type = "text/plain; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

export function renderProxy({ root, apiBase }: Options): Plugin {
  const inFlight = new Map<string, Promise<Buffer>>();
  let active = 0;
  const waiting: (() => void)[] = [];

  async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  function readVersion(): string | null {
    const file = path.join(root, "data", "manifest.json");
    if (!existsSync(file)) return null;
    const version = (JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }).version;
    return typeof version === "string" && /^[A-Za-z]+\/[\w.]+$/.test(version) ? version : null;
  }

  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/render/")) return next();
    const actions = ACTIONS_ROUTE.exec(url);
    const m = ROUTE.exec(url);
    if (!m && !actions) return send(res, 400, "잘못된 렌더 주소입니다.");

    if (!apiBase) return send(res, 503, "MAPLE_API_BASE 가 설정되지 않았습니다 (.env 확인).");
    const version = readVersion();
    if (!version) return send(res, 503, "data/manifest.json 이 없습니다. 먼저 npm run assets:collect 를 실행하세요.");
    const api = `${apiBase.replace(/\/+$/, "")}/${version}/Character`;
    const cacheDir = path.join(root, "assets", "renders", version.replace("/", "-"));

    let upstream: string, cacheFile: string, expectType: string;
    if (actions) {
      const items = actions[1];
      upstream = `${api}/actions/${items}`;
      cacheFile = path.join(cacheDir, `actions_${items.replaceAll(",", "-")}.json`);
      expectType = "application/json";
    } else {
      const [, variant, skin, items = "", action, frame] = m!;
      // Positioned renders were only verified with items; the base skin URL has no variant form.
      if (variant && !items) return send(res, 400, "기준점 렌더에는 아이템이 하나 이상 필요합니다.");
      upstream = items
        ? `${api}/${variant ? `${variant}/` : ""}${skin}/${items}/${action}/${frame}`
        : `${api}/${skin}`;
      cacheFile = path.join(
        cacheDir,
        `${variant ? `${variant}_` : ""}${skin}_${items.replaceAll(",", "-") || "base"}_${action}_${frame}.png`,
      );
      expectType = "image/png";
    }

    if (existsSync(cacheFile)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return send(res, 200, readFileSync(cacheFile), expectType);
    }

    let pending = inFlight.get(cacheFile);
    if (!pending) {
      pending = limited(async () => {
        const r = await fetch(upstream, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = Buffer.from(await r.arrayBuffer());
        const type = r.headers.get("content-type") ?? "";
        if (!r.ok || !type.startsWith(expectType)) {
          throw Object.assign(new Error(`API ${r.status} ${type}: ${upstream}`), { status: r.status });
        }
        mkdirSync(path.dirname(cacheFile), { recursive: true });
        writeFileSync(cacheFile, body);
        return body;
      }).finally(() => inFlight.delete(cacheFile));
      inFlight.set(cacheFile, pending);
    }

    pending
      .then((body) => send(res, 200, body, expectType))
      .catch((err: Error & { status?: number }) => {
        console.warn(`[render-proxy] ${err.message}`);
        send(res, err.status === 404 ? 404 : 502, `캐릭터 렌더 실패: ${err.message}`);
      });
  };

  return {
    name: "maple-render-proxy",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}
