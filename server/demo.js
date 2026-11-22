import { randomBytes, createHash } from "node:crypto";
import { tx, one, check, audit, notify } from "./db.js";
import { hashPassword } from "./auth.js";
import { makeSchedule, today } from "./money.js";
import { snapshot } from "./register.js";

const day = (offset) => today(new Date(Date.now() + offset * 86400000));
const products = [
  "Licuadora",
  "Arrocera",
  "Freidora de aire",
  "Cafetera",
  "Batidora",
  "Plancha de vapor",
  "Ventilador",
  "Microondas",
  "Horno eléctrico",
  "Parlante Bluetooth",
  "Audífonos",
  "Televisor",
  "Reloj inteligente",
  "Silla de escritorio",
  "Mesa plegable",
  "Juego de ollas",
  "Sartén",
  "Vajilla",
  "Juego de sábanas",
  "Edredón",
  "Almohada",
  "Zapatera",
  "Estante",
  "Lámpara",
];
const firstNames = [
  "Valeria",
  "Andrés",
  "Camila",
  "Diego",
  "Mariana",
  "Luis",
  "Isabella",
  "José",
  "Gabriela",
  "Sebastián",
  "Natalia",
  "Carlos",
  "Paula",
  "David",
  "Lucía",
  "Gabriel",
  "Daniela",
  "Adrián",
  "Elena",
  "Javier",
  "Fernanda",
  "Pablo",
  "Alejandra",
  "Mateo",
];
const lastNames = [
  "Mora",
  "Jiménez",
  "Vargas",
  "Rojas",
  "Solano",
  "Castro",
  "Araya",
  "Vega",
];

