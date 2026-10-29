import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
export type Dialect = "sqlite" | "postgres";
// int8 (COUNT/SUM) and numeric come back as strings by default.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
const tables = (d: Dialect) => {
  const real = d === "postgres" ? "DOUBLE PRECISION" : "REAL";
  const valid =
    d === "postgres"
      ? "CHECK((data::jsonb) IS NOT NULL)"
      : "CHECK(json_valid(data))";
  const date =
    d === "postgres"
      ? "((data::jsonb->>'date'))"
      : "json_extract(data,'$.date')";
  return [
    "CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, policies TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','rep')), manager_id TEXT REFERENCES users(id), territory_id TEXT, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id,email))",
    "CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL)",
    `CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL ${valid}, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
    "CREATE INDEX IF NOT EXISTS records_scope ON records(tenant_id,kind,owner_id,status,deleted)",
    `CREATE UNIQUE INDEX IF NOT EXISTS day_unique ON records(tenant_id,kind,owner_id,${date}) WHERE deleted=0 AND kind IN ('dayplan','tourplan','dcr')`,
    "CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES records(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS decisions_tenant ON decisions(tenant_id,record_id)",
    "CREATE TABLE IF NOT EXISTS inventory(tenant_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), item_type TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES records(id), quantity INTEGER NOT NULL CHECK(quantity>=0), PRIMARY KEY(tenant_id,user_id,item_type,item_id))",
    "CREATE TABLE IF NOT EXISTS stock_ledger(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, delta INTEGER NOT NULL, source_id TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, ended_at TEXT,device_id TEXT NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS one_shift ON shifts(tenant_id,user_id) WHERE ended_at IS NULL",
    `CREATE TABLE IF NOT EXISTS points(id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,shift_id TEXT NOT NULL REFERENCES shifts(id),observed_at TEXT NOT NULL,received_at TEXT NOT NULL,latitude ${real} NOT NULL,longitude ${real} NOT NULL,accuracy ${real} NOT NULL,battery INTEGER,mocked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,user_id,id))`,
    "CREATE INDEX IF NOT EXISTS points_time ON points(tenant_id,user_id,observed_at)",
    "CREATE TABLE IF NOT EXISTS device_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,shift_id TEXT, event TEXT NOT NULL,observed_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS operations(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,operation_id TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id,operation_id))",
    "CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS audit_tenant ON audit(tenant_id,created_at)",
    "CREATE TABLE IF NOT EXISTS support_requests(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT,kind TEXT NOT NULL,category TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',response TEXT NOT NULL DEFAULT '',resolved_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS support_scope ON support_requests(tenant_id,status,created_at)",
    "CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),language TEXT NOT NULL DEFAULT 'en',updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS customer_addresses(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL REFERENCES records(id),label TEXT NOT NULL,line TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT '',pin_code TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS address_customer ON customer_addresses(tenant_id,customer_id)",
  ];
};
/** Tables in dependency order, used by migrations and tests. */
export const tableOrder = [
  "tenants",
  "users",
  "sessions",
  "records",
  "decisions",
  "inventory",
  "stock_ledger",
  "shifts",
  "points",
  "device_events",
  "operations",
  "attachments",
  "audit",
  "support_requests",
  "preferences",
  "customer_addresses",
];
type Memo = Map<string, Promise<any[]>>;
/**
 * Async database access with two engines behind one interface.
 *
 * - Reads made while a request scope is active are memoised until the next
 *   write, so repeated lookups (permissions, names) cost one round trip.
 * - `transaction` serialises writers (SQLite BEGIN IMMEDIATE, PostgreSQL
 *   advisory lock) and nested calls join the outer transaction.
 */
export abstract class Store {
  abstract readonly dialect: Dialect;
  private memo = new AsyncLocalStorage<Memo>();
  protected tx = new AsyncLocalStorage<unknown>();
  // Process-wide read cache. Any write or commit through this process clears
  // it, so it only serves data that no one here has changed. Seconds, 0 = off.
  protected cacheSeconds = 0;
  private shared = new Map<string, { at: number; rows: Promise<any[]> }>();
  protected invalidate() {
    this.shared.clear();
    this.memo.getStore()?.clear();
  }
  protected abstract rows(sql: string, args: any[]): Promise<any[]>;
  protected abstract exec(sql: string, args: any[]): Promise<number>;
  abstract transaction<T>(fn: () => Promise<T>): Promise<T>;
  abstract close(): Promise<void>;
  abstract init(): Promise<void>;
  /** Removes everything this store created. Only meaningful for isolated test schemas. */
  async destroy() {}
  static async open(target?: string): Promise<Store> {
    const url = target || process.env.DATABASE_URL || "";
    const store = /^postgres(ql)?:\/\//.test(url)
      ? new PgStore(url)
      : new SqliteStore(
          target && !/^postgres/.test(target)
            ? target
            : process.env.DATABASE_PATH || ".data/mr-connect.sqlite",
        );
    await store.init();
    return store;
  }
  /** Expression reading a top-level text field from the JSON `data` column. */
  json(column: string, key: string) {
    if (!/^[a-z_]+$/i.test(column) || !/^[a-z_]+$/i.test(key))
      throw new Error("Invalid JSON path");
    return this.dialect === "postgres"
      ? `(${column}::jsonb->>'${key}')`
      : `json_extract(${column},'$.${key}')`;
  }
  /** Expression for the length of a top-level JSON array in `data`. */
  jsonArrayLength(column: string, key: string) {
    if (!/^[a-z_]+$/i.test(column) || !/^[a-z_]+$/i.test(key))
      throw new Error("Invalid JSON path");
    return this.dialect === "postgres"
      ? `jsonb_array_length(${column}::jsonb->'${key}')`
      : `json_array_length(${column},'$.${key}')`;
  }
  /** Runs `fn` with a fresh read cache. Used once per HTTP request. */
  scoped<T>(fn: () => T): T {
    return this.memo.run(new Map(), fn);
  }
  private async read(sql: string, args: any[]) {
    const memo = this.memo.getStore();
    if (!memo || this.tx.getStore()) return this.rows(sql, args);
    const key = sql + "\u0000" + JSON.stringify(args);
    let hit = memo.get(key);
    if (!hit) {
      const warm = this.shared.get(key);
      if (warm && Date.now() - warm.at < this.cacheSeconds * 1000)
        hit = warm.rows;
      else {
        hit = this.rows(sql, args);
        if (this.cacheSeconds > 0) {
          if (this.shared.size > 200)
            for (const [k, v] of this.shared)
              if (Date.now() - v.at >= this.cacheSeconds * 1000)
                this.shared.delete(k);
          this.shared.set(key, { at: Date.now(), rows: hit });
          hit.catch(() => this.shared.delete(key));
        }
      }
      memo.set(key, hit);
      hit.catch(() => memo.delete(key));
    }
    return hit;
  }
  async get(sql: string, ...args: any[]): Promise<any> {
    const rows = await this.read(sql, args);
    return rows[0] ? { ...rows[0] } : undefined;
  }
  async all(sql: string, ...args: any[]): Promise<any[]> {
    return (await this.read(sql, args)).map((r) => ({ ...r }));
  }
  async run(sql: string, ...args: any[]) {
    this.invalidate();
    try {
      return { changes: await this.exec(sql, args) };
    } finally {
      this.invalidate();
    }
  }
}
class SqliteStore extends Store {
  readonly dialect = "sqlite" as const;
  private db: DatabaseSync;
  private chain: Promise<void> = Promise.resolve();
  constructor(path: string) {
    super();
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  async init() {
    for (const sql of tables("sqlite")) this.db.exec(sql);
    this.db
      .prepare("INSERT OR IGNORE INTO schema_versions VALUES(?,?)")
      .run(1, new Date().toISOString());
  }
  // A single connection cannot interleave statements from another request
  // while a transaction is open, so plain statements wait for it.
  private async idle() {
    if (!this.tx.getStore()) await this.chain;
  }
  protected async rows(sql: string, args: any[]) {
    await this.idle();
    return this.db.prepare(sql).all(...args) as any[];
  }
  protected async exec(sql: string, args: any[]) {
    await this.idle();
    return Number(this.db.prepare(sql).run(...args).changes);
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.tx.getStore()) return fn();
    const previous = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((r) => (release = r));
    await previous;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const out = await this.tx.run(true, fn);
      this.db.exec("COMMIT");
      this.invalidate();
      return out;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      this.invalidate();
      throw e;
    } finally {
      release();
    }
  }
  async close() {
    await this.chain;
    this.db.close();
  }
}
type Lane = { client: pg.PoolClient; tail: Promise<void> };
const placeholders = (sql: string) => {
  let n = 0,
    quoted = false,
    out = "";
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === "?" && !quoted ? "$" + ++n : ch;
  }
  return out;
};
class PgStore extends Store {
  readonly dialect = "postgres" as const;
  private pool: pg.Pool;
  constructor(url: string) {
    super();
    this.pool = new pg.Pool({
      connectionString: url.replace("sslmode=require", "sslmode=verify-full"),
      max: Number(process.env.DATABASE_POOL || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      // Direct (non-pooled) endpoints accept this startup parameter.
      ...(process.env.DATABASE_SCHEMA
        ? { options: `-c search_path=${process.env.DATABASE_SCHEMA}` }
        : {}),
    });
    this.pool.on("error", (e) =>
      console.error("Database pool error", e.message),
    );
    this.cacheSeconds = Number(process.env.DATABASE_CACHE_SECONDS ?? 15);
    // An optional private schema lets tests share one server without touching
    // real data. It needs a direct (non-pooled) connection because SET is
    // session state.
    this.schema = process.env.DATABASE_SCHEMA || "";
    if (this.schema) {
      if (!/^[a-z0-9_]+$/i.test(this.schema))
        throw new Error(
          "DATABASE_SCHEMA may only contain letters, digits and _",
        );
    }
  }
  private schema: string;
  async destroy() {
    if (this.schema)
      await this.pool.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
  }
  async init() {
    if (this.schema) {
      const client = await this.pool.connect();
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        await client.query(`SET search_path TO "${this.schema}"`);
        for (const sql of tables("postgres")) await client.query(sql);
        await client.query(
          "INSERT INTO schema_versions VALUES($1,$2) ON CONFLICT DO NOTHING",
          [1, new Date().toISOString()],
        );
      } finally {
        client.release();
      }
      return;
    }
    for (const sql of tables("postgres")) await this.pool.query(sql);
    await this.pool.query(
      "INSERT INTO schema_versions VALUES($1,$2) ON CONFLICT DO NOTHING",
      [1, new Date().toISOString()],
    );
  }
  // Statements of one transaction share a connection and must not overlap
  // (callers run independent reads with Promise.all), so queue them.
  private query(sql: string, args: any[]) {
    const open = this.tx.getStore() as Lane | undefined;
    if (!open) return this.pool.query(placeholders(sql), args);
    const result = open.tail.then(() =>
      open.client.query(placeholders(sql), args),
    );
    open.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  protected async rows(sql: string, args: any[]) {
    return (await this.query(sql, args)).rows;
  }
  protected async exec(sql: string, args: any[]) {
    return (await this.query(sql, args)).rowCount ?? 0;
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.tx.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // One writer at a time per schema, like SQLite's BEGIN IMMEDIATE.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "mr-connect:" + (this.schema || "public"),
      ]);
      const out = await this.tx.run(
        { client, tail: Promise.resolve() } as Lane,
        fn,
      );
      await client.query("COMMIT");
      this.invalidate();
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      this.invalidate();
      throw e;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
export { SqliteStore, PgStore };
