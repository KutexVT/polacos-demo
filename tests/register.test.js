import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createApp } from "../server/index.js";
import { pool } from "../server/db.js";
import { cleanupGroup } from "./cleanup.js";
import { cashTotal, cashGroups, cashQuantity } from "../shared/cash-count.js";
const password = randomBytes(18).toString("hex"),
  suffix = Date.now().toString(36),
  groups = [];
let app,
  server,
  base,
  admin,
  owner,
  w1,
  w2,
  other,
  gid,
  p1,
  p2,
  po,
  payment,
  closing,
  closingBody;
const from = new Date(Date.now() - 3600000).toISOString();
async function req(cookie, path, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function ok(...args) {
  const r = await req(...args);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function login(username, pw = password) {
  const r = await req(null, "/login", { username, password: pw });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}
async function preview(cookie, scope = "personal") {
  return ok(cookie, "/register/preview", { from, scope });
}
async function pay(cookie, p, amount, payment) {
  return ok(cookie, "/purchases/" + p.id + "/payments", {
    amount,
    payment,
    kind: "installment",
    paid_on: "2026-11-17",
    idempotency_key: randomUUID(),
  });
}
async function draft(cookie, scope = "personal", extra = {}) {
  const s = await preview(cookie, scope);
  return {
    period: s.period,
    fingerprint: s.fingerprint,
    opening: 0,
    counts: {},
    actual_sinpe: null,
    actual_card: null,
    note: "Conteo verificado para la prueba",
    supersedes: null,
    confirmed: true,
    idempotency_key: randomUUID(),
    ...extra,
  };
}

test.before(async () => {
  app = await createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
  admin = await login(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  const g = await ok(admin, "/groups", {
    name: "Caja QA " + suffix,
    limit: 2,
    owner_name: "Dueño caja",
    username: "cash_owner_" + suffix,
    password,
  });
  groups.push(g.id);
  gid = g.id;
  owner = await login("cash_owner_" + suffix);
  w1 = await ok(owner, "/users", {
    name: "Polaco caja 1",
    username: "cash_one_" + suffix,
    password,
  });
  w1.cookie = await login("cash_one_" + suffix);
  w2 = await ok(owner, "/users", {
    name: "Polaco caja 2",
    username: "cash_two_" + suffix,
    password,
  });
  w2.cookie = await login("cash_two_" + suffix);
  const g2 = await ok(admin, "/groups", {
    name: "Otra caja QA " + suffix,
    limit: 0,
    owner_name: "Otro dueño",
    username: "cash_other_" + suffix,
    password,
  });
  groups.push(g2.id);
  other = await login("cash_other_" + suffix);
  const product = await ok(owner, "/products", {
    name: "Producto cierre",
    purchase_cost: 8000,
    profit_percent: 25,
    available: 10,
  });
  async function buy(cookie, name) {
    const c = await ok(cookie, "/clients", { name });
    return ok(cookie, "/purchases", {
      client_id: c.id,
      product_id: product.id,
      quantity: 1,
      plan: { frequency: "monthly", start: "2026-11-17", installment: 10000 },
      idempotency_key: randomUUID(),
    });
  }
  p1 = await buy(w1.cookie, "Cliente de caja 1");
  p2 = await buy(w2.cookie, "Cliente de caja 2");
  po = await buy(owner, "Cliente del dueño");
});
test.after(async () => {
  for (const id of groups) await cleanupGroup(pool, id);
  if (app) await app.locals.shutdown();
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
});

test("Caja 01 · Denominaciones y cantidades inválidas", () => {
  assert.equal(cashQuantity("1.5"), null);
  assert.equal(cashQuantity("-1"), null);
  assert.equal(cashQuantity("1000001"), null);
  assert.equal(
    cashTotal([20000, 500, 10], { 20000: "2", 500: "3", 10: "1" }),
    4151000,
  );
  assert.equal(cashTotal([500], { 500: "abc" }), null);
  assert.equal(cashGroups.flatMap((g) => g.values).length, 10);
});
test("Caja 02 · Pagos mixtos exactos y vuelto solo en efectivo", async () => {
  payment = await pay(w1.cookie, p1, 5000, {
    cash: 3000,
    sinpe: 2000,
    card: 0,
    cash_received: 5000,
  });
  assert.equal(payment.cash_change, 200000);
  assert.equal(payment.payment_cash, 300000);
  const duplicate = await ok(w1.cookie, "/purchases/" + p1.id + "/payments", {
    amount: 5000,
    payment: { cash: 3000, sinpe: 2000, card: 0, cash_received: 5000 },
    kind: "installment",
    paid_on: "2026-11-17",
    idempotency_key: payment.idempotency_key,
  });
  assert.equal(duplicate.id, payment.id);
  assert.equal(
    (
      await req(w1.cookie, "/purchases/" + p1.id + "/payments", {
        amount: 5000,
        payment: { cash: 2000, sinpe: 3000, card: 0 },
        kind: "installment",
        paid_on: "2026-11-17",
        idempotency_key: payment.idempotency_key,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(w1.cookie, "/purchases/" + p1.id + "/payments", {
        amount: 100,
        payment: { cash: 50, sinpe: 0, card: 0 },
        kind: "installment",
        paid_on: "2026-11-17",
        idempotency_key: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(w1.cookie, "/purchases/" + p1.id + "/payments", {
        amount: 100,
        payment: { cash: 0, sinpe: 100, card: 0, cash_received: 100 },
        kind: "installment",
        paid_on: "2026-11-17",
        idempotency_key: randomUUID(),
      })
    ).status,
    400,
  );
  await pay(w2.cookie, p2, 1000, { cash: 1000, sinpe: 0, card: 0 });
  await pay(owner, po, 1000, { cash: 0, sinpe: 0, card: 1000 });
});
test("Caja 03 · Alcance por cobrador y aislamiento real entre equipos", async () => {
  const own = await preview(w1.cookie),
    team = await preview(owner, "team"),
    boss = await preview(owner);
  assert.equal(own.total, 500000);
  assert.equal(own.sales.length, 1);
  assert.equal(own.sales[0].seller_id, w1.id);
  assert.equal(team.total, 700000);
  assert.equal(team.sellers.length, 3);
  assert.equal(boss.total, 100000);
  assert.equal(boss.collected.card, 100000);
  assert.equal(
    (await req(w1.cookie, "/register/preview", { from, scope: "team" })).status,
    403,
  );
  assert.equal(
    (await req(admin, "/register/preview", { from, scope: "team" })).status,
    403,
  );
  assert.equal((await preview(other)).total, 0);
  assert.equal(
    (await req(w1.cookie, "/register/closings?scope=team")).status,
    403,
  );
  assert.equal(
    (await req(w1.cookie, "/register/closings?inbox=true")).status,
    403,
  );
  assert.equal(
    (
      await req(w1.cookie, "/register/preview", {
        from,
        scope: "personal",
        user_id: w2.id,
      })
    ).status,
    400,
  );
});
test("Caja 04 · Configuración separada y movimientos sin doble conteo", async () => {
  await ok(
    owner,
    "/register/settings",
    { scope: "team", day_start: "06:30", opening_default: 2000 },
    "PUT",
  );
  await ok(
    owner,
    "/register/settings",
    { scope: "personal", day_start: "07:00", opening_default: 1000 },
    "PUT",
  );
  assert.equal(
    (await ok(owner, "/register/settings?scope=team")).opening_default,
    200000,
  );
  assert.equal(
    (await ok(owner, "/register/settings?scope=personal")).day_start,
    "07:00",
  );
  assert.equal(
    (await ok(w1.cookie, "/register/settings?scope=personal")).opening_default,
    null,
  );
  assert.equal(
    (
      await req(
        w1.cookie,
        "/register/settings",
        { scope: "team", day_start: "06:30", opening_default: 0 },
        "PUT",
      )
    ).status,
    403,
  );
  const b = {
    scope: "personal",
    method: "cash",
    direction: "out",
    amount: 500,
    occurred_at: new Date(Date.now() - 1000).toISOString(),
    reason: "Gasto de la prueba",
    idempotency_key: randomUUID(),
  };
  const e = await ok(w1.cookie, "/register/entries", b);
  assert.equal((await ok(w1.cookie, "/register/entries", b)).id, e.id);
  await ok(owner, "/register/entries", {
    ...b,
    scope: "team",
    direction: "in",
    amount: 1000,
    idempotency_key: randomUUID(),
  });
  assert.equal((await preview(w1.cookie)).movements.cash, -50000);
  assert.equal((await preview(owner)).movements.cash, 0);
  assert.equal((await preview(owner, "team")).movements.cash, 50000);
  assert.equal(
    (
      await req(w2.cookie, "/register/entries/" + e.id + "/reverse", {
        reason: "No corresponde",
        idempotency_key: randomUUID(),
      })
    ).status,
    404,
  );
});
test("Caja 05 · Resumen congelado y reintentos idempotentes", async () => {
  closingBody = await draft(w1.cookie, "personal", {
    opening: 1000,
    counts: { 2000: 1, 1000: 1, 500: 1 },
    actual_sinpe: 999999,
    actual_card: 999999,
    note: "",
  });
  const simultaneous = await Promise.all([
    ok(w1.cookie, "/register/closings", closingBody),
    ok(w1.cookie, "/register/closings", closingBody),
  ]);
  assert.equal(simultaneous[0].id, simultaneous[1].id);
  closing = simultaneous[0];
  assert.equal(
    closing.actual_sinpe,
    closing.snapshot.collected.sinpe + closing.snapshot.movements.sinpe,
  );
  assert.equal(
    closing.actual_card,
    closing.snapshot.collected.card + closing.snapshot.movements.card,
  );
  assert.equal(closing.actual_cash, 350000);
  assert.equal(closing.expected_cash, 350000);
  assert.equal(closing.difference_cash, 0);
  assert.equal(
    (await ok(w1.cookie, "/register/closings", closingBody)).id,
    closing.id,
  );
  assert.equal(
    (
      await req(w1.cookie, "/register/closings", {
        ...closingBody,
        note: "Otro intento",
      })
    ).status,
    409,
  );
  assert.equal(
    (await req(w2.cookie, "/register/closings/" + closing.id)).status,
    404,
  );
  assert.equal(
    (await req(other, "/register/closings/" + closing.id)).status,
    404,
  );
  assert.equal(
    (await req(owner, "/register/closings/" + closing.id)).status,
    404,
  );
  const saved = await ok(w1.cookie, "/register/closings/" + closing.id);
  await pay(w1.cookie, p1, 100, { cash: 100, sinpe: 0, card: 0 });
  assert.deepEqual(
    (await ok(w1.cookie, "/register/closings/" + closing.id)).snapshot,
    saved.snapshot,
  );
  await assert.rejects(
    pool.query("UPDATE cash_closings SET note=$2 WHERE id=$1", [
      closing.id,
      "No permitido",
    ]),
    (e) => e.code === "23514",
  );
});
test("Caja 06 · Envío al dueño y revisión trazable sin cambiar el cierre", async () => {
  await ok(w1.cookie, "/register/closings/" + closing.id + "/submit", {});
  await ok(w1.cookie, "/register/closings/" + closing.id + "/submit", {});
  const inbox = await ok(owner, "/register/closings?inbox=true");
  assert.equal(inbox.rows.length, 1);
  assert.equal(inbox.rows[0].id, closing.id);
  assert.equal(
    (await ok(owner, "/register/closings?scope=personal")).rows.length,
    0,
  );
  const reviewed = await ok(
    owner,
    "/register/closings/" + closing.id + "/review",
    { note: "Conteo revisado y recibido" },
  );
  assert(reviewed.reviewed_at);
  assert.equal(reviewed.review_note, "Conteo revisado y recibido");
  assert.deepEqual(reviewed.snapshot, closing.snapshot);
  assert.equal(
    (await ok(w1.cookie, "/register/closings/" + closing.id)).review_note,
    "Conteo revisado y recibido",
  );
  assert.equal(
    (
      await req(w2.cookie, "/register/closings/" + closing.id + "/review", {
        note: "Sin permiso",
      })
    ).status,
    403,
  );
  assert.equal(
    (await req(other, "/register/closings/" + closing.id + "/review", {}))
      .status,
    404,
  );
  assert.equal(
    (await req(admin, "/register/closings/" + closing.id + "?group_id=" + gid))
      .status,
    403,
  );
  assert.equal(
    (await req(admin, "/register/closings", await draft(owner))).status,
    403,
  );
  const notices = (await ok(owner, "/notifications?limit=100")).items.filter(
    (n) => n.subject_id === closing.id,
  );
  assert.equal(notices.length, 1);
});
test("Caja 07 · Correcciones invalidan resumen y mantienen histórico", async () => {
  const b = await draft(w1.cookie);
  assert.equal(
    (
      await req(
        w1.cookie,
        "/payments/" + payment.id,
        { amount: 4900, reason: "Debe indicar distribución" },
        "PATCH",
      )
    ).status,
    400,
  );
  await ok(
    owner,
    "/payments/" + payment.id,
    {
      amount: 4900,
      payment: { cash: 2900, sinpe: 2000, card: 0, cash_received: 5000 },
      reason: "Corrección verificada",
    },
    "PATCH",
  );
  assert.equal((await req(w1.cookie, "/register/closings", b)).status, 409);
  assert.equal(
    (await ok(w1.cookie, "/register/closings/" + closing.id)).snapshot.sales[0]
      .amount,
    500000,
  );
  const preview = await ok(w1.cookie, "/register/preview", {
    ...closing.snapshot.period,
  });
  const revision = await ok(w1.cookie, "/register/closings", {
    ...closingBody,
    period: preview.period,
    fingerprint: preview.fingerprint,
    supersedes: closing.id,
    note: "Revisión después de corregir",
    idempotency_key: randomUUID(),
  });
  assert.equal(revision.supersedes, closing.id);
  assert.equal(revision.snapshot.sales[0].amount, 490000);
  assert.equal(
    (
      await req(w1.cookie, "/register/closings", {
        ...(await draft(w1.cookie)),
        supersedes: closing.id,
      })
    ).status,
    400,
  );
});
test("Caja 08 · Movimientos inmutables y contrapartidas", async () => {
  const s = await preview(w1.cookie),
    e = s.entries.find((e) => e.direction === "out");
  const body = {
    reason: "Devolver el gasto de prueba",
    idempotency_key: randomUUID(),
  };
  const reverse = await ok(
    w1.cookie,
    "/register/entries/" + e.id + "/reverse",
    body,
  );
  assert.equal(reverse.reverses, e.id);
  assert.equal(
    (await ok(w1.cookie, "/register/entries/" + e.id + "/reverse", body)).id,
    reverse.id,
  );
  assert.equal((await preview(w1.cookie)).movements.cash, 0);
  assert.equal(
    (
      await req(w1.cookie, "/register/entries/" + e.id + "/reverse", {
        ...body,
        idempotency_key: randomUUID(),
      })
    ).status,
    409,
  );
  await assert.rejects(
    pool.query("DELETE FROM cash_entries WHERE id=$1", [e.id]),
    (e) => e.code === "23514",
  );
});
test("Caja 09 · Pagos sin clasificar exigen observación y se pueden verificar", async () => {
  const old = await pay(w1.cookie, p1, 100);
  const s = await preview(w1.cookie);
  assert.equal(s.unclassified, 1);
  assert.equal(s.unclassified_total, 10000);
  const b = await draft(w1.cookie, "personal", { note: "" });
  assert.equal((await req(w1.cookie, "/register/closings", b)).status, 400);
  await ok(w1.cookie, "/register/closings", {
    ...b,
    note: "Pago pendiente de verificar",
    idempotency_key: randomUUID(),
  });
  await ok(
    owner,
    "/payments/" + old.id,
    {
      payment: { cash: 0, sinpe: 100, card: 0 },
      reason: "Comprobante SINPE verificado",
    },
    "PATCH",
  );
  assert.equal((await preview(w1.cookie)).unclassified, 0);
});
test("Caja 10 · Límites de período y denominaciones", async () => {
  for (const b of [
    { from: "2026-13-01T00:00", scope: "personal" },
    { from: new Date(Date.now() + 3600000).toISOString(), scope: "personal" },
    {
      from: new Date(Date.now() - 32 * 86400000).toISOString(),
      scope: "personal",
    },
  ])
    assert.equal((await req(w1.cookie, "/register/preview", b)).status, 400);
  assert.equal(
    (
      await req(w1.cookie, "/register/closings", {
        ...(await draft(w1.cookie)),
        counts: { 123: 1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(w1.cookie, "/register/closings", {
        ...(await draft(w1.cookie)),
        counts: { 1000: -1 },
      })
    ).status,
    400,
  );
});
