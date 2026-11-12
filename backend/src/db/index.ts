import { MongoClient, MongoServerError } from "mongodb";
import { config } from "../config.js";

if (!config.mongoUri) {
  throw new Error("MONGODB_URL environment variable is missing.");
}

export const client = new MongoClient(config.mongoUri);

export const DB_NAME = "pr_hawk";

export const COLLECTIONS = {
  conventions: "conventions",
  customConventions: "custom_conventions",
  conventionConfigurations: "convention_configurations",
} as const;

/**
 * Repository names are case-insensitive on GitHub. Queries and unique indexes
 * share this collation; a query only uses an index with the same collation.
 */
export const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

export function db() {
  return client.db(DB_NAME);
}

/**
 * One document per scope (or per installation + repository). Without these,
 * two concurrent upserts for the same key can both insert, and later reads
 * return whichever copy comes first.
 */
const UNIQUE_INDEXES = [
  { collection: COLLECTIONS.conventions, key: { userId: 1 }, name: "scope_unique" },
  { collection: COLLECTIONS.customConventions, key: { scope: 1 }, name: "scope_unique" },
  {
    collection: COLLECTIONS.conventionConfigurations,
    key: { installationId: 1, repository: 1 },
    name: "installation_repository_unique",
  },
] as const;

export function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

/**
 * Runs an upsert, retrying once if a concurrent upsert inserted the same key
 * first. The retry finds that document and updates it instead.
 */
export async function upsertWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    return operation();
  }
}

async function ensureIndexes(): Promise<void> {
  for (const index of UNIQUE_INDEXES) {
    try {
      await db().collection(index.collection).createIndex(index.key, {
        name: index.name,
        unique: true,
        collation: CASE_INSENSITIVE,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new Error(
          `Cannot create unique index on '${index.collection}': duplicate documents exist. ` +
            "Run `npm run db:dedupe` to list them and `npm run db:dedupe -- --fix` to merge them.",
        );
      }
      throw err;
    }
  }
}

/**
 * Connects, checks the server answers, and creates indexes. Called before the
 * server listens so a bad MONGODB_URL fails the deploy instead of the first
 * webhook. createIndex is a no-op when an identical index already exists.
 */
export async function initDb(): Promise<void> {
  await client.connect();
  await db().command({ ping: 1 });
  await ensureIndexes();
}
