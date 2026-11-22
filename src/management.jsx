import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Users,
  CalendarDays,
  Wallet,
  Building2,
  UserCog,
  Archive,
  RotateCcw,
  Trash2,
  Pencil,
  Bell,
  LogOut,
  Download,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { GroupFilter } from "./admin";
import { useApp, Palette } from "./main";
import { Heading } from "./commerce";
import { api, money, day, time, labels } from "./api";
import {
  Button,
  Field,
  Form,
  Modal,
  State,
  Empty,
  Badge,
  Pager,
  SearchBox,
  useData,
  RecordTable,
} from "./ui";
export function Dashboard() {
  const a = useApp(),
    state = useData(a.scope("/reports"), a.revision);
  const r = state.data;
  return (
    <>
      <Heading
        title={`Hola ${a.user.name.split(" ")[0]}`}
        description={day(a.session.today)}
      >
        <Button
          icon={a.admin ? Building2 : Plus}
          onClick={() => a.navigate(a.admin ? "/groups" : "/clients")}
        >
          {a.admin ? "Administrar grupos" : "Ver mis clientes"}
        </Button>
      </Heading>
      <State {...state}>
        {r && (
          <>
            <div className="overview-strip">
              <div>
                <span>Vendido confirmado</span>
                <strong>{money(r.confirmed)}</strong>
                <small>{r.purchases} compras</small>
              </div>
              <div>
                <span>Cobrado</span>
                <strong>{money(r.collected)}</strong>
              </div>
              <div>
                <span>Por cobrar</span>
                <strong>{money(r.balance)}</strong>
                <small>{r.clients} clientes activos</small>
              </div>
              <div>
                <span>Atrasado</span>
                <strong className={r.overdue ? "text-danger" : ""}>
                  {money(r.overdue)}
                </strong>
                <small>{r.overdue_count} cuotas vencidas</small>
              </div>
            </div>
            <div className="dashboard-grid">
              <section className="agenda">
                <div className="section-heading">
                  <h2>Tu agenda de cobros</h2>
                  <Button
                    variant="quiet"
                    icon={ArrowRight}
                    onClick={() => a.navigate("/calendar")}
                  >
                    Ver todo
                  </Button>
                </div>
                {r.calendar.length ? (
                  <div className="agenda-list">
                    {r.calendar.slice(0, 7).map((c, i) => (
                      <button
                        key={c.purchase_id + c.id}
                        className="agenda-row"
                        onClick={() =>
                          a.navigate("/purchases/" + c.purchase_id)
                        }
                      >
                        <span
                          className={
                            "date-tile " +
                            (c.due < a.session.today ? "late" : "")
                          }
                        >
                          <b>{c.due.slice(8)}</b>
                          <small>
                            {new Intl.DateTimeFormat("es-CR", {
                              month: "short",
                            }).format(new Date(c.due + "T12:00:00Z"))}
                          </small>
                        </span>
                        <span className="agenda-person">
                          <strong>{c.client_name}</strong>
                          <small>{c.product_name}</small>
                        </span>
                        <span className="agenda-amount">
                          <strong>{money(c.remaining)}</strong>
                          <small
                            className={
                              c.due < a.session.today ? "text-danger" : ""
                            }
                          >
                            {c.due < a.session.today
                              ? "Atrasado"
                              : c.due === a.session.today
                                ? "Para hoy"
                                : "Próximo"}
                          </small>
                        </span>
                        <ArrowUpRight size={18} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty icon={CalendarDays} title="Sin cobros pendientes">
                    Los próximos vencimientos aparecerán cuando confirmes una
                    compra
                  </Empty>
                )}
              </section>
              <aside className="dashboard-aside">
                <section className="stock-summary">
                  <h2>Inventario</h2>
                  <dl>
                    <div>
                      <dt>Disponibles</dt>
                      <dd>{r.inventory.available}</dd>
                    </div>
                    <div>
                      <dt>Reservadas</dt>
                      <dd>{r.inventory.reserved}</dd>
                    </div>
                    <div>
                      <dt>Asignadas</dt>
                      <dd>{r.inventory.assigned}</dd>
                    </div>
                  </dl>
                  <Button
                    variant="light"
                    icon={ArrowRight}
                    onClick={() => a.navigate("/inventory")}
                  >
                    Abrir inventario
                  </Button>
                </section>
                <div className="request-summary">
                  <div>
                    <h3>Solicitudes de precio</h3>
                    <p>{r.requests.pending} pendientes de aprobación</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Ver solicitudes"
                    onClick={() => a.navigate("/requests")}
                  >
                    <ArrowUpRight />
                  </button>
                </div>
              </aside>
            </div>
            <section className="section">
              <div className="section-heading">
                <h2>Evolución de cobros</h2>
                <span>Pagos confirmados por fecha</span>
              </div>
              <CollectionsChart data={r.evolution} />
            </section>
          </>
        )}
      </State>
    </>
  );
}
function CollectionsChart({ data }) {
  if (!data.length)
    return (
      <div className="chart-empty">
        <div className="chart-axis" />
        <p>Tu primer pago dará inicio al historial de cobros</p>
      </div>
    );
  const shown = data.slice(-20),
    max = Math.max(...shown.map((x) => x.amount));
  return (
    <div className="chart" role="img" aria-label="Cobros registrados por fecha">
      {shown.map((d) => (
        <div className="chart-col" key={d.date}>
          <span>{money(d.amount)}</span>
          <div style={{ height: Math.max(3, (d.amount / max) * 135) }} />
          <small>{day(d.date)}</small>
        </div>
      ))}
    </div>
  );
}
export function Calendar() {
  const a = useApp(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [owner, setOwner] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const state = useData(
    a.scope("/reports?" + (owner ? "owner_id=" + owner : "")),
    a.revision,
  );
  let rows = state.data?.calendar || [];
  if (filter === "late") rows = rows.filter((c) => c.due < a.session.today);
  if (filter === "today") rows = rows.filter((c) => c.due === a.session.today);
  if (filter === "next") rows = rows.filter((c) => c.due > a.session.today);
  if (from) rows = rows.filter((c) => c.due >= from);
  if (to) rows = rows.filter((c) => c.due <= to);
  if (q)
    rows = rows.filter((c) =>
      `${c.client_name} ${c.product_name}`
        .toLocaleLowerCase("es")
        .includes(q.toLocaleLowerCase("es")),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages);
  return (
    <>
      <Heading
        title="Cobros"
        description="Cuotas pendientes por fecha de vencimiento"
      />
      <div className="toolbar wrap">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Buscar cliente o compra"
        />
        <div className="segmented">
          {[
            ["all", "Todos"],
            ["today", "Hoy"],
            ["late", "Atrasados"],
            ["next", "Próximos"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {a.manager && (
          <select
            aria-label="Responsable"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Todo el equipo</option>
            {state.data?.workers.map((u) => (
              <option value={u.id} key={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Vencimientos desde"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          aria-label="Vencimientos hasta"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <State {...state}>
        {rows.length ? (
          <div className="records-wrap">
            <RecordTable>
              <thead>
                <tr>
                  <th>Vencimiento</th>
                  <th>Cliente y compra</th>
                  <th>Cuota</th>
                  <th>Falta</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice((currentPage - 1) * 20, currentPage * 20)
                  .map((r) => (
                    <tr key={r.purchase_id + r.id}>
                      <td>{day(r.due)}</td>
                      <td>
                        <strong>{r.client_name}</strong>
                        <small>{r.product_name}</small>
                      </td>
                      <td>{money(r.amount)}</td>
                      <td className="numeric">{money(r.remaining)}</td>
                      <td>
                        <Badge status={r.status}>
                          {r.status === "pending"
                            ? "Pendiente"
                            : labels[r.status]}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            a.navigate("/purchases/" + r.purchase_id)
                          }
                        >
                          Abrir compra
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </RecordTable>
          </div>
        ) : (
          <Empty title="Sin cobros en esta vista">
            Prueba otro filtro o registra una nueva compra
          </Empty>
        )}
        <Pager
          data={{ total: rows.length, pages }}
          page={currentPage}
          setPage={setPage}
        />
      </State>
    </>
  );
}
export function Reports() {
  const a = useApp(),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [owner, setOwner] = useState("");
  const state = useData(
    a.scope(`/reports?from=${from}&to=${to}&owner_id=${owner}`),
    a.revision,
  );
  const r = state.data;
  return (
    <>
      <Heading
        title="Reportes"
        description="Cifras de los registros que siguen en la plataforma"
      />
      <div className="toolbar wrap">
        <Field
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="Hasta"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Field label="Responsable">
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Todos</option>
            {r?.workers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted">
        Ventas y saldos: compras creadas en el período. Cobros: pagos recibidos
        en el período aunque la compra sea anterior. Los saldos muestran el
        estado actual
      </p>
      <State {...state}>
        {r && (
          <>
            <div className="money-strip">
              <div>
                <span>Vendido</span>
                <strong>{money(r.confirmed)}</strong>
              </div>
              <div>
                <span>Cobrado en el período</span>
                <strong>{money(r.collected)}</strong>
              </div>
              <div>
                <span>Pendiente</span>
                <strong>{money(r.balance)}</strong>
              </div>
              <div>
                <span>Vencido</span>
                <strong>{money(r.overdue)}</strong>
              </div>
            </div>
            <div className="report-facts">
              <p>
                <b>{r.clients}</b> clientes · <b>{r.purchases}</b> compras
              </p>
              <p>
                Cuotas: <b>{r.paid_count}</b> pagadas · <b>{r.partial_count}</b>{" "}
                parciales · <b>{r.overdue_count}</b> vencidas
              </p>
              <p>
                Precios: <b>{r.requests.pending}</b> pendientes ·{" "}
                <b>{r.requests.approved}</b> aprobados ·{" "}
                <b>{r.requests.rejected}</b> rechazados
              </p>
            </div>
            <section className="section">
              <h2>Por trabajador</h2>
              <Comparison rows={r.workers} />
            </section>
            <section className="section">
              <h2>Cobros por fecha</h2>
              <CollectionsChart data={r.evolution} />
            </section>
            <section className="section">
              <h2>Utilización de cupos</h2>
              {r.slots.map((g) => (
                <p key={g.id}>
                  {a.admin && (
                    <>
                      <strong>{g.name}</strong> ·{" "}
                    </>
                  )}
                  {g.used} de {g.polaco_limit} perfiles de polacos
                </p>
              ))}
            </section>
          </>
        )}
      </State>
    </>
  );
}
function Comparison({ rows }) {
  return (
    <div className="records-wrap">
      <RecordTable>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Vendido</th>
            <th>Cobrado</th>
            <th>Pendiente</th>
            <th>Vencido</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{money(r.sold)}</td>
              <td>{money(r.collected)}</td>
              <td>{money(r.balance)}</td>
              <td>{money(r.overdue)}</td>
            </tr>
          ))}
        </tbody>
      </RecordTable>
    </div>
  );
}
export function Groups() {
  const a = useApp(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [modal, setModal] = useState(null);
  const state = useData(
    "/groups?page=" + page + "&q=" + encodeURIComponent(q),
    a.revision,
  );
  return (
    <>
      <Heading
        title="Grupos"
        description="Cada grupo tiene sus propios clientes y existencias"
      >
        <Button icon={Plus} onClick={() => setModal({})}>
          Crear grupo
        </Button>
      </Heading>
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Buscar grupo"
        />
      </div>
      <State {...state}>
        {state.data?.items.length ? (
          <div className="records-wrap compact-records">
            <RecordTable>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Cupos usados</th>
                  <th>Creado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => a.navigate("/groups/" + g.id)}
                      >
                        {g.name}
                      </button>
                    </td>
                    <td>
                      {g.used_slots} / {g.polaco_limit}
                    </td>
                    <td>{day(g.created_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => a.navigate("/groups/" + g.id)}
                      >
                        Revisar grupo
                      </Button>
                      <Button
                        variant="quiet"
                        icon={Pencil}
                        onClick={() => setModal(g)}
                      >
                        Editar grupo
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </RecordTable>
          </div>
        ) : (
          <Empty icon={Building2} title="Crea tu primer grupo">
            Define su dueño y la cantidad de polacos permitida
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {modal && (
        <Modal
          title={modal.id ? "Editar grupo" : "Crear grupo y dueño"}
          onClose={() => setModal(null)}
        >
          <Form
            submit={modal.id ? "Guardar grupo" : "Crear grupo"}
            onSubmit={async (b) => {
              await api(modal.id ? "/groups/" + modal.id : "/groups", {
                method: modal.id ? "PATCH" : "POST",
                body: b,
              });
              a.refresh();
              setModal(null);
            }}
          >
            <Field
              label="Nombre del grupo"
              name="name"
              required
              defaultValue={modal.name}
            />
            <Field
              label="Cupos de polacos"
              name="limit"
              type="number"
              min="0"
              max="10000"
              required
              defaultValue={modal.polaco_limit ?? 2}
              hint="El dueño no ocupa un cupo"
            />
            {!modal.id && (
              <>
                <Field label="Nombre del dueño" name="owner_name" required />
                <Field
                  label="Usuario del dueño"
                  name="username"
                  minLength="3"
                  required
                  autoComplete="off"
                />
                <Field
                  label="Contraseña inicial"
                  name="password"
                  type="password"
                  minLength="12"
                  maxLength="128"
                  required
                  autoComplete="new-password"
                  hint="Mínimo 12 caracteres. No se podrá consultar después"
                />
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Team() {
  const a = useApp(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [modal, setModal] = useState(null);
  const state = useData(
      a.scope("/users?page=" + page + "&q=" + encodeURIComponent(q)),
      a.revision,
    ),
    directory = useData(a.scope("/directory"), a.revision);
  return (
    <>
      <Heading
        title={
          a.admin && !a.group
            ? "Usuarios de la plataforma"
            : a.admin
              ? "Usuarios del grupo"
              : "Usuarios del equipo"
        }
        description={
          state.data?.limit !== null && state.data?.limit !== undefined
            ? `${state.data.used} de ${state.data.limit} cupos de polacos utilizados`
            : "Busca una persona para revisar su grupo o corregir su acceso"
        }
      >
        {(!a.admin || a.group) && (
          <Button
            icon={Plus}
            disabled={a.admin && !a.group}
            onClick={() => setModal({ type: "edit" })}
          >
            Nuevo polaco
          </Button>
        )}
      </Heading>
      <div className="toolbar wrap">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder={
            a.admin
              ? "Buscar nombre usuario o grupo"
              : "Buscar nombre o usuario"
          }
        />
        {a.admin && !location.pathname.startsWith("/groups/") && (
          <GroupFilter onChange={() => setPage(1)} />
        )}
      </div>
      <State {...state}>
        <div className="records-wrap compact-records">
          <RecordTable>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {state.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                  </td>
                  <td>{u.username}</td>
                  <td>
                    {labels[u.role]}
                    {a.admin && (
                      <small className="cell-detail">
                        {u.group_name || "Plataforma"}
                      </small>
                    )}
                  </td>
                  <td>
                    {a.admin && u.group_id && (
                      <Button
                        variant="quiet"
                        onClick={() =>
                          a.navigate("/groups/" + u.group_id + "/team")
                        }
                      >
                        Revisar grupo
                      </Button>
                    )}
                    {(u.role === "polaco" ||
                      (a.admin && u.role !== "admin")) && (
                      <div className="row-actions">
                        <Button
                          variant="quiet"
                          onClick={() => setModal({ type: "edit", user: u })}
                        >
                          Editar acceso
                        </Button>
                        {u.role === "polaco" && (
                          <Button
                            variant="quiet"
                            onClick={() =>
                              setModal({ type: "retire", user: u })
                            }
                          >
                            Retirar
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </RecordTable>
        </div>
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {modal?.type === "edit" && (
        <Modal
          title={modal.user ? "Editar acceso" : "Nuevo polaco"}
          onClose={() => setModal(null)}
        >
          <Form
            onSubmit={async (b) => {
              if (!b.password) delete b.password;
              if (!modal.user) b.group_id = a.group || undefined;
              await api(modal.user ? "/users/" + modal.user.id : "/users", {
                method: modal.user ? "PATCH" : "POST",
                body: b,
              });
              a.refresh();
              setModal(null);
            }}
          >
            <Field
              label="Nombre"
              name="name"
              required
              defaultValue={modal.user?.name}
            />
            <Field
              label="Nombre de usuario"
              name="username"
              minLength="3"
              required
              defaultValue={modal.user?.username}
            />
            <Field
              label={
                modal.user
                  ? "Restablecer contraseña (opcional)"
                  : "Contraseña inicial"
              }
              name="password"
              type="password"
              minLength="12"
              maxLength="128"
              required={!modal.user}
              autoComplete="new-password"
              hint="Mínimo 12 caracteres. Se invalidan las sesiones al cambiarla"
            />
          </Form>
        </Modal>
      )}
      {modal?.type === "retire" && (
        <Retire
          user={modal.user}
          directory={directory.data || []}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
function Retire({ user, directory, onClose }) {
  const a = useApp(),
    [mode, setMode] = useState("transfer");
  return (
    <Modal title={"Retirar a " + user.name} onClose={onClose}>
      <p>
        Se cerrarán sus sesiones y se liberará un cupo. Decide qué pasará con
        sus clientes
      </p>
      <Form
        danger
        submit="Retirar polaco"
        onSubmit={async (b) => {
          await api(`/users/${user.id}/retire`, {
            method: "POST",
            body: { ...b, mode },
          });
          a.refresh("Polaco retirado");
          onClose();
        }}
      >
        <Field label="Clientes del polaco">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="transfer">Transferir a otro responsable</option>
            <option value="trash">Enviar también a la papelera</option>
          </select>
        </Field>
        {mode === "transfer" && (
          <Field label="Nuevo responsable">
            <select name="owner_id" required>
              {directory
                .filter((u) => u.id !== user.id && u.group_id === user.group_id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {labels[u.role]}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <p className="notice">
          Los clientes transferidos conservan compras y pagos. Su información no
          se elimina cuando se purga el perfil retirado
        </p>
      </Form>
    </Modal>
  );
}
export function Trash() {
  const a = useApp(),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(null),
    [error, setError] = useState("");
  const state = useData(a.scope("/trash?page=" + page), a.revision);
  const typeName = {
    user: "Polaco",
    client: "Cliente",
    product: "Producto",
    purchase: "Compra",
  };
  return (
    <>
      <Heading
        title="Papelera"
        description="30 días para restaurar. Después se elimina definitivamente"
      />
      <p className="notice">
        Restaurar un cliente recupera sus compras retiradas juntas. Restaurar un
        polaco recupera los clientes que envió a papelera. Los registros
        transferidos permanecen con su nuevo responsable
      </p>
      {error && <div className="error">{error}</div>}
      <State {...state}>
        {state.data?.items.length ? (
          <div className="records-wrap">
            <RecordTable>
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Retirado por</th>
                  <th>Fecha</th>
                  <th>Tiempo restante</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{typeName[r.type]}</small>
                    </td>
                    <td>{r.deleted_by_name || "Usuario retirado"}</td>
                    <td>{day(r.deleted_at)}</td>
                    <td>{r.days_remaining} días</td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="quiet"
                          icon={RotateCcw}
                          onClick={async () => {
                            setError("");
                            try {
                              await api(`/trash/${r.type}/${r.id}/restore`, {
                                method: "POST",
                                body: {},
                              });
                              a.refresh("Restaurado");
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        >
                          Restaurar
                        </Button>
                        <Button
                          variant="quiet"
                          icon={Trash2}
                          onClick={() => setModal(r)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </RecordTable>
          </div>
        ) : (
          <Empty icon={Archive} title="La papelera está vacía">
            Los registros retirados aparecerán aquí
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {modal && (
        <Modal title="Eliminar definitivamente" onClose={() => setModal(null)}>
          <p>
            <strong>{modal.name}</strong>
          </p>
          <p>
            Se eliminará este registro y su conjunto asociado: datos personales,
            compras, pagos, adjuntos y auditoría. Al purgar un usuario se borran
            sus mensajes y archivos sin borrar mensajes de otras personas
          </p>
          <p>
            Esta acción no se puede deshacer. Los respaldos del alojamiento
            siguen su propia retención documentada
          </p>
          <Form
            danger
            submit="Eliminar definitivamente"
            onSubmit={async (b) => {
              await api(`/trash/${modal.type}/${modal.id}/purge`, {
                method: "POST",
                body: b,
              });
              a.refresh("Eliminado definitivamente");
              setModal(null);
            }}
          >
            <Field
              label="Escribe ELIMINAR para confirmar"
              name="confirm"
              pattern="ELIMINAR"
              required
            />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const a = useApp(),
    [error, setError] = useState(""),
    [savingTheme, setSavingTheme] = useState(false);
  return (
    <>
      <Heading title="Configuración" />
      <div className="settings-grid">
        <section>
          <h2>Colores de tu cuenta</h2>
          <p>
            Tu elección se recupera en otros dispositivos y no cambia la de tus
            compañeros
          </p>
          <div
            className="theme-options"
            role="group"
            aria-label="Modo de apariencia"
          >
            {[
              ["light", "Claro", Sun],
              ["dark", "Oscuro", Moon],
            ].map(([theme, label, Icon]) => (
              <button
                type="button"
                key={theme}
                disabled={savingTheme}
                aria-pressed={(a.user.preferences.theme || "light") === theme}
                onClick={async () => {
                  setSavingTheme(true);
                  setError("");
                  try {
                    await api("/me", { method: "PATCH", body: { theme } });
                    await a.reload();
                    a.refresh("Apariencia guardada");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setSavingTheme(false);
                  }
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
          <Palette
            current={a.user.preferences.palette || "forest"}
            onSelect={async (palette) => {
              try {
                await api("/me", {
                  method: "PATCH",
                  body: { palette, onboarded: true },
                });
                await a.reload();
                a.refresh("Colores guardados");
              } catch (e) {
                setError(e.message);
              }
            }}
          />
          {error && <div className="error">{error}</div>}
          <h2>Tu perfil</h2>
          <Form
            onSubmit={async (b) => {
              await api("/me", { method: "PATCH", body: b });
              await a.reload();
              a.refresh();
            }}
          >
            <Field
              label="Nombre"
              name="name"
              required
              defaultValue={a.user.name}
            />
            <Field label="Usuario" disabled value={a.user.username} />
          </Form>
          <h2>Cambiar contraseña</h2>
          <Form
            submit="Cambiar contraseña y cerrar sesiones"
            onSubmit={async (b) => {
              await api("/me", { method: "PATCH", body: b });
              await a.reload();
            }}
          >
            <Field
              label="Nueva contraseña"
              name="password"
              type="password"
              minLength="12"
              maxLength="128"
              required
              autoComplete="new-password"
            />
          </Form>
          <Button
            variant="quiet section"
            icon={LogOut}
            onClick={async () => {
              await api("/logout", { method: "POST", body: {} });
              await a.reload();
            }}
          >
            Cerrar sesión
          </Button>
        </section>
        <section>
          <div className="settings-note">
            <h2>Acerca de Polacos</h2>
            <p>Moneda: colones costarricenses</p>
            <p>Calendarios: America/Costa_Rica</p>
            <p>
              Solo los participantes pueden consultar sus chats. No están
              cifrados de extremo a extremo
            </p>
            <p>
              Los registros de papelera se eliminan después de 30 días. Los
              archivos se almacenan de forma persistente en el servidor
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
export function Notifications() {
  const a = useApp(),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState("all");
  const state = useData(
    `/notifications?page=${page}&status=${filter}`,
    a.revision,
  );
  return (
    <>
      <Heading
        title="Notificaciones"
        description="Avisos de tus cobros y solicitudes"
      >
        <Button
          variant="secondary"
          icon={Check}
          onClick={async () => {
            await api("/notifications/read", { method: "POST", body: {} });
            a.refresh("Notificaciones leídas");
          }}
        >
          Marcar todas como leídas
        </Button>
      </Heading>
      <div className="segmented">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => {
            setFilter("all");
            setPage(1);
          }}
        >
          Todas
        </button>
        <button
          className={filter === "unread" ? "active" : ""}
          onClick={() => {
            setFilter("unread");
            setPage(1);
          }}
        >
          No leídas
        </button>
        <button
          className={filter === "read" ? "active" : ""}
          onClick={() => {
            setFilter("read");
            setPage(1);
          }}
        >
          Leídas
        </button>
      </div>
      <State {...state}>
        {state.data?.items.length ? (
          <div className="notification-list">
            {state.data.items.map((n) => (
              <button
                className={"notification-row " + (!n.read_at ? "unread" : "")}
                key={n.id}
                onClick={async () => {
                  await api("/notifications/read", {
                    method: "POST",
                    body: { id: n.id },
                  });
                  a.refresh("");
                  a.navigate(n.path);
                }}
              >
                <Bell size={21} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <time className="notification-time" dateTime={n.created_at}>
                    Fecha y hora: {time(n.created_at)}
                  </time>
                </div>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Bell} title="Sin notificaciones">
            Tus avisos aparecerán aquí
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
    </>
  );
}
