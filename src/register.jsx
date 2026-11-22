import { useState, useEffect } from "react";
import {
  Plus,
  ArrowLeft,
  RefreshCw,
  Settings2,
  Send,
  Wallet,
} from "lucide-react";
import { api, money, time, day, labels, id as newId } from "./api";
import { useApp } from "./main";
import { Heading } from "./commerce";
import {
  Button,
  Field,
  Form,
  Modal,
  State,
  Empty,
  RecordTable,
  useData,
} from "./ui";
import { CashCounter } from "./cash-counter";
import {
  cashGroups,
  cashTotal,
  cashQuantity,
  methods,
  methodNames,
} from "../shared/cash-count";
const allValues = cashGroups.flatMap((g) => g.values);
const localTime = (value) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const difference = (n) =>
  n === 0 ? "Cuadra" : `${n < 0 ? "Faltan" : "Sobran"} ${money(Math.abs(n))}`;
const units = (n) => (n === null ? "" : String(n / 100));
function Reconciliation({ data, opening, actual }) {
  return (
    <section className="register-reconciliation">
      <h2>Comparación del dinero</h2>
      <RecordTable>
        <thead>
          <tr>
            <th>Medio</th>
            <th>Esperado</th>
            <th>Contado / calculado</th>
            <th>Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m) => {
            const expected =
              data.collected[m] +
              data.movements[m] +
              (m === "cash" ? opening : 0);
            return (
              <tr key={m}>
                <td>{methodNames[m]}</td>
                <td>{money(expected)}</td>
                <td>{m === "cash" ? money(actual.cash) : money(expected)}</td>
                <td>
                  {m === "cash"
                    ? difference(actual.cash - expected)
                    : "Se suma al total"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </RecordTable>
      <div className="closing-total">
        <span>Total del cierre</span>
        <strong>
          {money(
            actual.cash +
              data.collected.sinpe +
              data.movements.sinpe +
              data.collected.card +
              data.movements.card,
          )}
        </strong>
      </div>
      <p className="muted">
        Solo se compara el efectivo contado. SINPE y tarjeta se suman
        automáticamente según los movimientos registrados
      </p>
    </section>
  );
}
function EventValue({ value }) {
  if (!value) return <p>Sin registro</p>;
  const fields = {
    amount: "Monto",
    payment_cash: "Efectivo",
    payment_sinpe: "SINPE",
    payment_card: "Tarjeta",
    cash_received: "Efectivo entregado",
    cash_change: "Vuelto",
    unit_price: "Precio unitario",
    quantity: "Cantidad",
    product_name: "Producto",
    paid_on: "Fecha del pago",
    voided: "Anulado",
    status: "Estado",
    scope: "Caja",
    direction: "Tipo",
    method: "Medio",
    reason: "Motivo",
    note: "Observaciones",
    opening: "Fondo inicial",
    expected_cash: "Efectivo esperado",
    actual_cash: "Efectivo contado",
    difference_cash: "Diferencia en efectivo",
    opening_default: "Fondo habitual",
    day_start: "Inicio del día de trabajo",
  };
  const monetary = new Set([
    "amount",
    "payment_cash",
    "payment_sinpe",
    "payment_card",
    "cash_received",
    "cash_change",
    "unit_price",
    "opening",
    "expected_cash",
    "actual_cash",
    "difference_cash",
    "opening_default",
  ]);
  const entries = Object.entries(fields).filter(
    ([k]) => value[k] !== undefined && value[k] !== null && value[k] !== "",
  );
  const display = (k, v) =>
    monetary.has(k)
      ? money(v)
      : k === "voided"
        ? v
          ? "Sí"
          : "No"
        : k === "scope"
          ? v === "team"
            ? "Equipo"
            : "Personal"
          : k === "direction"
            ? v === "in"
              ? "Entrada"
              : "Salida"
            : k === "method"
              ? methodNames[v]
              : k === "paid_on"
                ? day(v)
                : labels[v] || String(v);
  return entries.length ? (
    <dl className="register-event-values">
      {entries.map(([k, label]) => (
        <div key={k}>
          <dt>{label}</dt>
          <dd>{display(k, value[k])}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p>Cambio de los datos de la compra</p>
  );
}
function SummaryDetails({ data, editable, onReverse }) {
  const a = useApp();
  return (
    <div className="register-details">
      <dl className="register-totals">
        <div>
          <dt>Cobros del intervalo</dt>
          <dd>{money(data.total)}</dd>
        </div>
        <div>
          <dt>Sin clasificar</dt>
          <dd>{money(data.unclassified_total)}</dd>
        </div>
        <div>
          <dt>Compras con saldo</dt>
          <dd>{data.pending.length}</dd>
        </div>
      </dl>
      {data.unclassified > 0 && (
        <p className="notice">
          {data.unclassified} pagos no tienen medio de cobro registrado. El
          esperado por medio está incompleto hasta asignarles un medio de pago
        </p>
      )}
      <p className="muted">
        Se usa la fecha y hora original de registro del cobro. Incluye cuotas y
        abonos al capital. Las correcciones actualizan el resumen antes de
        guardarlo
      </p>
      <details>
        <summary>Cobros registrados ({data.sales.length})</summary>
        <div className="register-grid">
          {data.sales.map((p) => (
            <article className="register-record" key={p.id}>
              <h3>{p.client_name}</h3>
              <p>
                {p.product_name} ·{" "}
                {p.kind === "capital" ? "Abono al capital" : "Pago de cuotas"}
              </p>
              <strong>{money(p.amount)}</strong>
              <p>
                {p.seller_name} · {time(p.created_at)}
              </p>
              <p>
                {p.payment_cash == null
                  ? "Medio sin clasificar"
                  : methods
                      .map(
                        (m) =>
                          methodNames[m] + ": " + money(p["payment_" + m] || 0),
                      )
                      .join(" · ")}
              </p>
              <Button
                variant="quiet"
                onClick={() => a.navigate("/purchases/" + p.purchase_id)}
              >
                Consultar compra actual
              </Button>
            </article>
          ))}
        </div>
        {!data.sales.length && <p>Sin cobros registrados en este intervalo</p>}
      </details>
      <details>
        <summary>Cobros por persona</summary>
        <RecordTable>
          <thead>
            <tr>
              <th>Registró el cobro</th>
              <th>Pagos</th>
              <th>Total</th>
              <th>Efectivo</th>
              <th>SINPE</th>
              <th>Tarjeta</th>
            </tr>
          </thead>
          <tbody>
            {data.sellers.map((s, i) => (
              <tr key={s.id || i}>
                <td>{s.name}</td>
                <td>{s.payments}</td>
                <td>{money(s.total)}</td>
                <td>{money(s.cash)}</td>
                <td>{money(s.sinpe)}</td>
                <td>{money(s.card)}</td>
              </tr>
            ))}
          </tbody>
        </RecordTable>
      </details>
      <details>
        <summary>
          Entradas y salidas adicionales ({data.entries.length})
        </summary>
        <p className="muted">
          Gastos · retiros · aportes · devoluciones. No vuelvas a añadir los
          cobros registrados
        </p>
        <div className="register-grid">
          {data.entries.map((e) => (
            <article className="register-record" key={e.id}>
              <h3>
                {e.direction === "in" ? "Entrada" : "Salida"} ·{" "}
                {money(e.amount)}
              </h3>
              <p>
                {methodNames[e.method]} ·{" "}
                {e.scope === "team" ? "Caja del equipo" : "Caja personal"}
              </p>
              <p>{e.reason}</p>
              <p>
                {time(e.occurred_at)} · {e.actor_name}
              </p>
              {e.reverses ? (
                <small>Anulación de un movimiento anterior</small>
              ) : data.entries.some((x) => x.reverses === e.id) ? (
                <small>Anulado con contrapartida</small>
              ) : (
                editable &&
                e.actor_id === a.user.id && (
                  <Button variant="quiet" onClick={() => onReverse(e)}>
                    Anular movimiento
                  </Button>
                )
              )}
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>
          Compras con saldo al consultar el corte ({data.pending.length})
        </summary>
        <p className="muted">
          Usa las condiciones actuales de las compras y los pagos registrados
          antes del corte. Los saldos no suman dinero a la caja
        </p>
        <div className="register-grid">
          {data.pending.map((p) => (
            <article className="register-record" key={p.id}>
              <h3>{p.client_name}</h3>
              <p>
                {p.product_name} · {p.owner_name}
              </p>
              <strong>{money(p.balance)}</strong>
              <Button
                variant="quiet"
                onClick={() => a.navigate("/purchases/" + p.id)}
              >
                Consultar compra actual
              </Button>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>
          Actividad del intervalo ({data.events.length}
          {data.more_events ? "+" : ""})
        </summary>
        {data.events.map((e) => (
          <details className="register-event" key={e.id}>
            <summary>
              {e.action} · {e.actor_name} · {time(e.created_at)}
            </summary>
            <div className="register-audit">
              <div>
                <h3>Antes</h3>
                <EventValue value={e.before_data} />
              </div>
              <div>
                <h3>Después</h3>
                <EventValue value={e.after_data} />
              </div>
            </div>
          </details>
        ))}
        {data.more_events && <p>Se muestran los últimos 500 eventos</p>}
      </details>
    </div>
  );
}
export function CashRegister() {
  const a = useApp(),
    admin = a.admin,
    owner = a.user.role === "owner",
    counts = a.cashCounts,
    setCounts = a.setCashCounts;
  const [scope, setScope] = useState("personal"),
    [inbox, setInbox] = useState(false),
    [view, setView] = useState("history"),
    [selected, setSelected] = useState(null),
    [summary, setSummary] = useState(null),
    [revising, setRevising] = useState(null),
    [confirmation, setConfirmation] = useState(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [opening, setOpening] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null),
    [offset, setOffset] = useState(0),
    [historyFrom, setHistoryFrom] = useState(""),
    [historyTo, setHistoryTo] = useState(""),
    [key, setKey] = useState(newId);
  const settings = useData(
    admin ? null : "/register/settings?scope=" + scope,
    a.revision,
  );
  const history = useData(
    a.scope(
      `/register/closings?offset=${offset}${admin ? "" : inbox ? "&inbox=true" : "&scope=" + scope}${historyFrom ? "&from=" + historyFrom : ""}${historyTo ? "&to=" + historyTo : ""}`,
    ),
    a.revision,
  );
  const request = (path, options) => api(a.scope("/register" + path), options);
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function show(id) {
    await run(async () => {
      setSelected(await request("/closings/" + id));
      setView("saved");
    });
  }
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("closing");
    if (id) show(id);
  }, []);
  const invalidate = () => {
    setSummary(null);
    setConfirmation(null);
    setKey(newId());
  };
  function start(previous = null) {
    setRevising(previous);
    setView("draft");
    setSelected(null);
    setError("");
    invalidate();
    setFrom(
      previous ? localTime(previous.period_from) : settings.data.period_from,
    );
    setTo(previous ? localTime(previous.period_to) : "");
    setOpening(
      previous ? units(previous.opening) : units(settings.data.opening_default),
    );
    setNote("");
    if (previous)
      setCounts(
        Object.fromEntries(
          Object.entries(previous.count).map(([v, n]) => [v, String(n)]),
        ),
      );
  }
  async function preview() {
    await run(async () => {
      setSummary(null);
      setConfirmation(null);
      setKey(newId());
      setSummary(
        await request("/preview", {
          method: "POST",
          body: revising
            ? {
                from: revising.period_from,
                to: revising.period_to,
                scope: revising.scope,
              }
            : { from, ...(to ? { to } : {}), scope },
        }),
      );
    });
  }
  const actual = {
    cash: cashTotal(allValues, counts),
    sinpe: summary ? summary.collected.sinpe + summary.movements.sinpe : 0,
    card: summary ? summary.collected.card + summary.movements.card : 0,
  };
  const openAmount = opening === "" ? null : Math.round(Number(opening) * 100);
  const changeScope = (value) => {
    setInbox(value === "inbox");
    if (value !== "inbox") setScope(value);
    setOffset(0);
  };
  return (
    <section className="register-page">
      <Heading
        title="Cierre de caja"
        description={
          admin
            ? "Consulta los cierres guardados y las revisiones de este equipo"
            : "Compara el dinero contado con los cobros y guarda cada revisión"
        }
      >
        {view === "history" ? (
          !admin && (
            <Button
              icon={Plus}
              disabled={!settings.data || settings.loading || busy || inbox}
              onClick={() => start()}
            >
              Nuevo cierre
            </Button>
          )
        ) : (
          <Button
            icon={ArrowLeft}
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setView("history");
              setError("");
              setConfirmation(null);
            }}
          >
            Historial de cierres
          </Button>
        )}
      </Heading>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {view === "history" && (
        <>
          <div className="register-filters">
            {owner && (
              <Field label="Caja">
                <select
                  value={inbox ? "inbox" : scope}
                  onChange={(e) => changeScope(e.target.value)}
                >
                  <option value="personal">Solo mis cobros</option>
                  <option value="team">Todo el equipo</option>
                  <option value="inbox">Enviados para revisar</option>
                </select>
              </Field>
            )}
            <Field
              label="Desde"
              type="date"
              value={historyFrom}
              onChange={(e) => {
                setHistoryFrom(e.target.value);
                setOffset(0);
              }}
            />
            <Field
              label="Hasta"
              type="date"
              value={historyTo}
              onChange={(e) => {
                setHistoryTo(e.target.value);
                setOffset(0);
              }}
            />
            {!admin && !inbox && (
              <Button
                variant="secondary"
                icon={Settings2}
                disabled={settings.loading}
                onClick={() =>
                  setModal({
                    type: "settings",
                    day_start: settings.data?.day_start || "00:00",
                    opening_default: units(
                      settings.data?.opening_default ?? null,
                    ),
                  })
                }
              >
                Configurar horario y fondo
              </Button>
            )}
          </div>
          <p className="muted">
            Cada cierre es una revisión independiente. Las revisiones del mismo
            período no se suman como ingresos
          </p>
          {owner && scope === "team" && !inbox && (
            <p className="notice">
              Incluye los cobros de todas las personas y los movimientos
              personales y del equipo una sola vez. El conteo debe reunir el
              efectivo de esas cajas
            </p>
          )}
          <State {...history}>
            {history.data?.rows.length ? (
              <div className="register-grid">
                {history.data.rows.map((c) => (
                  <article className="register-record" key={c.id}>
                    <h2>{difference(c.difference_cash)}</h2>
                    <p>
                      {time(c.period_from)} → {time(c.period_to)}
                    </p>
                    <p>
                      {c.actor_name} ·{" "}
                      {c.scope === "team" ? "Equipo" : "Personal"}
                    </p>
                    <p>
                      Esperado {money(c.expected_cash)} · Contado{" "}
                      {money(c.actual_cash)}
                    </p>
                    {c.submitted_at && (
                      <span className="register-status">
                        {c.reviewed_at
                          ? "Revisado por el dueño"
                          : "Enviado · Pendiente de revisión"}
                      </span>
                    )}
                    {c.supersedes && (
                      <small>Revisión de un cierre anterior</small>
                    )}
                    <Button variant="secondary" onClick={() => show(c.id)}>
                      Ver cierre
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={Wallet}
                title={
                  inbox
                    ? "Sin cierres enviados"
                    : "Sin cierres en este intervalo"
                }
              >
                {admin
                  ? "Los cierres guardados aparecerán aquí"
                  : inbox
                    ? "Los polacos pueden enviar su cierre después de guardarlo"
                    : "Cuenta el efectivo y guarda tu primera revisión"}
              </Empty>
            )}
          </State>
          <div className="register-pagination">
            <Button
              variant="quiet"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Anterior
            </Button>
            <span>Página {offset / 50 + 1}</span>
            <Button
              variant="quiet"
              disabled={!history.data?.has_more}
              onClick={() => setOffset(offset + 50)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      {view === "draft" && !confirmation && (
        <>
          <p className="register-scope">
            {scope === "team" ? "Caja de todo el equipo" : "Solo mis cobros"}
          </p>
          <div className="register-filters">
            <Field
              label="Desde · Costa Rica"
              type="datetime-local"
              value={from}
              disabled={!!revising}
              onChange={(e) => {
                setFrom(e.target.value);
                invalidate();
              }}
            />
            <Field
              label="Hasta · vacío = ahora"
              type="datetime-local"
              value={to}
              disabled={!!revising}
              onChange={(e) => {
                setTo(e.target.value);
                invalidate();
              }}
            />
            <Button
              variant="secondary"
              icon={RefreshCw}
              busy={busy}
              disabled={!from}
              onClick={preview}
            >
              Actualizar resumen
            </Button>
          </div>
          <p className="muted">
            Detén los cobros mientras cuentas el efectivo. El corte queda fijado
            al actualizar el resumen. Los cobros posteriores quedan fuera de ese
            corte
          </p>
          {revising && (
            <p className="notice">
              Esta revisión conserva el intervalo anterior. El cierre original
              sigue guardado
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              setModal({ type: "entry", idempotency_key: newId() })
            }
          >
            Registrar entrada o salida
          </Button>
          {summary && (
            <>
              <p className="register-cutoff">
                Corte: {time(summary.period.to)} · Costa Rica
              </p>
              <SummaryDetails
                data={summary}
                editable
                onReverse={(entry) =>
                  setModal({ type: "reverse", entry, idempotency_key: newId() })
                }
              />
              <Form
                submit="Revisar cierre de caja"
                onSubmit={async () => {
                  if (actual.cash === null)
                    throw new Error("Revisa las cantidades del conteo");
                  setConfirmation({
                    period: summary.period,
                    fingerprint: summary.fingerprint,
                    opening,
                    counts: Object.fromEntries(
                      allValues.map((v) => [v, cashQuantity(counts[v])]),
                    ),
                    note,
                    supersedes: revising?.id || null,
                    confirmed: true,
                    idempotency_key: key,
                  });
                }}
              >
                <Field
                  label="Fondo inicial de este intervalo (₡)"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  hint="Dinero que ya había antes de los cobros. Indica 0 solo si empezaste sin efectivo"
                />
                <CashCounter counts={counts} onChange={setCounts} embedded />
                {openAmount !== null && actual.cash !== null && (
                  <Reconciliation
                    data={summary}
                    opening={openAmount}
                    actual={actual}
                  />
                )}
                <p className="muted">
                  Efectivo esperado = fondo inicial + cobros en efectivo +
                  entradas − salidas
                </p>
                <Field label="Observaciones">
                  <textarea
                    value={note}
                    maxLength={1000}
                    placeholder="Explica diferencias o pagos sin medio de pago"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
              </Form>
            </>
          )}
        </>
      )}
      {view === "draft" && confirmation && (
        <section className="register-confirm">
          <h2>Confirmar cierre de caja</h2>
          <p>Se guardará este conteo junto al resumen del intervalo</p>
          <Reconciliation data={summary} opening={openAmount} actual={actual} />
          <p>{confirmation.note || "Sin observaciones"}</p>
          <Button variant="secondary" onClick={() => setConfirmation(null)}>
            Volver a revisar
          </Button>
          <Form
            submit="Confirmar y guardar cierre"
            onSubmit={async () => {
              const saved = await request("/closings", {
                method: "POST",
                body: confirmation,
              });
              setSelected(saved);
              setView("saved");
              setConfirmation(null);
              a.refresh("Cierre guardado");
            }}
          />
        </section>
      )}
      {view === "saved" && selected && (
        <>
          <div className="section-heading">
            <div>
              <h2>Cierre guardado</h2>
              <p>
                {time(selected.period_from)} → {time(selected.period_to)}
              </p>
              <p>
                {selected.actor_name} ·{" "}
                {selected.scope === "team" ? "Equipo" : "Personal"} ·{" "}
                {time(selected.created_at)}
              </p>
            </div>
            {!admin && selected.actor_id === a.user.id && (
              <Button
                variant="secondary"
                onClick={() => {
                  setScope(selected.scope);
                  start(selected);
                }}
              >
                Crear revisión de este cierre
              </Button>
            )}
          </div>
          <p className="muted">
            Estos valores se conservaron al guardar. Consultar una compra abre
            su estado actual
          </p>
          {selected.supersedes && (
            <Button variant="quiet" onClick={() => show(selected.supersedes)}>
              Ver cierre anterior
            </Button>
          )}
          <Reconciliation
            data={selected.snapshot}
            opening={selected.opening}
            actual={{
              cash: selected.actual_cash,
              sinpe:
                selected.snapshot.collected.sinpe +
                selected.snapshot.movements.sinpe,
              card:
                selected.snapshot.collected.card +
                selected.snapshot.movements.card,
            }}
          />
          <p>Fondo inicial: {money(selected.opening)}</p>
          <p>{selected.note || "Sin observaciones"}</p>
          <details className="register-saved-count">
            <summary>Conteo de billetes y monedas</summary>
            {Object.entries(selected.count)
              .filter(([, n]) => n > 0)
              .map(([v, n]) => (
                <p key={v}>
                  {n} × {money(Number(v) * 100)} = {money(Number(v) * n * 100)}
                </p>
              ))}
            <strong>Total: {money(selected.actual_cash)}</strong>
          </details>
          {selected.submitted_at ? (
            <div className="register-delivery">
              <h3>
                {selected.reviewed_at
                  ? "Revisado por el dueño"
                  : "Enviado al dueño · Pendiente de revisión"}
              </h3>
              {selected.reviewed_at && (
                <p>
                  {selected.reviewer_name} · {time(selected.reviewed_at)}
                  {selected.review_note && " · " + selected.review_note}
                </p>
              )}
            </div>
          ) : (
            a.user.role === "polaco" &&
            selected.actor_id === a.user.id && (
              <Button
                icon={Send}
                busy={busy}
                onClick={() =>
                  run(async () => {
                    setSelected(
                      await request("/closings/" + selected.id + "/submit", {
                        method: "POST",
                        body: {},
                      }),
                    );
                    a.refresh("Cierre enviado al dueño");
                  })
                }
              >
                Enviar al dueño
              </Button>
            )
          )}
          {owner && selected.submitted_at && !selected.reviewed_at && (
            <Form
              submit="Marcar revisado"
              onSubmit={async (b) => {
                setSelected(
                  await request("/closings/" + selected.id + "/review", {
                    method: "POST",
                    body: b,
                  }),
                );
                a.refresh("Revisión guardada");
              }}
            >
              <Field label="Nota para el polaco">
                <textarea name="note" maxLength={1000} />
              </Field>
            </Form>
          )}
          <SummaryDetails data={selected.snapshot} editable={false} />
        </>
      )}
      {modal?.type === "settings" && (
        <Modal title="Horario y fondo inicial" onClose={() => setModal(null)}>
          <p>
            Valores para nuevos cierres de{" "}
            {scope === "team" ? "todo el equipo" : "tu caja personal"}. Puedes
            ajustar el fondo y las fechas en cada revisión
          </p>
          <Form
            submit="Guardar configuración"
            onSubmit={async (b) => {
              await request("/settings", {
                method: "PUT",
                body: {
                  ...b,
                  scope,
                  opening_default:
                    b.opening_default.trim() === "" ? null : b.opening_default,
                },
              });
              setModal(null);
              a.refresh("Configuración de caja guardada");
            }}
          >
            <Field
              label="Inicio del día de trabajo"
              name="day_start"
              type="time"
              required
              defaultValue={modal.day_start}
            />
            <Field
              label="Fondo inicial habitual (₡)"
              name="opening_default"
              type="number"
              min="0"
              step="0.01"
              placeholder="Sin definir"
              defaultValue={modal.opening_default}
            />
          </Form>
        </Modal>
      )}
      {["entry", "reverse"].includes(modal?.type) && (
        <Modal
          title={
            modal.type === "reverse"
              ? "Anular movimiento"
              : "Movimiento adicional"
          }
          onClose={() => setModal(null)}
        >
          <Form
            submit={
              modal.type === "reverse"
                ? "Confirmar anulación"
                : "Guardar movimiento"
            }
            onSubmit={async (b) => {
              if (modal.type === "reverse")
                await request("/entries/" + modal.entry.id + "/reverse", {
                  method: "POST",
                  body: {
                    reason: b.reason,
                    idempotency_key: modal.idempotency_key,
                  },
                });
              else
                await request("/entries", {
                  method: "POST",
                  body: { ...b, scope, idempotency_key: modal.idempotency_key },
                });
              setModal(null);
              invalidate();
              a.refresh("Movimiento guardado");
            }}
          >
            {modal.type === "entry" ? (
              <>
                <Field label="Tipo">
                  <select name="direction">
                    <option value="out">Salida</option>
                    <option value="in">Entrada</option>
                  </select>
                </Field>
                <Field label="Medio">
                  <select name="method">
                    {methods.map((m) => (
                      <option value={m} key={m}>
                        {methodNames[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Importe (₡)"
                  name="amount"
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                />
                <Field
                  label="Fecha del movimiento · Costa Rica"
                  name="occurred_at"
                  type="datetime-local"
                  required
                  defaultValue={localTime(new Date())}
                />
              </>
            ) : (
              <p>
                Se guardará una contrapartida por {money(modal.entry.amount)}.
                El movimiento original se conserva
              </p>
            )}
            <Field label="Motivo">
              <textarea name="reason" minLength={3} maxLength={500} required />
            </Field>
          </Form>
        </Modal>
      )}
    </section>
  );
}
