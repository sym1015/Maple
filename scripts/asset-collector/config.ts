import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// Load .env from the project root if present (Node >= 20.12). Real env vars win.
const envFile = path.join(ROOT, ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name} 가 없습니다. .env.example 을 .env 로 복사해서 값을 채워 주세요.`);
  }
  return value.replace(/\/+$/, "");
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`환경변수 ${name} 값이 숫자가 아닙니다: ${raw}`);
  return n;
}

export const config = {
  root: ROOT,
  apiBase: required("MAPLE_API_BASE"),
  region: required("MAPLE_REGION"),
  version: required("MAPLE_VERSION"),
  concurrency: Math.max(1, int("ASSET_CONCURRENCY", 3)),
  delayMs: int("ASSET_DELAY_MS", 150),
  retries: int("ASSET_RETRIES", 3),
  timeoutMs: int("ASSET_TIMEOUT_MS", 30000),
};

/** `${MAPLE_API_BASE}/${MAPLE_REGION}/${MAPLE_VERSION}` */
export const versionedBase = `${config.apiBase}/${config.region}/${config.version}`;
