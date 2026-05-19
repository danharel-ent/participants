import type { RedeemRecord, RedeemStore } from "./redeems-store-types";

/**
 * GitHub-backed redeem store.
 * Persists `data/redeems.json` in the repo via the GitHub Contents API.
 *
 * Why GitHub?
 *  - Vercel's runtime FS is read-only, so we cannot write to the project files
 *    directly at runtime. Committing via the GitHub API gives us durable storage
 *    inside the project repo (the user's explicit preference: "ננהל את כל המידע
 *    בפרוייקט"). Every redeem is auditable in git history.
 *  - Commit messages include `[skip ci]` so they do NOT trigger Vercel deploys.
 *
 * Concurrency
 *  - Per-instance mutex serializes writes inside one Vercel instance.
 *  - SHA-based optimistic concurrency handles cross-instance races (other
 *    instances writing in parallel). On 409/422 we refetch and retry up to 3
 *    times.
 *
 * Caching
 *  - Reads cached for `READ_CACHE_TTL_MS` to avoid burning the 5,000 req/hour
 *    authenticated rate limit when clients poll every 2.5s.
 */

const READ_CACHE_TTL_MS = 4000;
const MAX_WRITE_RETRIES = 3;

type GhConfig = {
  token: string;
  repo: string; // owner/name
  branch: string;
  path: string;
  authorName: string;
  authorEmail: string;
};

function readGhConfig(): GhConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (!token || !repo) return null;
  return {
    token,
    repo,
    branch: process.env.GITHUB_BRANCH?.trim() || "main",
    path: process.env.GITHUB_REDEEMS_PATH?.trim() || "data/redeems.json",
    authorName: process.env.GITHUB_COMMIT_NAME?.trim() || "WineNot Ops Bot",
    authorEmail: process.env.GITHUB_COMMIT_EMAIL?.trim() || "ops@winenot.local",
  };
}

type GhFile = { records: RedeemRecord[]; sha: string | null; fetchedAt: number };

class GhApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`GitHub API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

async function ghFetch(
  cfg: GhConfig,
  pathname: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "winenot-ops-bot",
      ...(init?.headers || {}),
    },
  });
}

function base64Encode(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  // Fallback for runtimes without Buffer.
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64Decode(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function readRemote(cfg: GhConfig): Promise<{ records: RedeemRecord[]; sha: string | null }> {
  const url = `/repos/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}?ref=${encodeURIComponent(
    cfg.branch
  )}`;
  const res = await ghFetch(cfg, url);
  if (res.status === 404) {
    return { records: [], sha: null };
  }
  if (!res.ok) {
    throw new GhApiError(res.status, await res.text());
  }
  const json = (await res.json()) as { content?: string; sha: string };
  if (!json.content) return { records: [], sha: json.sha };
  const text = base64Decode(json.content.replace(/\n/g, ""));
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { records: parsed as RedeemRecord[], sha: json.sha };
    return { records: [], sha: json.sha };
  } catch {
    return { records: [], sha: json.sha };
  }
}

async function writeRemote(
  cfg: GhConfig,
  records: RedeemRecord[],
  sha: string | null,
  message: string
): Promise<string | null> {
  const url = `/repos/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`;
  const content = base64Encode(JSON.stringify(records, null, 2) + "\n");
  const body: Record<string, unknown> = {
    message: `${message} [skip ci]`,
    branch: cfg.branch,
    content,
    committer: { name: cfg.authorName, email: cfg.authorEmail },
    author: { name: cfg.authorName, email: cfg.authorEmail },
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(cfg, url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new GhApiError(res.status, await res.text());
  }
  const out = (await res.json()) as { content?: { sha: string } };
  return out.content?.sha ?? null;
}

const CACHE_GLOBAL_KEY = "__participants_redeems_github_cache__";
const MUTEX_GLOBAL_KEY = "__participants_redeems_github_mutex__";

function getCacheSlot(): { cache: GhFile | null } {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[CACHE_GLOBAL_KEY]) g[CACHE_GLOBAL_KEY] = { cache: null };
  return g[CACHE_GLOBAL_KEY] as { cache: GhFile | null };
}

function getMutex(): { chain: Promise<unknown> } {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[MUTEX_GLOBAL_KEY]) g[MUTEX_GLOBAL_KEY] = { chain: Promise.resolve() };
  return g[MUTEX_GLOBAL_KEY] as { chain: Promise<unknown> };
}

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const mutex = getMutex();
  const next = mutex.chain.then(
    () => fn(),
    () => fn()
  );
  mutex.chain = next.catch(() => {});
  return next;
}

async function readCached(cfg: GhConfig, force = false): Promise<GhFile> {
  const slot = getCacheSlot();
  const now = Date.now();
  if (!force && slot.cache && now - slot.cache.fetchedAt < READ_CACHE_TTL_MS) {
    return slot.cache;
  }
  try {
    const fresh = await readRemote(cfg);
    slot.cache = { ...fresh, fetchedAt: now };
    return slot.cache;
  } catch (err) {
    // Graceful degradation: if GitHub is briefly unavailable but we have a
    // previously cached snapshot, return it so the UI doesn't go blank.
    // Writes still surface errors because they call readCached(force=true)
    // and need an accurate SHA.
    if (!force && slot.cache) {
      return slot.cache;
    }
    throw err;
  }
}

function isRetryableConflict(err: unknown): boolean {
  if (err instanceof GhApiError) return err.status === 409 || err.status === 422;
  return false;
}

export function createGithubStore(): RedeemStore | null {
  const cfg = readGhConfig();
  if (!cfg) return null;

  return {
    type: "github",
    async listKeys() {
      const file = await readCached(cfg);
      return file.records.map((r) => r.key);
    },
    async listRecords() {
      const file = await readCached(cfg);
      return [...file.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async addRedeem(record) {
      return serialize(async () => {
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
          const { records, sha } = await readCached(cfg, attempt > 0);
          const existing = records.find((r) => r.key === record.key);
          if (existing) return { created: false, record: existing };
          const next = [...records, record];
          try {
            const label = record.שם || record.אירוע || record.key.slice(0, 16);
            const newSha = await writeRemote(cfg, next, sha, `redeem: +${label}`);
            getCacheSlot().cache = {
              records: next,
              sha: newSha,
              fetchedAt: Date.now(),
            };
            return { created: true, record };
          } catch (err) {
            lastErr = err;
            if (!isRetryableConflict(err)) throw err;
          }
        }
        throw lastErr ?? new Error("GitHub write failed after retries");
      });
    },
    async removeRedeem(key) {
      return serialize(async () => {
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
          const { records, sha } = await readCached(cfg, attempt > 0);
          const target = records.find((r) => r.key === key);
          if (!target) return false;
          const next = records.filter((r) => r.key !== key);
          try {
            const label = target.שם || key.slice(0, 16);
            const newSha = await writeRemote(cfg, next, sha, `redeem: -${label}`);
            getCacheSlot().cache = {
              records: next,
              sha: newSha,
              fetchedAt: Date.now(),
            };
            return true;
          } catch (err) {
            lastErr = err;
            if (!isRetryableConflict(err)) throw err;
          }
        }
        throw lastErr ?? new Error("GitHub write failed after retries");
      });
    },
    async clear() {
      return serialize(async () => {
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
          const { sha } = await readCached(cfg, attempt > 0);
          try {
            const newSha = await writeRemote(cfg, [], sha, `redeems: reset`);
            getCacheSlot().cache = {
              records: [],
              sha: newSha,
              fetchedAt: Date.now(),
            };
            return;
          } catch (err) {
            lastErr = err;
            if (!isRetryableConflict(err)) throw err;
          }
        }
        throw lastErr ?? new Error("GitHub write failed after retries");
      });
    },
  };
}
