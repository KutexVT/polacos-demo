import { pool, tx, one, check, audit, notify } from "./db.js";
import { percentageBasis, percentagePrice } from "../shared/pricing.js";
import { paymentSchema, paymentMethodValues } from "./payment-methods.js";
import { publicUser, hashPassword } from "./auth.js";
import {
  groupAccess,
  manager,
  getClient,
  getPurchase,
  visibleClients,
  visiblePurchases,
  activeUser,
  ownFile,
  canClient,
} from "./access.js";
import {
  z,
  uuid,
  name,
  username,
  text,
  key,
  amount,
  plan,
  parse,
} from "./validate.js";
import { cents, makeSchedule, ledger, today, date } from "./money.js";
export const list = (rows, req) => {
  const q = String(req.query.q || "").toLocaleLowerCase("es");
  const filtered = q
    ? rows.filter((r) =>
        [
          r.name,
          r.phone,
          r.canton,
          r.province,
          r.client_name,
          r.product_name,
          r.username,
          r.requester_name,
          r.target_name,
          r.scope,
          r.creator_name,
          r.group_name,
        ].some((v) => v?.toLocaleLowerCase("es").includes(q)),
      )
    : rows;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return {
    items: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    page,
    pages: Math.max(1, Math.ceil(filtered.length / limit)),
  };
};
function catalogPrice(cost, profit) {
  const purchase_cost = cents(cost),
    basis = percentageBasis(profit);
  check(
    basis !== null && basis <= 1000000,
    "Indica una ganancia entre 0 y 10000% con hasta dos decimales",
  );
  const price = percentagePrice(purchase_cost, basis);
  check(
    price !== null,
    "El precio calculado debe ser al menos ₡5 y estar dentro del límite permitido",
  );
  return { purchase_cost, profit_percent: basis / 100, price };
}
function discountPrice(original, value) {
  const basis = percentageBasis(value);
  check(
    basis !== null && basis < 10000,
    "Indica un descuento entre 0 y 99,99% con hasta dos decimales",
  );
  const price = percentagePrice(original, -basis);
  check(
    price !== null && price <= original,
    "El redondeo debe producir un precio positivo que no supere el catálogo. Revisa el descuento",
  );
  return { price, discount: basis / 100 };
}
export function write(app, method, path, schema, fn) {
  app[method](path, async (req, res) => {
    const input = parse(schema, req);
    const result = await tx(async (db) => {
      const fresh = await one(
        db,
        "SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL",
        [req.user.id],
      );
      check(fresh, "La cuenta fue retirada", 401);
      check(
        await one(
          db,
          "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()",
          [req.sessionHash],
        ),
        "Tu sesión terminó",
        401,
      );
      req.user = fresh;
      return fn(db, fresh, input, req);
    }, "polacos-writes");
    res.json(result ?? { ok: true });
  });
}
export async function paymentRows(db, id) {
  return (
    await db.query(
      "SELECT p.*,u.name AS actor_name FROM payments p LEFT JOIN users u ON u.id=p.created_by WHERE p.purchase_id=$1 ORDER BY p.created_at,p.id",
      [id],
    )
  ).rows;
}
export async function enriched(db, p) {
  return { ...p, ledger: ledger(p, await paymentRows(db, p.id)) };
}
export async function stock(db, u, p, kind) {
  const quantity = p.quantity;
  const row = await one(db, "SELECT * FROM products WHERE id=$1 FOR UPDATE", [
    p.product_id,
  ]);
  check(row, "Producto no disponible");
  if (kind === "reserve" || kind === "assign") {
    check(
      !row.deleted_at && row.available >= quantity,
      "No hay suficientes unidades disponibles",
      409,
    );
    await db.query(
      `UPDATE products SET available=available-$2,${kind === "reserve" ? "reserved" : "assigned"}=${kind === "reserve" ? "reserved" : "assigned"}+$2 WHERE id=$1`,
      [row.id, quantity],
    );
  } else if (kind === "confirm") {
    check(row.reserved >= quantity, "La reserva ya no está disponible", 409);
    await db.query(
      "UPDATE products SET reserved=reserved-$2,assigned=assigned+$2 WHERE id=$1",
      [row.id, quantity],
    );
  } else if (kind === "release") {
    check(row.reserved >= quantity, "La reserva ya fue resuelta", 409);
    await db.query(
      "UPDATE products SET reserved=reserved-$2,available=available+$2 WHERE id=$1",
      [row.id, quantity],
    );
  }
  await db.query(
    "INSERT INTO inventory_movements(group_id,product_id,purchase_id,actor_id,quantity,kind,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      p.group_id,
      row.id,
      p.id,
      u.id,
      quantity,
      kind,
      {
        reserve: "Reserva por precio pendiente",
        assign: "Compra confirmada",
        confirm: "Reserva confirmada",
        release: "Reserva liberada",
      }[kind],
    ],
  );
}
export async function cancelPending(db, u, p) {
  if (["pending", "decision"].includes(p.status)) {
    await stock(db, u, p, "release");
    await db.query(
      "UPDATE price_requests SET status='cancelled',decided_at=now(),decided_by=$2 WHERE purchase_id=$1 AND status='pending'",
      [p.id, u.id],
    );
    await db.query(
      "UPDATE purchases SET status='cancelled',version=version+1 WHERE id=$1",
      [p.id],
    );
  }
}
export function routes(app) {
  app.get("/api/me", async (req, res) => {
    res.json({ user: publicUser(req.user), today: today() });
  });
  write(
    app,
    "patch",
    "/api/me",
    z.object({
      name: name.optional(),
      palette: z.enum(["forest", "ocean", "plum", "earth"]).optional(),
      theme: z.enum(["light", "dark"]).optional(),
      onboarded: z.boolean().optional(),
      password: z.string().optional(),
    }),
    async (db, u, b) => {
      const prefs = {
        ...u.preferences,
        ...(b.palette ? { palette: b.palette } : {}),
        ...(b.theme ? { theme: b.theme } : {}),
        ...(b.onboarded !== undefined ? { onboarded: b.onboarded } : {}),
      };
      await db.query(
        "UPDATE users SET name=$2,preferences=$3,password_hash=$4 WHERE id=$1",
        [
          u.id,
          b.name || u.name,
          prefs,
          b.password ? await hashPassword(b.password) : u.password_hash,
        ],
      );
      if (b.password)
        await db.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
      return { ok: true };
    },
  );
  app.get("/api/groups", async (req, res) => {
    check(req.user.role === "admin", "Solo para el administrador", 403);
    res.json(
      list(
        (
          await pool.query(
            "SELECT g.id,g.name,g.polaco_limit,g.created_at,count(u.id)::int AS used_slots FROM groups g LEFT JOIN users u ON u.group_id=g.id AND u.role='polaco' AND u.deleted_at IS NULL GROUP BY g.id ORDER BY g.created_at DESC",
          )
        ).rows,
        req,
      ),
    );
  });
  write(
    app,
    "post",
    "/api/groups",
    z.object({
      name,
      limit: z.coerce.number().int().min(0).max(10000),
      owner_name: name,
      username,
      password: z.string(),
    }),
    async (db, u, b) => {
      check(u.role === "admin", "Solo para el administrador", 403);
      const g = await one(
        db,
        "INSERT INTO groups(name,polaco_limit) VALUES($1,$2) RETURNING id,name,polaco_limit,created_at",
        [b.name, b.limit],
      );
      await db.query(
        "INSERT INTO users(group_id,role,name,username,password_hash) VALUES($1,'owner',$2,$3,$4)",
        [g.id, b.owner_name, b.username, await hashPassword(b.password)],
      );
      await audit(db, u, "group", g.id, "Crear grupo", null, {
        name: b.name,
        limit: b.limit,
      });
      return g;
    },
  );
  write(
    app,
    "patch",
    "/api/groups/:id",
    z.strictObject({
      name: name.optional(),
      limit: z.coerce.number().int().min(0).max(10000).optional(),
    }),
    async (db, u, b, req) => {
      check(
        u.role === "admin",
        "Solo el administrador organiza los grupos",
        403,
      );
      const g = await one(db, "SELECT * FROM groups WHERE id=$1", [
        req.params.id,
      ]);
      check(g, "Grupo no disponible", 404);
      const next = await one(
        db,
        "UPDATE groups SET name=$2,polaco_limit=$3 WHERE id=$1 RETURNING id,name,polaco_limit,created_at",
        [g.id, b.name ?? g.name, b.limit ?? g.polaco_limit],
      );
      await audit(db, u, "group", g.id, "Actualizar grupo", g, next);
      return next;
    },
  );
  app.get("/api/directory", async (req, res) => {
    res.json(
      (
        await pool.query(
          `SELECT u.id,u.name,u.username,u.role,u.group_id${req.user.role === "admin" ? ",g.name AS group_name" : ""} FROM users u LEFT JOIN groups g ON g.id=u.group_id WHERE u.deleted_at IS NULL AND ($1::uuid IS NULL OR u.group_id=$1) ORDER BY u.name`,
          [
            req.user.role === "admin"
              ? req.query.group_id || null
              : req.user.group_id,
          ],
        )
      ).rows,
    );
  });
  app.get("/api/users", async (req, res) => {
    check(req.user.role !== "polaco", "Solo para el dueño", 403);
    const gid =
      req.user.role === "admin"
        ? req.query.group_id || null
        : req.user.group_id;
    const rows = (
      await pool.query(
        `SELECT u.id,u.name,u.username,u.role,u.group_id,u.created_at${req.user.role === "admin" ? ",g.name AS group_name" : ""} FROM users u LEFT JOIN groups g ON g.id=u.group_id WHERE u.deleted_at IS NULL AND ($1::uuid IS NULL OR u.group_id=$1) ORDER BY u.created_at`,
        [gid],
      )
    ).rows;
    const group = gid
      ? await one(pool, "SELECT * FROM groups WHERE id=$1", [gid])
      : null;
    res.json({
      ...list(rows, req),
      limit: group?.polaco_limit,
      used: rows.filter((r) => r.role === "polaco").length,
    });
  });
  write(
    app,
    "post",
    "/api/users",
    z.object({
      group_id: uuid.optional(),
      name,
      username,
      password: z.string(),
    }),
    async (db, u, b) => {
      const gid = u.role === "admin" ? b.group_id : u.group_id;
      manager(u, gid);
      const g = await one(db, "SELECT * FROM groups WHERE id=$1", [gid]);
      check(g, "Elige un grupo");
      const n = await one(
        db,
        "SELECT count(*)::int n FROM users WHERE group_id=$1 AND role='polaco' AND deleted_at IS NULL",
        [gid],
      );
      check(
        n.n < g.polaco_limit,
        `Tu cuenta permite hasta ${g.polaco_limit} polacos y ya alcanzaste ese límite`,
        409,
      );
      const r = await one(
        db,
        "INSERT INTO users(group_id,role,name,username,password_hash) VALUES($1,'polaco',$2,$3,$4) RETURNING id,name,username,role,group_id",
        [gid, b.name, b.username, await hashPassword(b.password)],
      );
      await audit(db, u, "user", r.id, "Crear polaco", null, r);
      return r;
    },
  );
  write(
    app,
    "patch",
    "/api/users/:id",
    z.object({
      name: name.optional(),
      username: username.optional(),
      password: z.string().optional(),
    }),
    async (db, u, b, req) => {
      const target = await one(
        db,
        "SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL",
        [req.params.id],
      );
      check(target, "Usuario no disponible", 404);
      manager(u, target.group_id);
      check(
        target.role === "polaco" || u.role === "admin",
        "Solo puedes editar tus polacos",
        403,
      );
      await db.query(
        "UPDATE users SET name=$2,username=$3,password_hash=$4 WHERE id=$1",
        [
          target.id,
          b.name ?? target.name,
          b.username ?? target.username,
          b.password ? await hashPassword(b.password) : target.password_hash,
        ],
      );
      if (b.password)
        await db.query("DELETE FROM sessions WHERE user_id=$1", [target.id]);
      await audit(
        db,
        u,
        "user",
        target.id,
        b.password ? "Restablecer contraseña" : "Editar usuario",
        { name: target.name, username: target.username },
        { name: b.name, username: b.username },
      );
    },
  );
  app.get("/api/products", async (req, res) => {
    const gid =
      req.user.role === "admin"
        ? req.query.group_id || null
        : req.user.group_id;
    res.json(
      list(
        (
          await pool.query(
            "SELECT * FROM products WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1) ORDER BY name",
            [gid],
          )
        ).rows.map((p) => {
          if (req.user.role !== "polaco") return p;
          const { purchase_cost, profit_percent, ...visible } = p;
          return visible;
        }),
        req,
      ),
    );
  });
  write(
    app,
    "post",
    "/api/products",
    z.object({
      group_id: uuid.optional(),
      name,
      description: text,
      price: z.never().optional(),
      purchase_cost: amount,
      profit_percent: amount,
      available: z.coerce.number().int().min(0).max(1000000),
      image_id: uuid.nullable().optional(),
    }),
    async (db, u, b) => {
      const gid = u.role === "admin" ? b.group_id : u.group_id;
      manager(u, gid);
      check(gid, "Elige un grupo");
      await ownFile(db, u, b.image_id);
      const pricing = catalogPrice(b.purchase_cost, b.profit_percent);
      const p = await one(
        db,
        "INSERT INTO products(group_id,name,description,price,available,image_id,purchase_cost,profit_percent) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          gid,
          b.name,
          b.description,
          pricing.price,
          b.available,
          b.image_id || null,
          pricing.purchase_cost,
          pricing.profit_percent,
        ],
      );
      await db.query(
        "INSERT INTO inventory_movements(group_id,product_id,actor_id,quantity,kind,reason) VALUES($1,$2,$3,$4,'initial','Existencias iniciales')",
        [gid, p.id, u.id, b.available],
      );
      await audit(db, u, "product", p.id, "Crear producto", null, p);
      return p;
    },
  );
  write(
    app,
    "patch",
    "/api/products/:id",
    z.object({
      name: name.optional(),
      description: text.optional(),
      price: z.never().optional(),
      purchase_cost: amount.optional(),
      profit_percent: amount.optional(),
      available: z.coerce.number().int().min(0).max(1000000).optional(),
      reason: z.string().min(1).max(500),
      image_id: uuid.nullable().optional(),
    }),
    async (db, u, b, req) => {
      const p = await one(
        db,
        "SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL",
        [req.params.id],
      );
      check(p, "Producto no disponible", 404);
      manager(u, p.group_id);
      if (b.image_id !== p.image_id) await ownFile(db, u, b.image_id);
      check(
        (b.purchase_cost === undefined) === (b.profit_percent === undefined),
        "Indica el costo y el porcentaje juntos",
      );
      const pricing =
        b.purchase_cost === undefined
          ? p
          : catalogPrice(b.purchase_cost, b.profit_percent);
      const r = await one(
        db,
        "UPDATE products SET name=$2,description=$3,price=$4,available=$5,image_id=$6,purchase_cost=$7,profit_percent=$8 WHERE id=$1 RETURNING *",
        [
          p.id,
          b.name ?? p.name,
          b.description ?? p.description,
          pricing.price,
          b.available ?? p.available,
          b.image_id === undefined ? p.image_id : b.image_id,
          pricing.purchase_cost,
          pricing.profit_percent,
        ],
      );
      if (b.available !== undefined && b.available !== p.available)
        await db.query(
          "INSERT INTO inventory_movements(group_id,product_id,actor_id,quantity,kind,reason) VALUES($1,$2,$3,$4,'adjust',$5)",
          [p.group_id, p.id, u.id, b.available - p.available, b.reason],
        );
      await audit(db, u, "product", p.id, b.reason, p, r);
      return r;
    },
  );
  app.get("/api/products/:id/history", async (req, res) => {
    const p = await one(pool, "SELECT * FROM products WHERE id=$1", [
      req.params.id,
    ]);
    check(p, "Producto no disponible", 404);
    manager(req.user, p.group_id);
    res.json({
      movements: (
        await pool.query(
          "SELECT m.*,u.name AS actor_name FROM inventory_movements m LEFT JOIN users u ON u.id=m.actor_id WHERE product_id=$1 ORDER BY created_at DESC",
          [p.id],
        )
      ).rows,
      reservations: (
        await pool.query(
          "SELECT p.id,p.quantity,p.product_name,c.name AS client_name,u.name AS owner_name FROM purchases p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=c.owner_id WHERE p.product_id=$1 AND p.status IN ('pending','decision') AND p.deleted_at IS NULL",
          [p.id],
        )
      ).rows,
    });
  });
  app.get("/api/clients", async (req, res) => {
    const rows = await visibleClients(pool, req.user, req.query.group_id);
    const purchases = await visiblePurchases(
      pool,
      req.user,
      req.query.group_id,
    );
    const result = [];
    for (const c of rows) {
      let paid = 0,
        balance = 0;
      for (const p of purchases.filter(
        (p) => p.client_id === c.id && p.had_assignment,
      )) {
        const l = ledger(p, await paymentRows(pool, p.id));
        paid += l.paid;
        if (["active", "paid"].includes(p.status)) balance += l.balance;
      }
      result.push({
        ...c,
        paid,
        balance,
        can_edit: await canClient(pool, req.user, c, true),
      });
    }
    res.json(
      list(
        result.sort((a, b) => a.name.localeCompare(b.name)),
        req,
      ),
    );
  });
  write(
    app,
    "post",
    "/api/clients",
    z.object({
      group_id: uuid.optional(),
      owner_id: uuid.optional(),
      name,
      phone: z.string().max(40).default(""),
      address: z.string().max(1000).default(""),
      canton: z.string().trim().max(100).default(""),
      province: z.string().trim().max(100).default(""),
      notes: text,
      photo_id: uuid.nullable().optional(),
    }),
    async (db, u, b) => {
      const gid = u.role === "admin" ? b.group_id : u.group_id;
      groupAccess(u, gid);
      const owner = b.owner_id || u.id;
      if (owner !== u.id) manager(u, gid);
      await activeUser(db, owner, gid);
      await ownFile(db, u, b.photo_id);
      const c = await one(
        db,
        "INSERT INTO clients(group_id,owner_id,name,phone,address,notes,photo_id,canton,province) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          gid,
          owner,
          b.name,
          b.phone,
          b.address,
          b.notes,
          b.photo_id || null,
          b.canton,
          b.province,
        ],
      );
      await audit(db, u, "client", c.id, "Crear cliente", null, c);
      return c;
    },
  );
  app.get("/api/clients/:id", async (req, res) => {
    const c = await getClient(pool, req.user, req.params.id);
    const ps = await visiblePurchases(pool, req.user, c.group_id);
    res.json({
      ...c,
      can_edit: await canClient(pool, req.user, c, true),
      purchases: await Promise.all(
        ps.filter((p) => p.client_id === c.id).map((p) => enriched(pool, p)),
      ),
    });
  });
  write(
    app,
    "patch",
    "/api/clients/:id",
    z.object({
      name: name.optional(),
      phone: z.string().max(40).optional(),
      address: z.string().max(1000).optional(),
      canton: z.string().trim().max(100).optional(),
      province: z.string().trim().max(100).optional(),
      notes: text.optional(),
      photo_id: uuid.nullable().optional(),
    }),
    async (db, u, b, req) => {
      const c = await getClient(db, u, req.params.id, true);
      if (b.photo_id !== c.photo_id) await ownFile(db, u, b.photo_id);
      const n = await one(
        db,
        "UPDATE clients SET name=$2,phone=$3,address=$4,notes=$5,photo_id=$6,canton=$7,province=$8 WHERE id=$1 RETURNING *",
        [
          c.id,
          b.name ?? c.name,
          b.phone ?? c.phone,
          b.address ?? c.address,
          b.notes ?? c.notes,
          b.photo_id === undefined ? c.photo_id : b.photo_id,
          b.canton ?? c.canton,
          b.province ?? c.province,
        ],
      );
      await audit(db, u, "client", c.id, "Editar cliente", c, n);
      return n;
    },
  );
  write(
    app,
    "post",
    "/api/clients/:id/transfer",
    z.object({ owner_id: uuid }),
    async (db, u, b, req) => {
      const c = await getClient(db, u, req.params.id, true);
      manager(u, c.group_id);
      await activeUser(db, b.owner_id, c.group_id);
      await db.query("UPDATE clients SET owner_id=$2 WHERE id=$1", [
        c.id,
        b.owner_id,
      ]);
      await db.query(
        "UPDATE access_grants SET status='revoked' WHERE group_id=$1 AND target_id=$2 AND status IN ('pending','approved')",
        [c.group_id, c.owner_id],
      );
      await db.query(
        "DELETE FROM notifications WHERE subject_id=$1 OR subject_id IN (SELECT id FROM purchases WHERE client_id=$1)",
        [c.id],
      );
      await audit(
        db,
        u,
        "client",
        c.id,
        "Transferir cliente",
        { owner_id: c.owner_id },
        { owner_id: b.owner_id },
      );
    },
  );
  app.post("/api/schedule/preview", async (req, res) => {
    const b = parse(
      z.object({
        price: amount,
        quantity: z.coerce.number().int().min(1).max(1000000),
        plan,
      }),
      req,
    );
    res.json({ schedule: makeSchedule(cents(b.price) * b.quantity, b.plan) });
  });
  app.get("/api/purchases", async (req, res) => {
    let rows = await visiblePurchases(pool, req.user, req.query.group_id);
    if (req.query.owner_id)
      rows = rows.filter((p) => p.owner_id === req.query.owner_id);
    if (req.query.status)
      rows = rows.filter((p) => p.status === req.query.status);
    if (req.query.shared === "true")
      rows = rows.filter((p) => p.owner_id !== req.user.id);
    res.json(list(await Promise.all(rows.map((p) => enriched(pool, p))), req));
  });
  write(
    app,
    "post",
    "/api/purchases",
    z.object({
      client_id: uuid,
      product_id: uuid,
      quantity: z.coerce.number().int().min(1).max(1000000),
      price: amount.optional(),
      discount_percent: amount.optional(),
      plan,
      idempotency_key: key,
    }),
    async (db, u, b) => {
      check(
        u.role !== "admin",
        "La cuenta de administrador no crea compras",
        403,
      );
      const c = await getClient(db, u, b.client_id, true);
      const old = await one(
        db,
        "SELECT * FROM purchases WHERE created_by=$1 AND idempotency_key=$2",
        [u.id, b.idempotency_key],
      );
      if (old) {
        check(
          old.client_id === c.id,
          "La clave de operación ya fue utilizada",
          409,
        );
        return old;
      }
      const product = await one(
        db,
        "SELECT * FROM products WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
        [b.product_id, c.group_id],
      );
      check(product, "Producto no disponible");
      check(
        b.price === undefined || u.role === "owner",
        "Indica el descuento en porcentaje",
      );
      check(
        b.price === undefined || b.discount_percent === undefined,
        "Elige precio o descuento, no ambos",
      );
      const discounted =
        b.discount_percent === undefined
          ? null
          : discountPrice(product.price, b.discount_percent);
      const price = discounted
        ? discounted.price
        : b.price === undefined
          ? product.price
          : cents(b.price);
      const pending = u.role === "polaco" && price !== product.price;
      const schedule = makeSchedule(price * b.quantity, b.plan);
      const p = await one(
        db,
        "INSERT INTO purchases(group_id,client_id,product_id,product_name,original_price,unit_price,quantity,status,plan,schedule,created_by,idempotency_key,had_assignment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [
          c.group_id,
          c.id,
          product.id,
          product.name,
          product.price,
          price,
          b.quantity,
          pending ? "pending" : "active",
          b.plan,
          JSON.stringify(schedule),
          u.id,
          b.idempotency_key,
          !pending,
        ],
      );
      await stock(db, u, p, pending ? "reserve" : "assign");
      if (pending) {
        await db.query(
          "INSERT INTO price_requests(purchase_id,requester_id,version,price,discount_percent) VALUES($1,$2,1,$3,$4)",
          [p.id, u.id, price, discounted?.discount ?? null],
        );
        const owner = await one(
          db,
          "SELECT id FROM users WHERE group_id=$1 AND role='owner' AND deleted_at IS NULL",
          [c.group_id],
        );
        if (owner)
          await notify(
            db,
            owner.id,
            "Solicitud de precio",
            `${u.name} solicita un precio para ${c.name}`,
            "/requests",
            p.id,
            `price:${p.id}:1`,
          );
      }
      await audit(db, u, "purchase", p.id, "Crear compra", null, p);
      return p;
    },
  );
  app.get("/api/purchases/:id", async (req, res) => {
    const p = await getPurchase(pool, req.user, req.params.id);
    const c = await one(pool, "SELECT name,owner_id FROM clients WHERE id=$1", [
      p.client_id,
    ]);
    res.json({
      ...(await enriched(pool, p)),
      client_name: c.name,
      can_edit: await canClient(
        pool,
        req.user,
        { id: p.client_id, group_id: p.group_id, owner_id: p.owner_id },
        true,
        p.id,
      ),
      payments: await paymentRows(pool, p.id),
      requests: (
        await pool.query(
          "SELECT r.*,u.name AS actor_name FROM price_requests r LEFT JOIN users u ON u.id=r.decided_by WHERE purchase_id=$1 ORDER BY created_at",
          [p.id],
        )
      ).rows,
      audit: (
        await pool.query(
          "SELECT a.*,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE entity_id=$1 ORDER BY a.created_at DESC",
          [p.id],
        )
      ).rows,
    });
  });
  write(
    app,
    "post",
    "/api/purchases/:id/propose",
    z.object({ discount_percent: amount, plan }),
    async (db, u, b, req) => {
      const p = await getPurchase(db, u, req.params.id, true);
      check(
        ["pending", "decision"].includes(p.status),
        "Solo se proponen precios antes de confirmar",
        409,
      );
      const { price, discount } = discountPrice(
        p.original_price,
        b.discount_percent,
      );
      const schedule = makeSchedule(price * p.quantity, b.plan);
      await db.query(
        "UPDATE price_requests SET status='cancelled',decided_at=now(),decided_by=$2 WHERE purchase_id=$1 AND status='pending'",
        [p.id, u.id],
      );
      const n = await one(
        db,
        "UPDATE purchases SET unit_price=$2,plan=$3,schedule=$4,status='pending',version=version+1 WHERE id=$1 RETURNING *",
        [p.id, price, b.plan, JSON.stringify(schedule)],
      );
      await db.query(
        "INSERT INTO price_requests(purchase_id,requester_id,version,price,discount_percent) VALUES($1,$2,$3,$4,$5)",
        [p.id, u.id, n.version, price, discount],
      );
      const owner = await one(
        db,
        "SELECT id FROM users WHERE group_id=$1 AND role='owner'",
        [p.group_id],
      );
      await notify(
        db,
        owner.id,
        "Nueva propuesta de precio",
        p.product_name,
        "/requests",
        p.id,
        `price:${p.id}:${n.version}`,
      );
      await audit(db, u, "purchase", p.id, "Reenviar propuesta", p, n);
      return n;
    },
  );
  write(
    app,
    "post",
    "/api/purchases/:id/original",
    z.object({ plan }),
    async (db, u, b, req) => {
      const p = await getPurchase(db, u, req.params.id, true);
      check(
        ["pending", "decision"].includes(p.status),
        "La compra ya no está pendiente",
        409,
      );
      const schedule = makeSchedule(p.original_price * p.quantity, b.plan);
      await stock(db, u, p, "confirm");
      await db.query(
        "UPDATE purchases SET unit_price=original_price,status='active',had_assignment=true,plan=$2,schedule=$3,version=version+1 WHERE id=$1",
        [p.id, b.plan, JSON.stringify(schedule)],
      );
      await db.query(
        "UPDATE price_requests SET status='cancelled',decided_by=$2,decided_at=now() WHERE purchase_id=$1 AND status='pending'",
        [p.id, u.id],
      );
      await audit(db, u, "purchase", p.id, "Usar precio original", p, {
        unit_price: p.original_price,
        plan: b.plan,
      });
    },
  );
  write(
    app,
    "post",
    "/api/purchases/:id/cancel",
    z.object({ reason: z.string().min(1).max(500) }),
    async (db, u, b, req) => {
      const p = await getPurchase(db, u, req.params.id, true);
      if (p.status === "cancelled") return;
      await cancelPending(db, u, p);
      await db.query(
        "UPDATE purchases SET status='cancelled',version=version+1 WHERE id=$1",
        [p.id],
      );
      await audit(db, u, "purchase", p.id, "Cancelar compra", p, {
        reason: b.reason,
      });
    },
  );
  write(
    app,
    "patch",
    "/api/purchases/:id",
    z.object({
      price: amount.optional(),
      plan: plan.optional(),
      schedule: z
        .array(z.object({ id: z.string().max(70), due: z.string(), amount }))
        .max(1000)
        .optional(),
      reason: z.string().min(1).max(500),
    }),
    async (db, u, b, req) => {
      const p = await getPurchase(db, u, req.params.id, true);
      check(
        ["active", "paid"].includes(p.status),
        "Confirma primero el precio",
      );
      if (b.price !== undefined) manager(u, p.group_id);
      const payments = await paymentRows(db, p.id);
      const oldLedger = ledger(p, payments);
      const price = b.price === undefined ? p.unit_price : cents(b.price);
      let schedule = p.schedule;
      if (b.plan) {
        check(
          !payments.some((x) => !x.voided),
          "Con pagos registrados edita solo las cuotas futuras",
        );
        schedule = makeSchedule(price * p.quantity, b.plan);
      } else if (b.schedule) {
        schedule = b.schedule
          .map((r) => ({ ...r, due: date(r.due), amount: cents(r.amount) }))
          .sort((a, b) => a.due.localeCompare(b.due));
        check(
          new Set(schedule.map((r) => r.id)).size === schedule.length,
          "Cuotas duplicadas",
        );
        for (const r of p.schedule) {
          const state = oldLedger.schedule.find((s) => s.id === r.id);
          if (state.paid > 0 || r.due < today()) {
            const n = schedule.find((s) => s.id === r.id);
            check(
              n && n.due === r.due && n.amount === r.amount,
              "Conserva las cuotas pasadas o con pagos",
            );
          }
        }
      } else if (price !== p.unit_price) {
        check(false, "Revisa el calendario al corregir el precio");
      }
      const next = { ...p, unit_price: price, schedule };
      const l = ledger(next, payments);
      await db.query(
        "UPDATE purchases SET unit_price=$2,schedule=$3,plan=$4,status=$5 WHERE id=$1",
        [
          p.id,
          price,
          JSON.stringify(schedule),
          b.plan || p.plan,
          l.balance ? "active" : "paid",
        ],
      );
      await audit(db, u, "purchase", p.id, b.reason, p, next);
    },
  );
  app.get("/api/price-requests", async (req, res) => {
    const gid =
      req.user.role === "admin"
        ? req.query.group_id || null
        : req.user.group_id;
    const rows = (
      await pool.query(
        "SELECT r.*,p.product_name,p.quantity,p.original_price,p.plan,p.client_id,c.name AS client_name,u.name AS requester_name FROM price_requests r JOIN purchases p ON p.id=r.purchase_id JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=r.requester_id WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ($1::uuid IS NULL OR p.group_id=$1) AND ($2::uuid IS NULL OR r.requester_id=$2 OR c.owner_id=$2) ORDER BY r.created_at DESC",
        [gid, req.user.role === "polaco" ? req.user.id : null],
      )
    ).rows;
    res.json(
      list(
        req.query.status
          ? rows.filter((r) => r.status === req.query.status)
          : rows,
        req,
      ),
    );
  });
  write(
    app,
    "post",
    "/api/price-requests/:id/decide",
    z.object({
      decision: z.enum(["approved", "rejected"]),
      reason: z.string().max(1000).default(""),
      plan: plan.optional(),
    }),
    async (db, u, b, req) => {
      const r = await one(db, "SELECT * FROM price_requests WHERE id=$1", [
        req.params.id,
      ]);
      check(r, "Solicitud no disponible", 404);
      const p = await getPurchase(db, u, r.purchase_id, true);
      manager(u, p.group_id);
      check(
        r.status === "pending" &&
          p.status === "pending" &&
          r.version === p.version,
        "Esta propuesta ya fue resuelta o reemplazada",
        409,
      );
      if (b.decision === "approved") {
        check(b.plan, "Revisa el calendario antes de aprobar");
        const schedule = makeSchedule(r.price * p.quantity, b.plan);
        await stock(db, u, p, "confirm");
        await db.query(
          "UPDATE purchases SET status='active',had_assignment=true,unit_price=$2,plan=$3,schedule=$4 WHERE id=$1",
          [p.id, r.price, b.plan, JSON.stringify(schedule)],
        );
      } else
        await db.query("UPDATE purchases SET status='decision' WHERE id=$1", [
          p.id,
        ]);
      await db.query(
        "UPDATE price_requests SET status=$2,reason=$3,decided_by=$4,decided_at=now() WHERE id=$1",
        [r.id, b.decision, b.reason, u.id],
      );
      if (r.requester_id)
        await notify(
          db,
          r.requester_id,
          b.decision === "approved" ? "Precio aprobado" : "Precio rechazado",
          b.reason || p.product_name,
          `/purchases/${p.id}`,
          p.id,
          `decision:${r.id}`,
        );
      await audit(
        db,
        u,
        "purchase",
        p.id,
        b.decision === "approved" ? "Aprobar precio" : "Rechazar precio",
        r,
        { decision: b.decision, reason: b.reason },
      );
    },
  );
  write(
    app,
    "post",
    "/api/purchases/:id/payments",
    z.object({
      amount,
      kind: z.enum(["installment", "capital"]),
      targets: z.array(z.string().max(70)).max(1000).default([]),
      paid_on: z.string(),
      note: z.string().max(1000).default(""),
      payment: paymentSchema.optional(),
      idempotency_key: key,
    }),
    async (db, u, b, req) => {
      check(
        u.role !== "admin",
        "La cuenta de administrador no registra cobros. Puede corregir pagos existentes",
        403,
      );
      const p = await getPurchase(db, u, req.params.id, true);
      const duplicate = await one(
        db,
        "SELECT * FROM payments WHERE created_by=$1 AND idempotency_key=$2",
        [u.id, b.idempotency_key],
      );
      if (duplicate) {
        const split = paymentMethodValues(b.payment, cents(b.amount));
        check(
          Object.keys(split).every(
            (k) => (duplicate[k] ?? null) === split[k],
          ) &&
            duplicate.note === b.note &&
            duplicate.purchase_id === p.id &&
            duplicate.amount === cents(b.amount) &&
            duplicate.kind === b.kind &&
            duplicate.paid_on === b.paid_on &&
            JSON.stringify(duplicate.targets) === JSON.stringify(b.targets),
          "Este intento ya registró otro pago. Revisa el historial antes de continuar",
          409,
        );
        return duplicate;
      }
      check(
        p.status === "active",
        "Solo puedes cobrar una compra confirmada con saldo",
        409,
      );
      const pay = {
        amount: cents(b.amount),
        kind: b.kind,
        targets: b.targets,
        paid_on: date(b.paid_on),
        note: b.note,
        ...paymentMethodValues(b.payment, cents(b.amount)),
      };
      const result = ledger(p, [...(await paymentRows(db, p.id)), pay]);
      const created = await one(
        db,
        "INSERT INTO payments(purchase_id,amount,kind,targets,paid_on,note,created_by,idempotency_key,payment_cash,payment_sinpe,payment_card,cash_received,cash_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [
          p.id,
          pay.amount,
          pay.kind,
          JSON.stringify(pay.targets),
          pay.paid_on,
          pay.note,
          u.id,
          b.idempotency_key,
          pay.payment_cash,
          pay.payment_sinpe,
          pay.payment_card,
          pay.cash_received,
          pay.cash_change,
        ],
      );
      await db.query("UPDATE purchases SET status=$2 WHERE id=$1", [
        p.id,
        result.balance ? "active" : "paid",
      ]);
      await audit(db, u, "purchase", p.id, "Registrar pago", null, created);
      return created;
    },
  );
  write(
    app,
    "patch",
    "/api/payments/:id",
    z.object({
      amount: amount.optional(),
      paid_on: z.string().optional(),
      voided: z.boolean().optional(),
      payment: paymentSchema.optional(),
      reason: z.string().min(1).max(1000),
    }),
    async (db, u, b, req) => {
      const pay = await one(db, "SELECT * FROM payments WHERE id=$1", [
        req.params.id,
      ]);
      check(pay, "Pago no disponible", 404);
      const p = await getPurchase(db, u, pay.purchase_id, true);
      check(
        ["active", "paid", "cancelled"].includes(p.status),
        "Compra pendiente",
      );
      const n = {
        ...pay,
        amount: b.amount === undefined ? pay.amount : cents(b.amount),
        paid_on: b.paid_on ? date(b.paid_on) : pay.paid_on,
        voided: b.voided ?? pay.voided,
        ...paymentMethodValues(
          b.payment,
          b.amount === undefined ? pay.amount : cents(b.amount),
          pay,
        ),
      };
      const payments = (await paymentRows(db, p.id)).map((r) =>
        r.id === pay.id ? n : r,
      );
      const l = ledger(p, payments);
      await db.query(
        "UPDATE payments SET amount=$2,paid_on=$3,voided=$4,payment_cash=$5,payment_sinpe=$6,payment_card=$7,cash_received=$8,cash_change=$9 WHERE id=$1",
        [
          pay.id,
          n.amount,
          n.paid_on,
          n.voided,
          n.payment_cash,
          n.payment_sinpe,
          n.payment_card,
          n.cash_received,
          n.cash_change,
        ],
      );
      if (p.status !== "cancelled")
        await db.query("UPDATE purchases SET status=$2 WHERE id=$1", [
          p.id,
          l.balance ? "active" : "paid",
        ]);
      await audit(
        db,
        u,
        "purchase",
        p.id,
        "Corregir pago: " + b.reason,
        pay,
        n,
      );
      return n;
    },
  );
}
