import { config } from "./config";
import { request } from "./http";

export class ApiError extends Error {
  constructor(public url: string, public status: number, detail?: string) {
    super(`${url} → HTTP ${status || "(응답 없음)"}${detail ? ` [${detail}]` : ""}`);
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await request(url);
  if (!res.ok) throw new ApiError(url, res.status, res.error);
  return JSON.parse(res.body.toString("utf8")) as T;
}

interface WzEntry {
  region: string;
  mapleVersionId: string;
  isReady?: boolean;
  hasImages?: boolean;
}

/**
 * Resolve `${MAPLE_API_BASE}/${MAPLE_REGION}/${MAPLE_VERSION}`.
 * The API no longer accepts "latest" (404), so "latest" is resolved to the newest
 * numeric version for that region listed by GET /wz with isReady && hasImages.
 */
export async function resolveBase(): Promise<{ base: string; region: string; version: string }> {
  let { region, version } = config;
  if (version.toLowerCase() === "latest") {
    const wz = await getJson<WzEntry[]>(`${config.apiBase}/wz`);
    const candidates = wz
      .filter((e) => e.region.toLowerCase() === region.toLowerCase() && e.isReady && e.hasImages)
      .map((e) => e.mapleVersionId)
      .filter((v) => Number.isFinite(Number(v)))
      .sort((a, b) => Number(b) - Number(a));
    if (!candidates.length) {
      const regions = [...new Set(wz.map((e) => e.region))].join(", ");
      throw new Error(`/wz 에서 ${region} 지역의 사용 가능한 버전을 찾지 못했습니다. 사용 가능한 지역: ${regions}`);
    }
    version = candidates[0];
  }
  return { base: `${config.apiBase}/${region}/${version}`, region, version };
}
