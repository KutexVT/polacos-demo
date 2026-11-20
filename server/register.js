import { createHash } from "node:crypto";
import { pool, tx, one, check, audit, notify } from "./db.js";
import { write } from "./routes.js";
import { z, uuid, key, amount } from "./validate.js";
import { nonnegative } from "./payment-methods.js";
import { cents, ledger, today } from "./money.js";
import { cashGroups, methods, cashTotal } from "../shared/cash-count.js";
const zone = "America/Costa_Rica";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safe = (n) => {
  check(
    Number.isSafeInteger(n),
    "Reduce el intervalo: el importe excede el límite permitido",
  );
  return n;
};
const timestamp = z
  .string()
  .refine(
    (v) =>
      z.iso.datetime({ offset: true }).safeParse(v).success ||
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) &&
        z.iso.datetime().safeParse(v.length === 16 ? v + ":00Z" : v + "Z")
          .success),
    "Fecha y hora inválidas",
  );
const scopeSchema = z.enum(["personal", "team"]);
const periodSchema = z
  .object({
    from: timestamp,
    to: timestamp.optional(),
    scope: scopeSchema.default("personal"),
  })
  .strict();
const reason = z.string().trim().min(3).max(500);
const operational = (u) =>
  check(
    u.role !== "admin",
    "El administrador consulta cierres desde la revisión del grupo",
    403,
  );
