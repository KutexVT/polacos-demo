import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { pool, tx, one } from "../server/db.js";
import { createApp } from "../server/index.js";
import { runJobs } from "../server/lifecycle.js";
import { cleanupGroup } from "./cleanup.js";
const suffix = Date.now().toString(36),
  password = randomBytes(18).toString("hex");
let base = process.env.TEST_BASE_URL,
  app,
  server,
  admin,
  owner,
  w1,
  w2,
  other,
  group,
  g2,
  product,
  c1,
  c2,
  p1;
const groups = [];
const plan = {
  frequency: "monthly",
  start: "2026-01-31",
  day: 31,
  installment: 10000,
};
async function request(cookie, path, body, method = body ? "POST" : "GET") {
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
async function ok(cookie, path, body, method) {
  const r = await request(cookie, path, body, method);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function login(username, pw = password) {
  const r = await request(null, "/login", { username, password: pw });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}
async function newClient(cookie, name) {
  return ok(cookie, "/clients", { name });
}
async function buy(cookie, client, price, qty = 1, productId = product.id) {
  const current = (await ok(cookie, "/products?limit=100")).items.find(
    (p) => p.id === productId,
  );
  return ok(cookie, "/purchases", {
    client_id: client.id,
    product_id: productId,
    quantity: qty,
    ...(price * 100 === current.price
      ? {}
      : {
          discount_percent:
            Math.round((1 - (price * 100) / current.price) * 10000) / 100,
        }),
    plan,
    idempotency_key: randomUUID(),
  });
}
async function getProduct() {
  return (await ok(owner, "/products")).items.find((x) => x.id === product.id);
}
async function file(cookie, content, type = "text/plain", name = "nota.txt") {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type }), name);
  const r = await fetch(base + "/api/files", {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  assert.equal(r.status, 200);
  return r.json();
}
test.before(async () => {
  if (!base) {
    app = await createApp();
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = "http://127.0.0.1:" + server.address().port;
  }
  admin = await login(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
});
test.after(async () => {
  if (!process.env.KEEP_TEST_DATA)
    for (const id of groups) await cleanupGroup(pool, id);
  if (app) await app.locals.shutdown();
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
});
test("01 · Dos cupos reales, tercer perfil bloqueado y aislamiento inicial", async () => {
  group = await ok(admin, "/groups", {
    name: "QA Polacos " + suffix,
    limit: 2,
    owner_name: "Dueño QA",
    username: "owner_" + suffix,
    password,
  });
  groups.push(group.id);
  owner = await login("owner_" + suffix);
  const results = await Promise.all(
    [1, 2, 3].map((i) =>
      request(owner, "/users", {
        name: "Polaco " + i,
        username: `worker_${suffix}_${i}`,
        password,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 2);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  const users = results.filter((r) => r.status === 200).map((r) => r.data);
  w1 = { ...users[0], cookie: await login(users[0].username) };
  w2 = { ...users[1], cookie: await login(users[1].username) };
  g2 = await ok(admin, "/groups", {
    name: "QA Otro " + suffix,
    limit: 1,
    owner_name: "Otro dueño",
    username: "other_" + suffix,
    password,
  });
  groups.push(g2.id);
  other = await login("other_" + suffix);
  product = await ok(owner, "/products", {
    name: "Refrigeradora",
    purchase_cost: 80000,
    profit_percent: 25,
    available: 20,
  });
  c1 = await newClient(w1.cookie, "Ana Mora");
  c2 = await newClient(w2.cookie, "Ana Mora");
  assert.notEqual(c1.id, c2.id);
  assert.equal((await request(w2.cookie, "/clients/" + c1.id)).status, 403);
  assert.equal((await request(other, "/clients/" + c1.id)).status, 403);
  assert.equal(
    (
      await request(
        other,
        "/products/" + product.id,
        { purchase_cost: 1, profit_percent: 25, reason: "No" },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal((await ok(other, "/clients")).total, 0);
});
test("02 · Reserva, rechazo, reenvío, aprobación vieja, cancelación idempotente y pago bloqueado", async () => {
  const p = await buy(w1.cookie, c1, 90000, 2);
  assert.equal(p.status, "pending");
  let stock = await getProduct();
  assert.equal(stock.available, 18);
  assert.equal(stock.reserved, 2);
  assert.equal(
    (
      await request(w1.cookie, `/purchases/${p.id}/payments`, {
        amount: 10000,
        kind: "installment",
        paid_on: "2026-01-31",
        idempotency_key: randomUUID(),
      })
    ).status,
    409,
  );
  let r = (await ok(owner, "/price-requests")).items.find(
    (r) => r.purchase_id === p.id,
  );
  await ok(owner, `/price-requests/${r.id}/decide`, {
    decision: "rejected",
    reason: "Revisa el precio",
  });
  stock = await getProduct();
  assert.equal(stock.reserved, 2);
  await ok(w1.cookie, `/purchases/${p.id}/propose`, {
    discount_percent: 5,
    plan,
  });
  assert.equal(
    (
      await request(owner, `/price-requests/${r.id}/decide`, {
        decision: "approved",
        plan,
      })
    ).status,
    409,
  );
  assert.equal((await getProduct()).reserved, 2);
  await Promise.all([
    ok(w1.cookie, `/purchases/${p.id}/cancel`, { reason: "Cancelada" }),
    ok(w1.cookie, `/purchases/${p.id}/cancel`, { reason: "Cancelada" }),
  ]);
  stock = await getProduct();
  assert.equal(stock.available, 20);
  assert.equal(stock.reserved, 0);
  const newer = (await ok(owner, "/price-requests")).items.find(
    (r) => r.purchase_id === p.id && r.version === 2,
  );
  assert.equal(
    (
      await request(owner, `/price-requests/${newer.id}/decide`, {
        decision: "approved",
        plan,
      })
    ).status,
    409,
  );
});
test("03 · Confirmar reservas una sola vez y catálogo no reescribe compras", async () => {
  const p = await buy(w1.cookie, c1, 90000);
  const r = (await ok(owner, "/price-requests")).items.find(
    (r) => r.purchase_id === p.id,
  );
  await ok(owner, `/price-requests/${r.id}/decide`, {
    decision: "approved",
    plan,
  });
  assert.equal((await getProduct()).available, 19);
  assert.equal((await getProduct()).assigned, 1);
  const p2 = await buy(w1.cookie, c1, 80000);
  await ok(w1.cookie, `/purchases/${p2.id}/original`, { plan });
  assert.equal((await getProduct()).available, 18);
  assert.equal((await getProduct()).assigned, 2);
  assert.equal((await getProduct()).reserved, 0);
  await ok(
    owner,
    "/products/" + product.id,
    {
      name: "Nombre nuevo",
      purchase_cost: 96000,
      profit_percent: 25,
      reason: "Actualizar catálogo",
    },
    "PATCH",
  );
  const old = await ok(w1.cookie, "/purchases/" + p.id);
  assert.equal(old.product_name, "Refrigeradora");
  assert.equal(old.unit_price, 9000000);
  await ok(
    owner,
    "/products/" + product.id,
    { purchase_cost: 80000, profit_percent: 25, reason: "Restablecer precio" },
    "PATCH",
  );
});
test("03b · Costo, porcentaje y ubicación opcional se conservan sin exponer costos al polaco", async () => {
  const rounded = await ok(owner, "/products", {
    name: "Zapatos de porcentaje",
    purchase_cost: "10002",
    profit_percent: "25",
    available: 10,
  });
  assert.equal(rounded.price, 1250500);
  assert.equal(rounded.purchase_cost, 1000200);
  assert.equal(Number(rounded.profit_percent), 25);
  const visible = (await ok(w1.cookie, "/products?limit=100")).items.find(
    (x) => x.id === rounded.id,
  );
  assert.equal(visible.price, 1250500);
  assert(!("purchase_cost" in visible));
  assert(!("profit_percent" in visible));
  for (const body of [
    { name: "Falta costo", price: 10000, available: 1 },
    {
      name: "Porcentaje inválido",
      purchase_cost: 10000,
      profit_percent: 10001,
      available: 1,
    },
  ])
    assert.equal((await request(owner, "/products", body)).status, 400);
  const c = await ok(w1.cookie, "/clients", {
    name: "Cliente con ubicación",
    address: "Dirección de ejemplo",
    province: "Alajuela",
    canton: "San Ramón",
  });
  await ok(
    w1.cookie,
    "/clients/" + c.id,
    { notes: "Conservar ubicación" },
    "PATCH",
  );
  const read = await ok(w1.cookie, "/clients/" + c.id);
  assert.equal(read.province, "Alajuela");
  assert.equal(read.canton, "San Ramón");
  assert(
    (
      await ok(w1.cookie, "/clients?q=" + encodeURIComponent("San Ramón"))
    ).items.some((x) => x.id === c.id),
  );
  assert.equal((await request(w2.cookie, "/clients/" + c.id)).status, 403);
  const purchase = await ok(w1.cookie, "/purchases", {
    client_id: c.id,
    product_id: rounded.id,
    quantity: 1,
    discount_percent: "17.75",
    plan,
    idempotency_key: randomUUID(),
  });
  assert.equal(purchase.unit_price, 1028500);
  assert.equal(purchase.status, "pending");
  const r = (await ok(owner, "/price-requests?limit=100")).items.find(
    (x) => x.purchase_id === purchase.id,
  );
  assert.equal(Number(r.discount_percent), 17.75);
  assert.equal(r.price, purchase.unit_price);
  assert.equal(
    (
      await request(w1.cookie, "/purchases", {
        client_id: c.id,
        product_id: rounded.id,
        quantity: 1,
        price: 1,
        plan,
        idempotency_key: randomUUID(),
      })
    ).status,
    400,
  );
  await ok(
    owner,
    "/products/" + rounded.id,
    { purchase_cost: 20000, profit_percent: 30, reason: "Nuevo catálogo" },
    "PATCH",
  );
  assert.equal(
    (await ok(w1.cookie, "/purchases/" + purchase.id)).unit_price,
    1028500,
  );
  await ok(w1.cookie, "/purchases/" + purchase.id + "/cancel", {reason:"Finalizar caso de prueba"});
});
test("04 · Última unidad concurrente y compras idempotentes", async () => {
  const last = await ok(owner, "/products", {
    name: "Última unidad",
    purchase_cost: 8000,
    profit_percent: 25,
    available: 1,
  });
  const result = await Promise.all(
    [w1, w2].map((w) =>
      request(w.cookie, "/purchases", {
        client_id: w === w1 ? c1.id : c2.id,
        product_id: last.id,
        quantity: 1,
        plan,
        idempotency_key: randomUUID(),
      }),
    ),
  );
  assert.equal(result.filter((r) => r.status === 200).length, 1);
  assert.equal(result.filter((r) => r.status === 409).length, 1);
  const key = randomUUID(),
    body = {
      client_id: c1.id,
      product_id: product.id,
      quantity: 2,
      plan,
      idempotency_key: key,
    };
  const same = await Promise.all([
    ok(w1.cookie, "/purchases", body),
    ok(w1.cookie, "/purchases", body),
  ]);
  assert.equal(same[0].id, same[1].id);
  const p = await ok(w1.cookie, "/purchases/" + same[0].id);
  assert.equal(p.ledger.total, 20000000);
  assert.equal(p.ledger.schedule.length, 20);
});
test("05 · Capital 20000, parcial, adelanto, corrección, liquidación e idempotencia", async () => {
  p1 = await buy(w1.cookie, c1, 100000);
  const cap = {
    amount: 20000,
    kind: "capital",
    paid_on: "2026-02-01",
    idempotency_key: randomUUID(),
  };
  const copies = await Promise.all([
    ok(w1.cookie, `/purchases/${p1.id}/payments`, cap),
    ok(w1.cookie, `/purchases/${p1.id}/payments`, cap),
  ]);
  assert.equal(copies[0].id, copies[1].id);
  assert.equal(
    (
      await request(w1.cookie, `/purchases/${p1.id}/payments`, {
        ...cap,
        amount: 21000,
      })
    ).status,
    409,
  );
  let p = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(p.ledger.balance, 8000000);
  assert.equal(p.ledger.remaining_count, 8);
  assert.equal(p.ledger.schedule[0].remaining, 1000000);
  const partial = await ok(w1.cookie, `/purchases/${p1.id}/payments`, {
    amount: 4000,
    kind: "installment",
    targets: ["q1"],
    paid_on: "2026-02-01",
    idempotency_key: randomUUID(),
  });
  await ok(w1.cookie, `/purchases/${p1.id}/payments`, {
    amount: 10000,
    kind: "installment",
    targets: ["q3"],
    paid_on: "2026-02-02",
    idempotency_key: randomUUID(),
  });
  p = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(p.ledger.schedule[0].remaining, 600000);
  assert.equal(p.ledger.schedule[2].status, "paid");
  await ok(
    owner,
    "/payments/" + partial.id,
    { amount: 5000, reason: "Digitación" },
    "PATCH",
  );
  p = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(p.ledger.balance, 6500000);
  assert(
    p.audit.some(
      (x) =>
        x.before_data?.amount === 400000 && x.after_data?.amount === 500000,
    ),
  );
  assert.equal(
    (
      await request(w1.cookie, `/purchases/${p1.id}/payments`, {
        amount: 65000.01,
        kind: "capital",
        paid_on: "2026-02-03",
        idempotency_key: randomUUID(),
      })
    ).status,
    400,
  );
  await ok(w1.cookie, `/purchases/${p1.id}/payments`, {
    amount: 65000,
    kind: "capital",
    paid_on: "2026-02-03",
    idempotency_key: randomUUID(),
  });
  p = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(p.status, "paid");
  assert.equal(p.ledger.remaining_count, 0);
  await ok(
    owner,
    "/payments/" + partial.id,
    { voided: true, reason: "Anulación" },
    "PATCH",
  );
  p = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(p.ledger.balance, 500000);
  assert.equal(p.status, "active");
});
test("06 · Dueño opera con identidad propia y permisos temporales limitados, caducables y revocables", async () => {
  const mine = await newClient(owner, "Cliente del dueño");
  assert.equal(mine.owner_id, (await ok(owner, "/me")).user.id);
  await ok(
    owner,
    "/clients/" + c1.id,
    { notes: "Corregido por el dueño" },
    "PATCH",
  );
  let grant = await ok(w2.cookie, "/access", {
    target_id: w1.id,
    permission: "edit",
    scope: "Ayudar a cobrar",
    hours: 24,
  });
  await ok(w1.cookie, "/access/" + grant.id + "/decide", {
    decision: "approved",
    permission: "read",
    client_ids: [c1.id],
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal((await request(w2.cookie, "/clients/" + c1.id)).status, 200);
  assert.equal(
    (await request(w2.cookie, "/clients/" + c1.id, { notes: "No" }, "PATCH"))
      .status,
    403,
  );
  await ok(w1.cookie, "/access/" + grant.id + "/decide", {
    decision: "revoked",
  });
  assert.equal((await request(w2.cookie, "/clients/" + c1.id)).status, 403);
  grant = await ok(w2.cookie, "/access", {
    target_id: w1.id,
    permission: "edit",
    scope: "Solo una compra",
    hours: 24,
  });
  await ok(w1.cookie, "/access/" + grant.id + "/decide", {
    decision: "approved",
    permission: "edit",
    purchase_ids: [p1.id],
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal((await request(w2.cookie, "/purchases/" + p1.id)).status, 200);
  assert.equal((await request(w2.cookie, "/clients/" + c1.id)).status, 403);
  assert.equal(
    (
      await request(
        w2.cookie,
        "/products/" + product.id,
        { available: 999, reason: "No" },
        "PATCH",
      )
    ).status,
    403,
  );
  await ok(w2.cookie, `/purchases/${p1.id}/payments`, {
    amount: 1000,
    kind: "capital",
    paid_on: "2026-02-04",
    idempotency_key: randomUUID(),
  });
  await pool.query(
    "UPDATE access_grants SET expires_at=now()-interval '1 second' WHERE id=$1",
    [grant.id],
  );
  assert.equal((await request(w2.cookie, "/purchases/" + p1.id)).status, 403);
});
test("07 · Notificaciones de cobro solo al responsable y deduplicación persistente", async () => {
  await runJobs(new Date("2026-02-02T12:00:00Z"), group.id);
  await runJobs(new Date("2026-02-02T12:00:00Z"), group.id);
  const n = (
    await pool.query(
      "SELECT * FROM notifications WHERE subject_id=$1 AND dedupe LIKE 'due:%'",
      [p1.id],
    )
  ).rows;
  assert(n.length > 0);
  assert(n.every((x) => x.user_id === w1.id));
  assert.equal(new Set(n.map((x) => x.dedupe)).size, n.length);
  await ok(w1.cookie, "/notifications/read", { id: n[0].id });
  const read = await ok(w1.cookie, "/notifications?status=read&limit=1");
  const unread = await ok(w1.cookie, "/notifications?status=unread&limit=1");
  assert.equal(read.total, 1);
  assert.equal(read.items[0].id, n[0].id);
  assert(unread.total > 0);
  assert(unread.items.every((notice) => !notice.read_at));
  const rp = await buy(w1.cookie, c1, 70000);
  const ownerId = (await ok(owner, "/me")).user.id;
  assert.equal(
    (
      await one(
        pool,
        "SELECT user_id FROM notifications WHERE subject_id=$1 AND dedupe LIKE 'price:%'",
        [rp.id],
      )
    ).user_id,
    ownerId,
  );
});
test("08 · Chat privado, adjuntos autorizados, soporte rechazado y eventos aislados", async () => {
  const f = await file(w1.cookie, "Prueba persistente");
  const c = await ok(w1.cookie, "/conversations", {
    kind: "direct",
    members: [w2.id],
    body: "Mensaje inicial",
    idempotency_key: randomUUID(),
  });
  const message = {
    body: "Archivo",
    file_id: f.id,
    idempotency_key: randomUUID(),
  };
  const copies = await Promise.all([
    ok(w1.cookie, `/conversations/${c.id}/messages`, message),
    ok(w1.cookie, `/conversations/${c.id}/messages`, message),
  ]);
  assert.equal(copies[0].id, copies[1].id);
  assert.equal((await request(owner, "/conversations/" + c.id)).status, 403);
  assert.equal((await request(other, "/conversations/" + c.id)).status, 403);
  assert.equal((await request(admin, "/conversations/" + c.id)).status, 403);
  assert.equal(
    (await fetch(base + "/api/files/" + f.id, { headers: { Cookie: other } }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/files/" + f.id, {
        headers: { Cookie: w2.cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(admin, "/conversations", {
        kind: "direct",
        members: [w1.id],
        body: "No autorizado",
        idempotency_key: randomUUID(),
      })
    ).status,
    403,
  );
  for (const cookie of [owner, w1.cookie])
    assert.equal(
      (
        await request(cookie, "/conversations", {
          kind: "support",
          body: "Canal retirado",
          idempotency_key: randomUUID(),
        })
      ).status,
      400,
    );
  const reader = await fetch(base + "/api/events", {
    headers: { Cookie: other },
  });
  const stream = reader.body.getReader();
  const text = await stream.read();
  assert(new TextDecoder().decode(text.value).includes("ready"));
  const target = await fetch(base + "/api/events", {
    headers: { Cookie: w2.cookie },
  });
  const targetStream = target.body.getReader();
  await targetStream.read();
  const foreignEvent = stream.read();
  const ownEvent = targetStream.read();
  await ok(w1.cookie, "/conversations/" + c.id + "/messages", {
    body: "Evento privado",
    idempotency_key: randomUUID(),
  });
  const received = await Promise.race([
    ownEvent,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Falta el evento del destinatario")),
        5000,
      ).unref(),
    ),
  ]);
  assert(
    new TextDecoder()
      .decode(received.value)
      .includes("event: update\ndata: {}"),
  );
  const leaked = await Promise.race([
    foreignEvent.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 500)),
  ]);
  assert.equal(leaked, false, "Otro grupo no recibe el evento");
  await targetStream.cancel();
  await stream.cancel();
});
test("09 · Personalización independiente y nombres de grupo exclusivos del administrador", async () => {
  await ok(w1.cookie, "/me", { palette: "ocean", onboarded: true }, "PATCH");
  await ok(w1.cookie, "/me", { theme: "dark" }, "PATCH");
  const secondSession = await login(w1.username);
  assert.equal((await ok(secondSession, "/me")).user.preferences.theme, "dark");
  assert.equal(
    (await ok(w2.cookie, "/me")).user.preferences.theme || "light",
    "light",
  );
  assert.equal(
    (await request(w1.cookie, "/me", { theme: "invalid" }, "PATCH")).status,
    400,
  );
  await ok(w1.cookie, "/me", { theme: "light" }, "PATCH");
  assert.equal(
    (await ok(secondSession, "/me")).user.preferences.theme,
    "light",
  );
  assert.equal((await ok(w1.cookie, "/me")).user.preferences.palette, "ocean");
  assert.notEqual(
    (await ok(w2.cookie, "/me")).user.preferences.palette,
    "ocean",
  );
  const internalName = "Organización interna " + suffix;
  for (const cookie of [owner, w1.cookie, w2.cookie]) {
    assert.equal((await request(cookie, "/groups")).status, 403);
    assert.equal(
      (
        await request(
          cookie,
          "/groups/" + group.id,
          { name: "Cambio no permitido" },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal((await ok(cookie, "/me")).group, undefined);
    assert((await ok(cookie, "/directory")).every((u) => !("group_name" in u)));
    assert(
      (await ok(cookie, "/conversations")).items.every(
        (c) => !("group_name" in c),
      ),
    );
  }
  assert((await ok(owner, "/users")).items.every((u) => !("group_name" in u)));
  assert(
    (await ok(owner, "/reports")).slots.every(
      (g) => !("name" in g) && !("logo_id" in g),
    ),
  );
  const renamed = await ok(
    admin,
    "/groups/" + group.id,
    { name: internalName },
    "PATCH",
  );
  assert.equal(renamed.name, internalName);
  group.name = internalName;
  assert.equal(
    (await ok(admin, "/groups?q=" + encodeURIComponent(internalName))).items[0]
      .name,
    internalName,
  );
  assert(
    (await ok(admin, "/directory?group_id=" + group.id)).every(
      (u) => u.group_name === internalName,
    ),
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPAcAAAAASUVORK5CYII=",
    "base64",
  );
  const f = await file(owner, png, "image/png", "logo-antiguo.png");
  assert.equal(
    (await request(admin, "/groups/" + group.id, { logo_id: f.id }, "PATCH"))
      .status,
    400,
  );
  // Simulate a logo uploaded before group branding was retired.
  await pool.query("UPDATE groups SET logo_id=$2 WHERE id=$1", [
    group.id,
    f.id,
  ]);
  for (const cookie of [admin, owner, w1.cookie, other])
    assert.equal(
      (
        await fetch(base + "/api/files/" + f.id, {
          headers: { Cookie: cookie },
        })
      ).status,
      cookie === admin ? 403 : 404,
    );
  assert(
    !(
      "logo_id" in
      (await ok(admin, "/groups?group_id=" + group.id)).items.find(
        (g) => g.id === group.id,
      )
    ),
  );
});
test("09b · Estadísticas reales, grupos y retiro completo del soporte", async () => {
  for (const cookie of [owner, w1.cookie, other])
    for (const path of ["/admin/overview", "/admin/groups/" + group.id])
      assert.equal((await request(cookie, path)).status, 403);
  const adminId = (await ok(admin, "/me")).user.id;
  const f = await file(w1.cookie, "Adjunto antiguo de soporte");
  const legacy = await one(
    pool,
    "INSERT INTO conversations(group_id,kind,name,created_by) VALUES($1,'support','Consulta retirada',$2) RETURNING id",
    [group.id, w1.id],
  );
  await pool.query(
    "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)",
    [legacy.id, w1.id, adminId],
  );
  await pool.query(
    "INSERT INTO messages(conversation_id,sender_id,body,file_id,idempotency_key) VALUES($1,$2,$3,$4,$5)",
    [legacy.id, w1.id, "Mensaje antiguo", f.id, randomUUID()],
  );
  await pool.query(
    "INSERT INTO notifications(user_id,title,path,subject_id,dedupe) VALUES($1,'Aviso antiguo',$2,$3,$4)",
    [w1.id, "/chats/" + legacy.id, legacy.id, randomUUID()],
  );
  const oldDirect = await one(
    pool,
    "INSERT INTO conversations(group_id,kind,name,created_by) VALUES($1,'direct','Dueño con administración',$2) RETURNING id",
    [group.id, adminId],
  );
  await pool.query(
    "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)",
    [
      oldDirect.id,
      owner === null ? null : (await ok(owner, "/me")).user.id,
      adminId,
    ],
  );
  for (const cookie of [owner, w1.cookie, admin]) {
    assert.equal(
      (await request(cookie, "/conversations/" + legacy.id)).status,
      cookie === admin ? 403 : 404,
    );
    assert.equal(
      (
        await request(cookie, "/conversations/" + legacy.id + "/messages", {
          body: "No se puede responder",
          idempotency_key: randomUUID(),
        })
      ).status,
      cookie === admin ? 403 : 404,
    );
    assert.equal(
      (await request(cookie, "/conversations/" + legacy.id + "/read", {}))
        .status,
      cookie === admin ? 403 : 404,
    );
    assert.equal(
      (
        await fetch(base + "/api/files/" + f.id, {
          headers: { Cookie: cookie },
        })
      ).status,
      403,
    );
  }
  assert(
    !(await ok(w1.cookie, "/conversations")).items.some(
      (c) => c.id === legacy.id,
    ),
  );
  assert(
    !(await ok(owner, "/conversations")).items.some(
      (c) => c.id === oldDirect.id,
    ),
  );
  assert(
    !(await ok(w1.cookie, "/notifications")).items.some(
      (n) => n.subject_id === legacy.id,
    ),
  );
  assert.equal(
    (
      await request(owner, "/conversations", {
        kind: "direct",
        members: [adminId],
        body: "No hay canal con administración",
        idempotency_key: randomUUID(),
      })
    ).status,
    400,
  );
  for (const path of [
    "/admin/notes",
    "/admin/activity",
    "/notifications",
    "/clients",
    "/products",
    "/purchases/" + p1.id,
    "/register/closings",
    "/conversations",
  ])
    assert.equal((await request(admin, path)).status, 403);
  assert.equal(
    (
      await request(
        admin,
        "/payments/" + randomUUID(),
        { amount: 1, reason: "No se permite" },
        "PATCH",
      )
    ).status,
    403,
  );
  await ok(admin, "/users/" + w1.id, { name: "Polaco revisado" }, "PATCH");
  assert.equal(
    (await ok(admin, "/users?group_id=" + group.id)).items.find(
      (u) => u.id === w1.id,
    ).name,
    "Polaco revisado",
  );
  const overview = await ok(
    admin,
    "/admin/overview?group_id=" + group.id + "&days=30",
  );
  assert.equal(overview.users, 3);
  assert.equal(overview.groups, 1);
  assert.equal(overview.owners, 1);
  assert.equal(overview.workers, 2);
  assert(overview.active_period >= 2);
  assert(overview.active_now >= 2);
  assert(overview.operations > 0);
  assert(overview.clients > 0);
  assert.equal(overview.timeline.length, 30);
  assert(overview.timeline.some((d) => d.users === null));
  assert(overview.group_activity.every((g) => g.id === group.id));
  for (const key of ["balance", "collected", "queue", "open_support", "notes"])
    assert.equal(overview[key], undefined);
  const repeated = await ok(admin, "/admin/overview?group_id=" + group.id);
  assert.equal(repeated.active_period, overview.active_period);
  assert.equal(
    (
      await one(
        pool,
        "SELECT count(*)::int AS n FROM platform_usage_daily WHERE user_id=$1",
        [adminId],
      )
    ).n,
    0,
  );
  assert.equal((await ok(admin, "/admin/groups/" + group.id)).id, group.id);
  assert.equal((await request(admin, "/admin/overview?days=500")).status, 400);
});
test("10 · Papelera restaura pagos sin stock duplicado y comprueba disponibilidad", async () => {
  const before = await getProduct();
  const old = await ok(w1.cookie, "/purchases/" + p1.id);
  await ok(w1.cookie, "/trash/purchase/" + p1.id, {});
  await ok(owner, "/trash/purchase/" + p1.id + "/restore", {});
  const after = await getProduct();
  assert.equal(after.available, before.available);
  assert.equal(after.assigned, before.assigned);
  const restored = await ok(w1.cookie, "/purchases/" + p1.id);
  assert.equal(restored.payments.length, old.payments.length);
  assert.equal(restored.ledger.balance, old.ledger.balance);
  const p = await buy(w1.cookie, c1, 75000);
  await ok(w1.cookie, "/trash/purchase/" + p.id, {});
  const current = await getProduct();
  await ok(
    owner,
    "/products/" + product.id,
    { available: 0, reason: "Sin existencias" },
    "PATCH",
  );
  assert.equal(
    (await request(owner, "/trash/purchase/" + p.id + "/restore", {})).status,
    409,
  );
  await ok(
    owner,
    "/products/" + product.id,
    { available: current.available, reason: "Recuperar disponibilidad" },
    "PATCH",
  );
  await ok(owner, "/trash/purchase/" + p.id + "/restore", {});
  assert.equal((await ok(w1.cookie, "/purchases/" + p.id)).status, "decision");
});
test("11 · Retirar libera cupo, restauración concurrente no supera límite y transferidos sobreviven purga", async () => {
  const ownerId = (await ok(owner, "/me")).user.id;
  const photo = await file(w1.cookie, "Foto comercial transferida");
  await ok(w1.cookie, "/clients/" + c1.id, { photo_id: photo.id }, "PATCH");
  await ok(owner, "/clients/" + c1.id + "/transfer", { owner_id: ownerId });
  assert.equal(
    (
      await fetch(base + "/api/files/" + photo.id, {
        headers: { Cookie: w1.cookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(w1.cookie, "/clients", {
        name: "Intento de volver a compartir",
        photo_id: photo.id,
      })
    ).status,
    400,
  );
  await ok(
    owner,
    "/clients/" + c1.id,
    { photo_id: photo.id, notes: "Foto conservada" },
    "PATCH",
  );
  await ok(owner, "/users/" + w1.id + "/retire", {
    mode: "transfer",
    owner_id: ownerId,
  });
  assert.equal((await request(w1.cookie, "/me")).status, 401);
  const replacement = await ok(owner, "/users", {
    name: "Reemplazo",
    username: "replacement_" + suffix,
    password,
  });
  assert.equal(
    (await request(owner, "/trash/user/" + w1.id + "/restore", {})).status,
    409,
  );
  await ok(owner, "/users/" + replacement.id + "/retire", { mode: "trash" });
  const race = await Promise.all([
    request(owner, "/trash/user/" + w1.id + "/restore", {}),
    request(owner, "/trash/user/" + replacement.id + "/restore", {}),
  ]);
  assert.equal(race.filter((r) => r.status === 200).length, 1);
  assert.equal(race.filter((r) => r.status === 409).length, 1);
  if (race[0].status === 200)
    await ok(owner, "/users/" + w1.id + "/retire", {
      mode: "transfer",
      owner_id: ownerId,
    });
  await ok(owner, "/trash/user/" + w1.id + "/purge", { confirm: "ELIMINAR" });
  assert.equal((await ok(owner, "/clients/" + c1.id)).owner_id, ownerId);
  const image = await fetch(base + "/api/files/" + photo.id, {
    headers: { Cookie: owner },
  });
  assert.equal(image.status, 200);
  assert.equal(await image.text(), "Foto comercial transferida");
  assert((await ok(owner, "/purchases/" + p1.id)).payments.length > 0);
  assert.equal(
    (
      await one(
        pool,
        "SELECT count(*)::int n FROM messages WHERE sender_id=$1",
        [w1.id],
      )
    ).n,
    0,
  );
});
test("12 · Purga a 30 días con reloj controlado elimina datos y adjuntos sin borrar otros mensajes", async () => {
  const ownerId = (await ok(owner, "/me")).user.id;
  const client = await newClient(w2.cookie, "Datos para purgar");
  const p = await buy(w2.cookie, client, 100000);
  await ok(w2.cookie, `/purchases/${p.id}/payments`, {
    amount: 10000,
    kind: "capital",
    paid_on: "2026-02-01",
    idempotency_key: randomUUID(),
  });
  const f = await file(w2.cookie, "Dato personal");
  await ok(w2.cookie, "/clients/" + client.id, { photo_id: f.id }, "PATCH");
  await ok(owner, "/users/" + w2.id + "/retire", { mode: "trash" });
  const future = new Date(Date.now() + 31 * 86400000);
  await runJobs(future, group.id);
  await runJobs(future, group.id);
  owner = await login("owner_" + suffix);
  assert.equal(
    await one(pool, "SELECT id FROM users WHERE id=$1", [w2.id]),
    undefined,
  );
  for (const [table, column, value] of [
    ["clients", "id", client.id],
    ["purchases", "id", p.id],
    ["payments", "purchase_id", p.id],
    ["audit", "entity_id", p.id],
    ["files", "id", f.id],
  ])
    assert.equal(
      (
        await one(
          pool,
          `SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`,
          [value],
        )
      ).n,
      0,
    );
  assert((await ok(owner, "/purchases/" + p1.id)).payments.length > 0);
  assert.equal((await ok(owner, "/clients/" + c1.id)).owner_id, ownerId);
});
test("13 · Cobros por fecha propia y cancelaciones conservan el dinero recibido", async () => {
  const client = await newClient(owner, "Cobro histórico QA");
  const p = await buy(owner, client, 100000);
  const payment = await ok(owner, `/purchases/${p.id}/payments`, {
    amount: 1234.56,
    kind: "capital",
    paid_on: "1999-06-01",
    idempotency_key: randomUUID(),
  });
  const reportPath = "/reports?from=1999-06-01&to=1999-06-01";
  let report = await ok(owner, reportPath);
  assert.equal(report.confirmed, 0);
  assert.equal(report.collected, 123456);
  await ok(owner, `/purchases/${p.id}/cancel`, {
    reason: "No continuar con la compra",
  });
  report = await ok(owner, reportPath);
  assert.equal(report.collected, 123456);
  assert.equal(report.balance, 0);
  const detail = (
    await ok(owner, "/clients?q=" + encodeURIComponent(client.name))
  ).items.find((c) => c.id === client.id);
  assert.equal(detail.paid, 123456);
  await ok(
    owner,
    "/payments/" + payment.id,
    { voided: true, reason: "Dinero devuelto" },
    "PATCH",
  );
  assert.equal((await ok(owner, reportPath)).collected, 0);
});
