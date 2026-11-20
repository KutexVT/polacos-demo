import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.js";
import { pool, one } from "../server/db.js";
import { seedDemo } from "../server/demo.js";
import { ledger } from "../server/money.js";
let app, server, base;
async function call(path, body, cookie, origin) {
  const r = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
test.before(async () => {
  app = await createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  await app.locals.shutdown();
  await new Promise((r) => server.close(r));
  await pool.end();
});
test("Demo · Datos coherentes y siembra idempotente que conserva las ediciones", async () => {
  const count = () =>
    one(
      pool,
      "SELECT (SELECT count(*) FROM groups) groups,(SELECT count(*) FROM products) products,(SELECT count(*) FROM clients) clients,(SELECT count(*) FROM purchases) purchases,(SELECT count(*) FROM payments) payments,(SELECT count(*) FROM messages) messages,(SELECT count(*) FROM cash_closings) closings",
    );
  const before = await count();
  assert.equal(Number(before.groups), 2);
  assert(Number(before.products) >= 60);
  assert(Number(before.clients) >= 104);
  assert(Number(before.purchases) >= 208);
  assert(Number(before.messages) >= 160);
  assert.equal(Number(before.closings), 6);
  const { rows } = await pool.query("SELECT * FROM purchases");
  for (const p of rows) {
    const payments = (
      await pool.query("SELECT * FROM payments WHERE purchase_id=$1", [p.id])
    ).rows;
    const l = ledger(p, payments);
    assert.equal(p.status === "paid", l.balance === 0);
    assert(l.balance >= 0);
  }
  const { rows: stock } = await pool.query(
    "SELECT p.*, (SELECT count(*) FROM purchases s WHERE s.product_id=p.id AND s.status IN ('pending','decision')) AS waiting,(SELECT count(*) FROM purchases s WHERE s.product_id=p.id AND s.had_assignment) AS delivered FROM products p",
  );
  for (const p of stock) {
    assert.equal(p.reserved, Number(p.waiting));
    assert.equal(p.assigned, Number(p.delivered));
    assert.equal(p.available + p.reserved + p.assigned, 50);
  }
  const p = rows[0];
  await pool.query(
    "UPDATE clients SET notes='Edición de prueba conservada' WHERE id=$1",
    [p.client_id],
  );
  await seedDemo();
  assert.deepEqual(await count(), before);
  assert.equal(
    (await one(pool, "SELECT notes FROM clients WHERE id=$1", [p.client_id]))
      .notes,
    "Edición de prueba conservada",
  );
});
test("Demo · Entrada directa limitada a los dos perfiles y administrador protegido", async () => {
  for (const body of [
    { role: "admin" },
    { role: "admin", password: process.env.ADMIN_PASSWORD },
    { role: "owner", user_id: "00000000-0000-0000-0000-000000000001" },
    { role: "owner", group_id: "x" },
    {},
  ])
    assert.equal((await call("/entry", body)).status, 400);
  assert.equal((await call("/admin/overview")).status, 401);
  assert.equal(
    (
      await call("/login", {
        username: process.env.ADMIN_USERNAME,
        password: "incorrecta",
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/entry", { role: "owner" }, null, "https://invalid.example"))
      .status,
    403,
  );
  const owner = await call("/entry", { role: "owner" });
  assert.equal(owner.status, 200);
  assert.equal(owner.data.user.role, "owner");
  assert(!("password_hash" in owner.data.user));
  assert((await call("/clients", null, owner.cookie)).data.total >= 80);
  assert.equal((await call("/admin/overview", null, owner.cookie)).status, 403);
  const worker = await call("/entry", { role: "polaco" }, owner.cookie);
  assert.equal(worker.status, 200);
  assert.equal(worker.data.user.role, "polaco");
  assert.notEqual(worker.data.user.id, owner.data.user.id);
  assert.equal((await call("/me", null, owner.cookie)).status, 401);
  assert.equal(
    (await call("/admin/overview", null, worker.cookie)).status,
    403,
  );
  const clients = (await call("/clients", null, worker.cookie)).data;
  assert(clients.total >= 20);
  assert(clients.items.every((c) => c.group_id === worker.data.user.group_id));
  const foreign = await one(
    pool,
    "SELECT id FROM clients WHERE group_id<>$1 LIMIT 1",
    [worker.data.user.group_id],
  );
  assert.equal(
    (await call("/clients/" + foreign.id, null, worker.cookie)).status,
    403,
  );
  assert.equal(
    (await call("/me", null, worker.cookie)).data.user.id,
    worker.data.user.id,
  );
  const admin = await call("/login", {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.user.role, "admin");
  assert.equal((await call("/admin/overview", null, admin.cookie)).status, 200);
  assert.equal((await call("/clients", null, admin.cookie)).status, 403);
  await call("/logout", {}, admin.cookie);
  await call("/logout", {}, worker.cookie);
});