function scopeFor(u, scope) {
  operational(u);
  check(
    scope === "personal" || u.role === "owner",
    "Solo el dueño puede reunir la caja del equipo",
    403,
  );
  return scope;
}
function groupFor(u, req) {
  const gid = u.role === "admin" ? uuid.parse(req.query.group_id) : u.group_id;
  check(gid, "Selecciona un grupo", 400);
  return gid;
}
async function instant(db, value) {
  const offset = /Z$|[+-]\d\d:\d\d$/.test(value);
  return (
    await one(
      db,
      `SELECT ${offset ? "$1::timestamptz" : "$1::timestamp AT TIME ZONE $2"} AS value`,
      offset ? [value] : [value, zone],
    )
  ).value;
}
async function period(db, input) {
  const b = periodSchema.parse(input),
    from = await instant(db, b.from),
    now = (await one(db, "SELECT clock_timestamp() AS value")).value,
    to = b.to ? await instant(db, b.to) : now;
  check(
    from < to && to <= now && to - from <= 31 * 86400000,
    "Usa un intervalo pasado de hasta 31 días con la hora final posterior a la inicial",
  );
  return { from: from.toISOString(), to: to.toISOString(), scope: b.scope };
}
export async function snapshot(db, u, input) {
  const range = await period(db, input);
  scopeFor(u, range.scope);
  const personal = range.scope === "personal" ? u.id : null;
  const sales = (
    await db.query(
      `SELECT p.id,p.purchase_id,p.amount,p.kind,p.paid_on,p.note,p.created_at,p.voided,p.payment_cash,p.payment_sinpe,p.payment_card,p.cash_received,p.cash_change,p.created_by AS seller_id,COALESCE(u.name,'Usuario retirado') AS seller_name,c.name AS client_name,s.product_name,s.quantity
 FROM payments p JOIN purchases s ON s.id=p.purchase_id JOIN clients c ON c.id=s.client_id LEFT JOIN users u ON u.id=p.created_by
 WHERE s.group_id=$1 AND p.created_at >= $2 AND p.created_at < $3 AND NOT p.voided AND ($4::uuid IS NULL OR p.created_by=$4) ORDER BY p.created_at,p.id LIMIT 2001`,
      [u.group_id, range.from, range.to, personal],
    )
  ).rows;
  const entries = (
    await db.query(
      `SELECT * FROM cash_entries WHERE group_id=$1 AND occurred_at >= $2 AND occurred_at < $3 AND ($4::uuid IS NULL OR (scope='personal' AND actor_id=$4)) ORDER BY occurred_at,id LIMIT 2001`,
      [u.group_id, range.from, range.to, personal],
    )
  ).rows;
  check(
    sales.length <= 2000 && entries.length <= 2000,
    "Hay más de 2000 cobros o movimientos. Reduce el intervalo",
  );
  const purchases = (
    await db.query(
      `SELECT s.*,c.name AS client_name,c.owner_id,COALESCE(u.name,'Usuario retirado') AS owner_name FROM purchases s JOIN clients c ON c.id=s.client_id LEFT JOIN users u ON u.id=c.owner_id
 WHERE s.group_id=$1 AND s.created_at<$2 AND s.status IN ('active','paid') AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND ($3::uuid IS NULL OR c.owner_id=$3) ORDER BY s.created_at,s.id LIMIT 2001`,
      [u.group_id, range.to, personal],
    )
  ).rows;
  check(
    purchases.length <= 2000,
    "Hay demasiadas compras pendientes para este resumen. Reduce los registros consultados",
  );
  const allPayments = purchases.length
    ? (
        await db.query(
          "SELECT * FROM payments WHERE purchase_id=ANY($1::uuid[]) AND created_at<$2 ORDER BY created_at,id",
          [purchases.map((p) => p.id), range.to],
        )
      ).rows
    : [];
  const byPurchase = new Map();
  for (const p of allPayments) {
    const rows = byPurchase.get(p.purchase_id) || [];
    rows.push(p);
    byPurchase.set(p.purchase_id, rows);
  }
  const pending = purchases
    .map((p) => ({
      id: p.id,
      client_name: p.client_name,
      product_name: p.product_name,
      owner_name: p.owner_name,
      balance: ledger(p, byPurchase.get(p.id) || [], today(new Date(range.to)))
        .balance,
    }))
    .filter((p) => p.balance > 0);
  const events = (
    await db.query(
      `SELECT a.id,a.created_at,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,COALESCE(u.name,'Usuario retirado') AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id
 WHERE a.group_id=$1 AND a.created_at >= $2 AND a.created_at < $3 AND ($4::uuid IS NULL OR a.actor_id=$4) ORDER BY a.created_at DESC,a.id DESC LIMIT 501`,
      [u.group_id, range.from, range.to, personal],
    )
  ).rows;
  const collected = { cash: 0, sinpe: 0, card: 0 },
    movements = { cash: 0, sinpe: 0, card: 0 },
    sellers = new Map();
  let total = 0,
    unclassified = 0,
    unclassified_total = 0;
  for (const s of sales) {
    total = safe(total + s.amount);
    let seller = sellers.get(s.seller_id);
    if (!seller) {
      seller = {
        id: s.seller_id,
        name: s.seller_name,
        payments: 0,
        total: 0,
        cash: 0,
        sinpe: 0,
        card: 0,
      };
      sellers.set(s.seller_id, seller);
    }
    seller.payments++;
    seller.total = safe(seller.total + s.amount);
    if (s.payment_cash == null) {
      unclassified++;
      unclassified_total = safe(unclassified_total + s.amount);
    }
    for (const m of methods) {
      collected[m] = safe(collected[m] + (s["payment_" + m] || 0));
      seller[m] = safe(seller[m] + (s["payment_" + m] || 0));
    }
  }
  for (const e of entries)
    movements[e.method] = safe(
      movements[e.method] + (e.direction === "in" ? e.amount : -e.amount),
    );
  return {
    period: range,
    currency: "CRC",
    timezone: zone,
    total,
    collected,
    movements,
    unclassified,
    unclassified_total,
    sellers: [...sellers.values()],
    sales,
    entries,
    pending,
    events: events.slice(0, 500),
    more_events: events.length > 500,
  };
}
async function closing(db, u, id, gid) {
  const row = await one(
    db,
    `SELECT c.*,s.submitted_at,s.reviewed_at,s.reviewer_name,s.note AS review_note FROM cash_closings c LEFT JOIN closing_submissions s ON s.closing_id=c.id WHERE c.id=$1 AND c.group_id=$2`,
    [uuid.parse(id), gid],
  );
  check(
    row &&
      (u.role === "admin" ||
        row.actor_id === u.id ||
        (u.role === "owner" && row.submitted_at)),
    "Cierre no disponible",
    404,
  );
  return row;
}
async function duplicate(db, table, u, b) {
  const row = await one(
    db,
    `SELECT * FROM ${table} WHERE actor_id=$1 AND idempotency_key=$2`,
    [u.id, b.idempotency_key],
  );
  if (row)
    check(
      row.request_hash === digest(b),
      "Este intento ya guardó otros datos. Consulta el historial",
      409,
    );
  return row;
}
async function insertEntry(db, u, b, previous = null) {
  const entry = await one(
    db,
    `INSERT INTO cash_entries(group_id,actor_id,actor_name,scope,occurred_at,method,direction,amount,reason,reverses,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      u.group_id,
      u.id,
      u.name,
      previous?.scope || b.scope,
      previous?.occurred_at || (await instant(db, b.occurred_at)),
      previous?.method || b.method,
      previous ? (previous.direction === "in" ? "out" : "in") : b.direction,
      previous?.amount || cents(b.amount),
      b.reason,
      previous?.id || null,
      b.idempotency_key,
      digest(b),
    ],
  );
  await audit(
    db,
    u,
    "cash_entry",
    entry.id,
    previous ? "Anular movimiento de caja" : "Registrar movimiento de caja",
    previous,
    entry,
  );
  return entry;
}
export function registerRoutes(app) {
  app.get("/api/register/settings", async (req, res) => {
    const u = req.user,
      scope = scopeFor(u, scopeSchema.parse(req.query.scope || "personal"));
    const s = await one(
      pool,
      `SELECT to_char(COALESCE(r.day_start,'00:00'::time),'HH24:MI') AS day_start,r.opening_default,to_char(((clock_timestamp() AT TIME ZONE $3-COALESCE(r.day_start,'00:00'::time))::date+COALESCE(r.day_start,'00:00'::time)),'YYYY-MM-DD"T"HH24:MI') AS period_from FROM (SELECT 1) x LEFT JOIN register_settings r ON r.user_id=$1 AND r.scope=$2`,
      [u.id, scope, zone],
    );
    res.json(s);
  });
  write(
    app,
    "put",
    "/api/register/settings",
    z
      .object({
        scope: scopeSchema,
        day_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        opening_default: amount.nullable(),
      })
      .strict(),
    async (db, u, b) => {
      scopeFor(u, b.scope);
      const before = await one(
        db,
        "SELECT * FROM register_settings WHERE user_id=$1 AND scope=$2",
        [u.id, b.scope],
      );
      await db.query(
        `INSERT INTO register_settings(group_id,user_id,scope,day_start,opening_default) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope) DO UPDATE SET day_start=EXCLUDED.day_start,opening_default=EXCLUDED.opening_default`,
        [
          u.group_id,
          u.id,
          b.scope,
          b.day_start,
          b.opening_default == null ? null : nonnegative(b.opening_default),
        ],
      );
      const after = await one(
        db,
        "SELECT * FROM register_settings WHERE user_id=$1 AND scope=$2",
        [u.id, b.scope],
      );
      await audit(db, u, "register", u.id, "Configurar caja", before, after);
      return { ok: true };
    },
  );
  app.post("/api/register/preview", async (req, res) => {
    res.json(
      await tx(async (db) => {
        const u = await one(
          db,
          "SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL",
          [req.user.id],
        );
        check(u, "Cuenta retirada", 401);
        const data = await snapshot(db, u, req.body);
        return { ...data, fingerprint: digest(data) };
      }, "polacos-writes"),
    );
  });
  write(
    app,
    "post",
    "/api/register/entries",
    z
      .object({
        scope: scopeSchema,
        method: z.enum(methods),
        direction: z.enum(["in", "out"]),
        amount,
        occurred_at: timestamp,
        reason,
        idempotency_key: key,
      })
      .strict(),
    async (db, u, b) => {
      scopeFor(u, b.scope);
      const old = await duplicate(db, "cash_entries", u, b);
      if (old) return old;
      check(
        (await instant(db, b.occurred_at)) <= new Date(),
        "El movimiento no puede tener una fecha futura",
      );
      return insertEntry(db, u, b);
    },
  );
  write(
    app,
    "post",
    "/api/register/entries/:id/reverse",
    z.object({ reason, idempotency_key: key }).strict(),
    async (db, u, b, req) => {
      operational(u);
      const previous = await one(
        db,
        "SELECT * FROM cash_entries WHERE id=$1 AND group_id=$2 AND actor_id=$3",
        [uuid.parse(req.params.id), u.group_id, u.id],
      );
      check(previous && !previous.reverses, "Movimiento no disponible", 404);
      const old = await duplicate(db, "cash_entries", u, b);
      if (old) {
        check(
          old.reverses === previous.id,
          "La clave ya se utilizó para otro movimiento",
          409,
        );
        return old;
      }
      check(
        !(await one(db, "SELECT 1 FROM cash_entries WHERE reverses=$1", [
          previous.id,
        ])),
        "Este movimiento ya está anulado",
        409,
      );
      return insertEntry(db, u, b, previous);
    },
  );
  write(
    app,
    "post",
    "/api/register/closings",
    z
      .object({
        period: periodSchema,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        opening: amount,
        counts: z.record(z.string(), z.number().int().min(0).max(1000000)),
        actual_sinpe: amount.nullable(),
        actual_card: amount.nullable(),
        note: z.string().trim().max(1000),
        supersedes: uuid.nullable(),
        confirmed: z.literal(true),
        idempotency_key: key,
      })
      .strict(),
    async (db, u, b) => {
      scopeFor(u, b.period.scope);
      const old = await duplicate(db, "cash_closings", u, b);
      if (old) return closing(db, u, old.id, u.group_id);
      const allowed = cashGroups.flatMap((g) => g.values).map(String);
      check(
        Object.keys(b.counts).every((k) => allowed.includes(k)),
        "Denominación de efectivo desconocida",
      );
      const data = await snapshot(db, u, b.period);
      check(
        digest(data) === b.fingerprint,
        "El resumen cambió. Actualízalo y revisa la diferencia antes de guardar",
        409,
      );
      const opening = nonnegative(b.opening),
        actual_cash = safe(cashTotal(allowed, b.counts)),
        actual_sinpe =
          b.actual_sinpe == null ? null : nonnegative(b.actual_sinpe),
        actual_card = b.actual_card == null ? null : nonnegative(b.actual_card);
      const expected = safe(
          opening + data.collected.cash + data.movements.cash,
        ),
        difference = safe(actual_cash - expected);
      const differences = [
        difference,
        ...["sinpe", "card"].map((m) =>
          (m === "sinpe" ? actual_sinpe : actual_card) == null
            ? 0
            : (m === "sinpe" ? actual_sinpe : actual_card) -
              data.collected[m] -
              data.movements[m],
        ),
      ];
      check(
        (!differences.some((n) => n !== 0) && !data.unclassified) ||
          b.note.length >= 3,
        "Añade una observación para guardar un cierre con diferencias o pagos sin clasificar",
      );
      if (b.supersedes) {
        const prev = await closing(db, u, b.supersedes, u.group_id);
        check(
          prev.actor_id === u.id &&
            prev.scope === data.period.scope &&
            prev.period_from.toISOString() === data.period.from &&
            prev.period_to.toISOString() === data.period.to,
          "La revisión debe conservar autor alcance e intervalo del cierre anterior",
        );
      }
      const result = await one(
        db,
        `INSERT INTO cash_closings(group_id,actor_id,actor_name,scope,period_from,period_to,snapshot,count,opening,actual_cash,actual_sinpe,actual_card,expected_cash,difference_cash,note,supersedes,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [
          u.group_id,
          u.id,
          u.name,
          data.period.scope,
          data.period.from,
          data.period.to,
          JSON.stringify(data),
          JSON.stringify(b.counts),
          opening,
          actual_cash,
          actual_sinpe,
          actual_card,
          expected,
          difference,
          b.note,
          b.supersedes,
          b.idempotency_key,
          digest(b),
        ],
      );
      await audit(
        db,
        u,
        "cash_closing",
        result.id,
        "Guardar cierre de caja",
        null,
        {
          id: result.id,
          scope: result.scope,
          period: data.period,
          opening,
          expected_cash: expected,
          actual_cash,
          difference_cash: difference,
          supersedes: b.supersedes,
        },
      );
      return result;
    },
  );
  app.get("/api/register/closings", async (req, res) => {
    const u = req.user,
      gid = groupFor(u, req),
      q = z
        .object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          scope: scopeSchema.optional(),
          inbox: z.enum(["true"]).optional(),
          offset: z.coerce.number().int().min(0).max(1000000).default(0),
        })
        .parse(req.query);
    if (q.inbox)
      check(u.role === "owner", "Solo el dueño revisa cierres enviados", 403);
    if (q.scope === "team" && u.role === "polaco")
      check(false, "Solo el dueño consulta la caja del equipo", 403);
    const rows = (
      await pool.query(
        `SELECT c.id,c.actor_id,c.actor_name,c.scope,c.created_at,c.period_from,c.period_to,c.currency,c.opening,c.actual_cash,c.expected_cash,c.difference_cash,c.supersedes,s.submitted_at,s.reviewed_at,s.reviewer_name,s.note AS review_note FROM cash_closings c LEFT JOIN closing_submissions s ON s.closing_id=c.id
   WHERE c.group_id=$1 AND ($2::boolean OR c.actor_id=$3 OR ($4::boolean AND s.closing_id IS NOT NULL))
   AND (NOT $5::boolean OR (s.closing_id IS NOT NULL AND c.actor_id<>$3))
   AND ($6::text IS NULL OR c.scope=$6) AND ($7::date IS NULL OR c.period_from>=($7::timestamp AT TIME ZONE $9)) AND ($8::date IS NULL OR c.period_from<(($8::date+1)::timestamp AT TIME ZONE $9))
   ORDER BY c.created_at DESC,c.id LIMIT 51 OFFSET $10`,
        [
          gid,
          u.role === "admin",
          u.id,
          u.role === "owner" && !!q.inbox,
          !!q.inbox,
          q.scope || null,
          q.from || null,
          q.to || null,
          zone,
          q.offset,
        ],
      )
    ).rows;
    res.json({ rows: rows.slice(0, 50), has_more: rows.length > 50 });
  });
  app.get("/api/register/closings/:id", async (req, res) =>
    res.json(
      await closing(pool, req.user, req.params.id, groupFor(req.user, req)),
    ),
  );
  write(
    app,
    "post",
    "/api/register/closings/:id/submit",
    z.object({}).strict(),
    async (db, u, b, req) => {
      check(
        u.role === "polaco",
        "Solo un polaco envía su cierre al dueño",
        403,
      );
      const row = await closing(db, u, req.params.id, u.group_id);
      check(row.actor_id === u.id, "Solo puedes enviar tu propio cierre", 403);
      const owner = await one(
        db,
        "SELECT * FROM users WHERE group_id=$1 AND role='owner' AND deleted_at IS NULL",
        [u.group_id],
      );
      check(owner, "El dueño no está disponible");
      const inserted = await db.query(
        "INSERT INTO closing_submissions(closing_id) VALUES($1) ON CONFLICT DO NOTHING",
        [row.id],
      );
      if (inserted.rowCount) {
        await audit(
          db,
          u,
          "cash_closing",
          row.id,
          "Enviar cierre al dueño",
          null,
          { id: row.id },
        );
        await notify(
          db,
          owner.id,
          "Cierre de caja para revisar",
          u.name,
          "/register?closing=" + row.id,
          row.id,
          "closing:" + row.id,
        );
      }
      return closing(db, u, row.id, u.group_id);
    },
  );
  write(
    app,
    "post",
    "/api/register/closings/:id/review",
    z.object({ note: z.string().trim().max(1000).default("") }).strict(),
    async (db, u, b, req) => {
      check(u.role === "owner", "Solo el dueño revisa el cierre", 403);
      const row = await closing(db, u, req.params.id, u.group_id);
      check(row.submitted_at, "El cierre no fue enviado para revisión");
      if (!row.reviewed_at) {
        await db.query(
          "UPDATE closing_submissions SET reviewed_at=clock_timestamp(),reviewer_id=$2,reviewer_name=$3,note=$4 WHERE closing_id=$1",
          [row.id, u.id, u.name, b.note],
        );
        await audit(
          db,
          u,
          "cash_closing",
          row.id,
          "Revisar cierre de caja",
          null,
          { note: b.note },
        );
        if (
          await one(
            db,
            "SELECT 1 FROM users WHERE id=$1 AND deleted_at IS NULL",
            [row.actor_id],
          )
        )
          await notify(
            db,
            row.actor_id,
            "Cierre revisado por el dueño",
            b.note || "El dueño revisó tu cierre",
            "/register?closing=" + row.id,
            row.id,
            "closing-reviewed:" + row.id,
          );
      }
      return closing(db, u, row.id, u.group_id);
    },
  );
}
