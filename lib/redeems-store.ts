import { createGithubStore } from "./redeems-store-github";
import type {
  RedeemRecord,
  RedeemStore,
  RedeemStoreType,
} from "./redeems-store-types";

export type { RedeemRecord, RedeemStore, RedeemStoreType };

const MEMORY_KEYS = "__participants_redeems_keys__";
const MEMORY_RECORDS = "__participants_redeems_records__";

function getKeysSet(): Set<string> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[MEMORY_KEYS]) g[MEMORY_KEYS] = new Set<string>();
  return g[MEMORY_KEYS] as Set<string>;
}

function getRecordsMap(): Map<string, RedeemRecord> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[MEMORY_RECORDS]) g[MEMORY_RECORDS] = new Map<string, RedeemRecord>();
  return g[MEMORY_RECORDS] as Map<string, RedeemRecord>;
}

function createMemoryStore(): RedeemStore {
  return {
    type: "memory",
    async listKeys() {
      return [...getKeysSet()];
    },
    async listRecords() {
      return [...getRecordsMap().values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    },
    async addRedeem(record) {
      const set = getKeysSet();
      const records = getRecordsMap();
      const before = set.size;
      set.add(record.key);
      const created = set.size > before;
      const stored = records.get(record.key) ?? record;
      if (created) records.set(record.key, record);
      return { created, record: stored };
    },
    async removeRedeem(key) {
      const set = getKeysSet();
      const records = getRecordsMap();
      const had = set.delete(key);
      records.delete(key);
      return had;
    },
    async clear() {
      getKeysSet().clear();
      getRecordsMap().clear();
    },
  };
}

function recordKey(key: string) {
  return `participants:redeem:record:${key}`;
}

async function createRedisStore(): Promise<RedeemStore | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({ url, token });
  const setKey = "participants:redeems:keys";

  async function fetchRecords(keys: string[]): Promise<RedeemRecord[]> {
    if (keys.length === 0) return [];
    const recordKeys = keys.map(recordKey);
    const raw = (await redis.mget<(RedeemRecord | string | null)[]>(...recordKeys)) || [];
    const out: RedeemRecord[] = [];
    raw.forEach((value, i) => {
      const key = keys[i];
      if (!value) {
        out.push({ key, createdAt: new Date(0).toISOString() });
        return;
      }
      if (typeof value === "string") {
        try {
          out.push(JSON.parse(value) as RedeemRecord);
          return;
        } catch {
          out.push({ key, createdAt: new Date(0).toISOString() });
          return;
        }
      }
      out.push(value as RedeemRecord);
    });
    return out;
  }

  return {
    type: "redis",
    async listKeys() {
      const keys = await redis.smembers<string[]>(setKey);
      return Array.isArray(keys) ? keys : [];
    },
    async listRecords() {
      const keys = await redis.smembers<string[]>(setKey);
      const safe = Array.isArray(keys) ? keys : [];
      const records = await fetchRecords(safe);
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async addRedeem(record) {
      const added = await redis.sadd(setKey, record.key);
      if (added > 0) {
        await redis.set(recordKey(record.key), JSON.stringify(record), {
          ex: 60 * 60 * 24 * 60,
        });
        return { created: true, record };
      }
      const existing = await redis.get<RedeemRecord | string | null>(recordKey(record.key));
      if (existing && typeof existing === "string") {
        try {
          return { created: false, record: JSON.parse(existing) as RedeemRecord };
        } catch {
          // fall through
        }
      }
      return {
        created: false,
        record: (existing as RedeemRecord) ?? record,
      };
    },
    async removeRedeem(key) {
      const removed = await redis.srem(setKey, key);
      await redis.del(recordKey(key));
      return removed > 0;
    },
    async clear() {
      const keys = (await redis.smembers<string[]>(setKey)) || [];
      if (keys.length > 0) {
        const recordKeys = keys.map(recordKey);
        await redis.del(setKey, ...recordKeys);
      } else {
        await redis.del(setKey);
      }
    },
  };
}

let cachedStorePromise: Promise<RedeemStore> | null = null;

/**
 * Persistence priority:
 *   1. GitHub (durable in repo, auditable, default for this project)
 *   2. Upstash Redis (alternative for high-volume scenarios)
 *   3. Memory (development only — volatile across cold starts!)
 */
export function getRedeemStore(): Promise<RedeemStore> {
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      const github = createGithubStore();
      if (github) return github;
      const redis = await createRedisStore();
      if (redis) return redis;
      return createMemoryStore();
    })();
  }
  return cachedStorePromise;
}