export async function seedDemo() {
  await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(290120)");
    if (await one(db, "SELECT 1 FROM demo_state")) return;
    // Refuse a live database rather than adding open demo access to existing records.
    check(
      !(await one(db, "SELECT 1 FROM groups LIMIT 1")) &&
        !(await one(db, "SELECT 1 FROM users WHERE role<>'admin' LIMIT 1")),
      "La copia de pruebas necesita una base nueva e independiente",
    );
    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    let mainOwner, mainWorker;
    for (let team = 0; team < 2; team++) {
      const group = await one(
        db,
        "INSERT INTO groups(name,polaco_limit) VALUES($1,8) RETURNING *",
        [team ? "Equipo Pacífico · Demo" : "Equipo Central · Demo"],
      );
      const actors = [];
      for (let i = 0; i < 4; i++) {
        actors.push(
          await one(
            db,
            "INSERT INTO users(group_id,role,name,username,password_hash,preferences) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              group.id,
              i ? "polaco" : "owner",
              [
                "Dueño de prueba",
                "Polaco de prueba",
                "Lucía Vargas · Demo",
                "Daniel Mora · Demo",
              ][i] + (team ? " · Pacífico" : ""),
              `demo_${team}_${i}`,
              passwordHash,
              JSON.stringify({
                onboarded: true,
                palette: ["forest", "ocean", "plum", "earth"][i],
                theme: "light",
              }),
            ],
          ),
        );
      }
      if (!team) [mainOwner, mainWorker] = actors;
      const catalog = [];
      for (let i = 0; i < (team ? 12 : 48); i++) {
        const p = await one(
          db,
          "INSERT INTO products(group_id,name,description,price,available,created_at,purchase_cost,profit_percent) VALUES($1,$2,$3,$4::bigint,50,$5,$4::bigint*4/5,25) RETURNING *",
          [
            group.id,
            products[i % 24] + (i >= 24 ? " Plus" : ""),
            "Producto ficticio para probar catálogo, inventario y ventas a crédito",
            (12500 + ((i * 13750) % 175000)) * 100,
            day(-40) + "T12:00:00Z",
          ],
        );
        catalog.push(p);
        await audit(
          db,
          actors[0],
          "product",
          p.id,
          "Crear producto de demostración",
        );
      }
      for (let i = 0; i < (team ? 24 : 80); i++) {
        const actor = actors[i % 4];
        const client = await one(
          db,
          "INSERT INTO clients(group_id,owner_id,name,address,notes,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            group.id,
            actor.id,
            `${firstNames[i % 24]} ${lastNames[i % 8]} · Demo ${i + 1}`,
            ["Alajuela", "Heredia", "San José", "Cartago"][i % 4] +
              " · Dirección ficticia",
            [
              "Cobro de ejemplo los viernes",
              "Confirmar antes de pasar a cobrar",
              "Cliente ficticio con varias compras",
              "Entrega de ejemplo completada",
            ][i % 4],
            day(-38) + "T12:00:00Z",
          ],
        );
        await audit(
          db,
          actor,
          "client",
          client.id,
          "Crear cliente de demostración",
        );
        for (let j = 0; j < 2; j++) {
          const n = i * 2 + j,
            product = catalog[n % catalog.length];
          const pending = actor.role === "polaco" && n % 9 === 0;
          const cancelled = n % 23 === 0;
          const paid = !pending && !cancelled && n % 6 === 0 && n % 7 !== 0;
          const status = pending
            ? "pending"
            : cancelled
              ? "cancelled"
              : paid
                ? "paid"
                : "active";
          const price = pending ? (product.price * 9) / 10 : product.price;
          const plan = {
            frequency: ["weekly", "monthly", "biweekly", "daily"][n % 4],
            start: day(n % 3 === 0 ? -28 : n % 3 === 1 ? -7 : 7),
            day: 15,
            installment: Math.ceil(price / 100 / 8 / 500) * 500,
          };
          const purchase = await one(
            db,
            "INSERT INTO purchases(group_id,client_id,product_id,product_name,original_price,unit_price,quantity,status,plan,schedule,had_assignment,created_by,idempotency_key,created_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
            [
              group.id,
              client.id,
              product.id,
              product.name,
              product.price,
              price,
              status,
              JSON.stringify(plan),
              JSON.stringify(makeSchedule(price, plan)),
              !pending && !cancelled,
              actor.id,
              "demo-buy-" + n,
              day(-35 + (n % 8)) + "T12:00:00Z",
            ],
          );
          if (!cancelled) {
            await db.query(
              `UPDATE products SET available=available-1,${pending ? "reserved" : "assigned"}=${pending ? "reserved" : "assigned"}+1 WHERE id=$1`,
              [product.id],
            );
            await db.query(
              "INSERT INTO inventory_movements(group_id,product_id,purchase_id,actor_id,quantity,kind,reason) VALUES($1,$2,$3,$4,1,$5,'Compra de demostración')",
              [
                group.id,
                product.id,
                purchase.id,
                actor.id,
                pending ? "reserve" : "assign",
              ],
            );
          }
          await audit(
            db,
            actor,
            "purchase",
            purchase.id,
            "Compra de demostración",
          );
          if (pending) {
            await db.query(
              "INSERT INTO price_requests(purchase_id,requester_id,version,price,reason,discount_percent) VALUES($1,$2,1,$3,'Descuento ficticio por revisar',10)",
              [purchase.id, actor.id, price],
            );
            await notify(
              db,
              actors[0].id,
              "Revisar precio de prueba",
              client.name,
              "/requests",
              purchase.id,
              "demo-price-" + n,
            );
          } else if (!cancelled && n % 7 !== 0) {
            for (
              let paymentIndex = 0;
              paymentIndex < (paid ? 1 : 2);
              paymentIndex++
            ) {
              const amount = paid ? price : Math.floor(price / 5);
              const cash =
                n % 4 === 0 ? amount : n % 4 === 3 ? Math.floor(amount / 2) : 0;
              const sinpe = n % 4 === 1 ? amount : 0;
              const card = amount - cash - sinpe;
              const date = day(-7 + paymentIndex + (n % 5));
              const payment = await one(
                db,
                "INSERT INTO payments(purchase_id,amount,kind,paid_on,note,created_by,idempotency_key,payment_cash,payment_sinpe,payment_card,cash_received,cash_change,created_at) VALUES($1,$2,$3,$4,'Pago ficticio para explorar saldos y reportes',$5,$6,$7,$8,$9,$7,0,$10) RETURNING *",
                [
                  purchase.id,
                  amount,
                  n % 5 === 0 ? "capital" : "installment",
                  date,
                  actor.id,
                  `demo-pay-${n}-${paymentIndex}`,
                  cash,
                  sinpe,
                  card,
                  date + "T15:00:00Z",
                ],
              );
              await audit(
                db,
                actor,
                "payment",
                payment.id,
                "Pago de demostración",
              );
            }
          }
        }
      }
      for (let i = 0; i < 6; i++) {
        const from = actors[1 + (i % 3)],
          to = actors[1 + ((i + 1) % 3)];
        await db.query(
          "INSERT INTO access_grants(group_id,requester_id,target_id,permission,scope,all_clients,expires_at,status,reason) VALUES($1,$2,$3,$4,'Apoyo para ruta de cobros de prueba',$5,now()+interval '7 days',$6,'Solicitud ficticia')",
          [
            group.id,
            from.id,
            to.id,
            i % 2 ? "read" : "edit",
            i % 3 === 0,
            ["approved", "pending", "rejected"][i % 3],
          ],
        );
      }
      for (let i = 0; i < 8; i++) {
        const conversation = await one(
          db,
          "INSERT INTO conversations(group_id,kind,name,created_by) VALUES($1,$2,$3,$4) RETURNING *",
          [
            group.id,
            i % 2 ? "direct" : "group",
            [
              "Ruta de cobros",
              "Consulta de inventario",
              "Entregas semanales",
              "Seguimiento de cuotas",
            ][i % 4] +
              " · Demo " +
              (i + 1),
            actors[0].id,
          ],
        );
        const members = i % 2 ? actors.slice(0, 2) : actors;
        for (const user of members)
          await db.query(
            "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2)",
            [conversation.id, user.id],
          );
        for (let j = 0; j < 10; j++) {
          const sender = members[j % members.length];
          await db.query(
            "INSERT INTO messages(conversation_id,sender_id,body,idempotency_key) VALUES($1,$2,$3,$4)",
            [
              conversation.id,
              sender.id,
              [
                "Esta conversación contiene únicamente datos ficticios",
                "Ya revisé la ruta de cobros de ejemplo",
                "Confirmemos el inventario antes de asignar otra unidad",
                "El pago parcial de prueba ya está registrado",
                "Quedan cuotas próximas para esta semana",
              ][j % 5],
              `demo-chat-${i}-${j}`,
            ],
          );
        }
      }
      await db.query(
        "INSERT INTO cash_entries(group_id,actor_id,actor_name,scope,occurred_at,method,direction,amount,reason,idempotency_key,request_hash) VALUES($1,$2,$3,'personal',now()-interval '1 day','cash','out',50000,'Gasto ficticio de transporte','demo-entry','demo')",
        [group.id, actors[1].id, actors[1].name],
      );
      for (const [actor, scope] of [
        [actors[1], "personal"],
        [actors[0], "personal"],
        [actors[0], "team"],
      ]) {
        const data = await snapshot(db, actor, {
          from: day(-8) + "T00:00:00-06:00",
          to: new Date().toISOString(),
          scope,
        });
        const closing = await one(
          db,
          "INSERT INTO cash_closings(group_id,actor_id,actor_name,scope,period_from,period_to,snapshot,count,opening,actual_cash,actual_sinpe,actual_card,expected_cash,difference_cash,note,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,4000000,$9,$10,$11,$12,'Cierre ficticio con diferencia para probar la revisión',$13,$14) RETURNING *",
          [
            group.id,
            actor.id,
            actor.name,
            scope,
            data.period.from,
            data.period.to,
            JSON.stringify(data),
            JSON.stringify({ 20000: 2 }),
            data.collected.sinpe + data.movements.sinpe,
            data.collected.card + data.movements.card,
            data.collected.cash + data.movements.cash,
            4000000 - data.collected.cash - data.movements.cash,
            "demo-closing-" + scope,
            createHash("sha256").update(JSON.stringify(data)).digest("hex"),
          ],
        );
        if (actor.role === "polaco")
          await db.query(
            "INSERT INTO closing_submissions(closing_id,submitted_at,reviewed_at,reviewer_id,reviewer_name,note) VALUES($1,now(),now(),$2,$3,'Revisión ficticia de ejemplo')",
            [closing.id, actors[0].id, actors[0].name],
          );
      }
      await notify(
        db,
        actors[1].id,
        "Cierre de prueba revisado",
        "Puedes consultar la nota del dueño",
        "/register",
        group.id,
        "demo-closing-reviewed",
      );
    }
    await db.query(
      "INSERT INTO demo_state(id,owner_id,polaco_id) VALUES(true,$1,$2)",
      [mainOwner.id, mainWorker.id],
    );
  });
}
