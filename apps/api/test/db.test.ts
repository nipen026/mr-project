import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, SqliteStore } from "../src/db.ts";
// The same behaviour is exercised against PostgreSQL by running the whole API
// suite with TEST_DATABASE_URL; these cover the Store contract on SQLite.
class Cached extends SqliteStore {
  constructor() {
    super(":memory:");
    this.cacheSeconds = 60;
  }
}
const open = async (s: Store) => {
  await s.init();
  await s.run("CREATE TABLE counter(id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
  await s.run("INSERT INTO counter VALUES('a',0)");
  return s;
};
test("open() chooses SQLite for a path and returns rows as plain copies", async () => {
  const s = await open(await Store.open(":memory:"));
  assert.equal(s.dialect, "sqlite");
  const row = await s.get("SELECT * FROM counter WHERE id=?", "a");
  row.n = 99;
  assert.equal((await s.get("SELECT n FROM counter WHERE id=?", "a")).n, 0);
  assert.equal(
    (await s.run("UPDATE counter SET n=n+1 WHERE id=?", "a")).changes,
    1,
  );
  await s.close();
});
test("concurrent transactions run one at a time and nested ones join", async () => {
  const s = await open(await Store.open(":memory:"));
  const bump = () =>
    s.transaction(async () => {
      const { n } = await s.get("SELECT n FROM counter WHERE id='a'");
      await new Promise((r) => setTimeout(r, 5));
      await s.transaction(async () => {
        await s.run("UPDATE counter SET n=? WHERE id='a'", n + 1);
      });
    });
  await Promise.all(Array.from({ length: 8 }, bump));
  assert.equal((await s.get("SELECT n FROM counter WHERE id='a'")).n, 8);
  await s.close();
});
test("a failed transaction rolls everything back", async () => {
  const s = await open(await Store.open(":memory:"));
  await assert.rejects(
    s.transaction(async () => {
      await s.run("UPDATE counter SET n=50 WHERE id='a'");
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal((await s.get("SELECT n FROM counter WHERE id='a'")).n, 0);
  await s.close();
});
test("plain statements wait for an open transaction instead of interleaving", async () => {
  const s = await open(await Store.open(":memory:"));
  const order: string[] = [];
  const tx = s.transaction(async () => {
    await s.run("UPDATE counter SET n=1 WHERE id='a'");
    await new Promise((r) => setTimeout(r, 20));
    order.push("commit");
  });
  await new Promise((r) => setTimeout(r, 2));
  const read = s.get("SELECT n FROM counter WHERE id='a'").then((r) => {
    order.push("read");
    return r;
  });
  await tx;
  assert.equal((await read).n, 1);
  assert.deepEqual(order, ["commit", "read"]);
  await s.close();
});
test("cached reads are shared until any write clears them", async () => {
  const s = await open(new Cached());
  let reads = 0;
  const original = (s as any).rows.bind(s);
  (s as any).rows = (sql: string, args: any[]) => {
    reads++;
    return original(sql, args);
  };
  await s.scoped(async () => {
    await s.get("SELECT n FROM counter WHERE id='a'");
  });
  await s.scoped(async () => {
    await s.get("SELECT n FROM counter WHERE id='a'");
  });
  assert.equal(reads, 1, "second request reuses the first result");
  await s.scoped(async () => {
    await s.run("UPDATE counter SET n=7 WHERE id='a'");
  });
  const fresh = await s.scoped(() =>
    s.get("SELECT n FROM counter WHERE id='a'"),
  );
  assert.equal(fresh.n, 7);
  assert.equal(reads, 2, "the write forced a fresh read");
  await s.transaction(async () => {
    await s.run("UPDATE counter SET n=9 WHERE id='a'");
  });
  assert.equal(
    (await s.scoped(() => s.get("SELECT n FROM counter WHERE id='a'"))).n,
    9,
  );
  await s.close();
});
test("JSON helpers build dialect specific expressions and reject odd names", async () => {
  const s = await Store.open(":memory:");
  assert.match(s.json("data", "date"), /json_extract/);
  assert.match(s.jsonArrayLength("data", "orderLines"), /json_array_length/);
  assert.throws(
    () => s.json("data", "x'); DROP TABLE users;--"),
    /Invalid JSON path/,
  );
  await s.close();
});
