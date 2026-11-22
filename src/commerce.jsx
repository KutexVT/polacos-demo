import React, { useState } from "react";
import { percentageBasis, percentagePrice } from "../shared/pricing";
import { PaymentMethods, paymentFromForm } from "./payment-methods";
import { methods, methodNames } from "../shared/cash-count";
import {
  Plus,
  ArrowLeft,
  ArrowUpRight,
  Users,
  Package,
  MoreHorizontal,
  Pencil,
  Archive,
  ArrowRightLeft,
  Check,
  Wallet,
  Receipt,
  CalendarDays,
  X,
  History,
} from "lucide-react";
import { ReviewRecord } from "./admin";
import { useApp } from "./main";
import {
  api,
  money,
  day,
  time,
  percent,
  priceChange,
  labels,
  id as newId,
} from "./api";
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
  Photo,
  FileField,
  PlanEditor,
  Preview,
  useData,
  RecordTable,
} from "./ui";
export function Heading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Clients() {
  const a = useApp(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [sharedPage, setSharedPage] = useState(1),
    [modal, setModal] = useState(false);
  const state = useData(
    a.scope(`/clients?q=${encodeURIComponent(q)}&page=${page}`),
    a.revision,
  );
  const shared = useData(
    a.user.role === "polaco"
      ? `/purchases?shared=true&page=${sharedPage}&q=${encodeURIComponent(q)}`
      : null,
    a.revision,
  );
  return (
    <>
      <Heading
        title={a.admin ? "Revisar clientes" : "Tus clientes"}
        description={
          a.admin
            ? "Consulta las fichas y corrige los datos de este grupo"
            : undefined
        }
      >
        {!a.admin && (
          <Button
            icon={Plus}
            disabled={a.admin && !a.group}
            onClick={() => setModal(true)}
          >
            Nuevo cliente
          </Button>
        )}
      </Heading>
      {a.admin && !a.group && (
        <p className="notice">Selecciona un grupo para añadir clientes</p>
      )}
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
            setSharedPage(1);
          }}
          placeholder="Buscar cliente o teléfono"
        />
        <span className="muted">{state.data?.total || 0} clientes</span>
      </div>
      <State {...state}>
        {state.data?.items.length ? (
          <div className="client-list">
            {state.data.items.map((c) => (
              <button
                className="client-row"
                key={c.id}
                onClick={() => a.navigate("/clients/" + c.id)}
              >
                <Photo id={c.photo_id} name={c.name} />
                <div className="client-identity">
                  <strong>{c.name}</strong>
                  <span>
                    {c.phone ||
                      [c.address, c.canton, c.province]
                        .filter(Boolean)
                        .join(" · ") ||
                      "Sin datos de contacto"}
                  </span>
                </div>
                <div className="client-balance">
                  <small>Saldo pendiente</small>
                  <strong>{money(c.balance)}</strong>
                </div>
                <ArrowUpRight size={19} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Users} title="Sin clientes">
            Añade tu primer cliente y organiza sus compras y cobros
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {shared.data?.items.some((p) => p.owner_id !== a.user.id) && (
        <section className="section">
          <h2>Compras compartidas contigo</h2>
          <div className="purchase-grid">
            {shared.data.items
              .filter((p) => p.owner_id !== a.user.id)
              .map((p) => (
                <PurchaseRow key={p.id} p={p} />
              ))}
          </div>
          <Pager data={shared.data} page={sharedPage} setPage={setSharedPage} />
        </section>
      )}
      {modal && <ClientForm onClose={() => setModal(false)} />}
    </>
  );
}
function ClientForm({ client, onClose }) {
  const a = useApp(),
    directory = useData(a.scope("/directory"));
  return (
    <Modal
      title={client ? "Editar cliente" : "Nuevo cliente"}
      onClose={onClose}
    >
      <Form
        submit={client ? "Guardar cambios" : "Crear cliente"}
        onSubmit={async (b) => {
          b.photo_id = b.photo_id || null;
          if (!client) {
            b.group_id = a.group || undefined;
            if (!b.owner_id) delete b.owner_id;
          }
          await api(client ? "/clients/" + client.id : "/clients", {
            method: client ? "PATCH" : "POST",
            body: b,
          });
          a.refresh();
          onClose();
        }}
      >
        <FileField
          label="Foto del cliente"
          name="photo_id"
          initial={client?.photo_id}
        />
        <Field
          label="Nombre o identificador"
          name="name"
          required
          defaultValue={client?.name}
        />
        {!client && a.manager && (
          <Field label="Responsable">
            <select
              name="owner_id"
              defaultValue={a.admin ? "" : a.user.id}
              required
            >
              {directory.data
                ?.filter((u) => u.role !== "admin")
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} · {labels[u.role]}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="form-grid">
          <Field
            label="Teléfono"
            name="phone"
            type="tel"
            defaultValue={client?.phone}
          />
          <Field
            label="Dirección"
            name="address"
            defaultValue={client?.address}
          />
        </div>
        <details
          className="location-details"
          open={client?.canton || client?.province ? true : undefined}
        >
          <summary>Ubicación detallada (opcional)</summary>
          <div className="form-grid">
            <Field
              label="Provincia"
              name="province"
              maxLength={100}
              autoComplete="address-level1"
              defaultValue={client?.province}
            />
            <Field
              label="Cantón"
              name="canton"
              maxLength={100}
              autoComplete="address-level2"
              defaultValue={client?.canton}
            />
          </div>
        </details>
        <Field label="Notas">
          <textarea name="notes" rows="3" defaultValue={client?.notes} />
        </Field>
      </Form>
    </Modal>
  );
}
export function ClientDetail({ id }) {
  const a = useApp(),
    state = useData("/clients/" + id, a.revision),
    [modal, setModal] = useState("");
  const c = state.data;
  const directory = useData(
    a.admin && c ? "/directory?group_id=" + c.group_id : a.scope("/directory"),
  );
  return (
    <>
      <Button
        variant="quiet back"
        icon={ArrowLeft}
        onClick={() =>
          a.navigate(
            a.admin && c ? "/groups/" + c.group_id + "/clients" : "/clients",
          )
        }
      >
        Clientes
      </Button>
      <State {...state}>
        {c && (
          <>
            <ReviewRecord groupId={c.group_id} />
            <Heading
              title={c.name}
              description={c.phone || "Ficha del cliente"}
            >
              {c.can_edit && (
                <>
                  {!a.admin && (
                    <Button icon={Plus} onClick={() => setModal("purchase")}>
                      Nueva compra
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon={Pencil}
                    onClick={() => setModal("edit")}
                  >
                    Editar
                  </Button>
                </>
              )}
            </Heading>
            <div className="profile-strip">
              <Photo id={c.photo_id} name={c.name} size="large" />
              <div>
                <strong>
                  {[c.address, c.canton, c.province]
                    .filter(Boolean)
                    .join(" · ") || "Sin dirección registrada"}
                </strong>
                <p>{c.notes || "Sin notas"}</p>
                <small>
                  Responsable:{" "}
                  {directory.data?.find((u) => u.id === c.owner_id)?.name ||
                    "Mi cuenta"}
                </small>
              </div>
              {a.manager && (
                <Button
                  variant="quiet"
                  icon={ArrowRightLeft}
                  onClick={() => setModal("transfer")}
                >
                  Transferir
                </Button>
              )}
              {c.can_edit && (
                <Button
                  variant="quiet"
                  icon={Archive}
                  onClick={() => setModal("trash")}
                >
                  Retirar
                </Button>
              )}
            </div>
            <div className="money-strip">
              <div>
                <span>Total confirmado</span>
                <strong>
                  {money(
                    c.purchases
                      .filter((p) => ["active", "paid"].includes(p.status))
                      .reduce((s, p) => s + p.ledger.total, 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Pagado</span>
                <strong>
                  {money(
                    c.purchases
                      .filter((p) => p.had_assignment)
                      .reduce((s, p) => s + p.ledger.paid, 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Pendiente</span>
                <strong>
                  {money(
                    c.purchases
                      .filter((p) => ["active", "paid"].includes(p.status))
                      .reduce((s, p) => s + p.ledger.balance, 0),
                  )}
                </strong>
              </div>
            </div>
            <section className="section">
              <h2>Compras e historial</h2>
              {c.purchases.length ? (
                <div className="purchase-grid">
                  {c.purchases.map((p) => (
                    <PurchaseRow p={p} key={p.id} />
                  ))}
                </div>
              ) : (
                <Empty icon={Package} title="Todavía sin compras">
                  Asigna un producto del catálogo para empezar
                </Empty>
              )}
            </section>
          </>
        )}
      </State>
      {modal === "edit" && (
        <ClientForm client={c} onClose={() => setModal("")} />
      )}
      {modal === "purchase" && (
        <PurchaseForm client={c} onClose={() => setModal("")} />
      )}
      {modal === "transfer" && (
        <Modal title="Transferir cliente" onClose={() => setModal("")}>
          <p>
            Sus compras y pagos se conservan. Se revocarán los accesos
            compartidos anteriores del responsable
          </p>
          <Form
            submit="Confirmar transferencia"
            onSubmit={async (b) => {
              await api(`/clients/${id}/transfer`, { method: "POST", body: b });
              a.refresh("Cliente transferido");
              setModal("");
            }}
          >
            <Field label="Nuevo responsable">
              <select name="owner_id" required>
                {directory.data
                  ?.filter((u) => u.id !== c.owner_id && u.role !== "admin")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          </Form>
        </Modal>
      )}
      {modal === "trash" && (
        <TrashConfirm
          type="client"
          id={id}
          name={c.name}
          onClose={() => setModal("")}
          onDone={() => a.navigate("/clients")}
        />
      )}
    </>
  );
}
function PurchaseRow({ p }) {
  const a = useApp();
  return (
    <button
      className="purchase-row"
      onClick={() => a.navigate("/purchases/" + p.id)}
    >
      <span className="product-icon">
        <Package size={21} />
      </span>
      <div>
        <strong>{p.product_name}</strong>
        <small>
          {p.client_name ? `${p.client_name} · ` : ""}
          {p.quantity} {p.quantity === 1 ? "unidad" : "unidades"} ·{" "}
          {money(p.unit_price)} c/u
        </small>
      </div>
      <Badge status={p.status} />
      <div className="row-money">
        <strong>{money(p.ledger?.balance ?? p.unit_price * p.quantity)}</strong>
        <small>
          {["pending", "decision"].includes(p.status)
            ? "Precio sin confirmar"
            : "Saldo"}
        </small>
      </div>
      <ArrowUpRight size={18} />
    </button>
  );
}
export function PurchaseForm({ client, onClose }) {
  const a = useApp(),
    [productSearch, setProductSearch] = useState(""),
    products = useData(
      `/products?group_id=${client.group_id}&limit=100&q=${encodeURIComponent(productSearch)}`,
      a.revision,
    ),
    [productId, setProductId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [mode, setMode] = useState("normal"),
    [custom, setCustom] = useState(""),
    [discount, setDiscount] = useState(""),
    [plan, setPlan] = useState({
      frequency: "weekly",
      start: a.session.today,
      installment: "10000",
    }),
    [ready, setReady] = useState(false),
    [key] = useState(newId);
  const product = products.data?.items.find((p) => p.id === productId);
  const price =
    mode === "normal"
      ? (product?.price || 0) / 100
      : mode === "discount"
        ? (percentagePrice(
            product?.price || 0,
            -(percentageBasis(discount) ?? NaN),
          ) || 0) / 100
        : Number(custom);
  return (
    <Modal wide title={"Nueva compra · " + client.name} onClose={onClose}>
      <Form
        submit={
          a.user.role === "polaco" && mode !== "normal"
            ? "Solicitar precio y reservar"
            : "Confirmar compra"
        }
        disabled={!ready}
        onSubmit={async () => {
          const p = await api("/purchases", {
            method: "POST",
            body: {
              client_id: client.id,
              product_id: productId,
              quantity: Number(quantity),
              ...(mode === "discount"
                ? { discount_percent: discount }
                : mode === "custom"
                  ? { price }
                  : {}),
              plan,
              idempotency_key: key,
            },
          });
          a.refresh("Compra guardada");
          onClose();
          a.navigate("/purchases/" + p.id);
        }}
      >
        <SearchBox
          value={productSearch}
          onChange={setProductSearch}
          placeholder="Buscar en el catálogo"
        />
        <Field label="Producto">
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Selecciona un producto</option>
            {products.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {money(p.price)} · {p.available} disponibles
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field
            label="Unidades"
            type="number"
            min="1"
            max={product?.available || 1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Field label="Precio">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="normal">Precio del catálogo</option>
              {a.manager && (
                <option value="custom">Otro precio unitario</option>
              )}
              <option value="discount">Porcentaje de descuento</option>
            </select>
          </Field>
          {mode === "custom" && (
            <Field
              label="Precio unitario (₡)"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
          {mode === "discount" && (
            <Field
              label="Descuento (%)"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              required
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          )}
        </div>
        {mode === "discount" && discount !== "" && (
          <p className="price-change">
            {percent(discount)} de descuento solicitado
          </p>
        )}
        <div className="total-line">
          <span>
            {quantity} × {money(Math.round(price * 100))}
          </span>
          <strong>
            Total {money(Math.round(price * 100) * Number(quantity))}
          </strong>
        </div>
        {mode !== "normal" && a.user.role === "polaco" && (
          <p className="notice">
            Las unidades quedarán reservadas. Podrás cobrar cuando el dueño
            confirme el precio y revise el calendario
          </p>
        )}
        <h3>Plan de cobro</h3>
        <PlanEditor value={plan} onChange={setPlan} />
        <Preview
          price={price || 0}
          quantity={Number(quantity) || 1}
          plan={plan}
          onReady={setReady}
        />
      </Form>
    </Modal>
  );
}
export function Inventory() {
  const a = useApp(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(null);
  const state = useData(
    a.scope(`/products?q=${encodeURIComponent(q)}&page=${page}`),
    a.revision,
  );
  return (
    <>
      <Heading
        title="Inventario"
        description={
          a.admin
            ? "Consulta las existencias y corrige los registros de este grupo"
            : undefined
        }
      >
        {a.manager && !a.admin && (
          <Button
            icon={Plus}
            disabled={a.admin && !a.group}
            onClick={() => setModal({ type: "edit" })}
          >
            Nuevo producto
          </Button>
        )}
      </Heading>
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Buscar producto"
        />
      </div>
      <State {...state}>
        {state.data?.items.length ? (
          <div className="product-grid">
            {state.data.items.map((p) => (
              <article className="product-card" key={p.id}>
                <Photo id={p.image_id} name={p.name} />
                <div className="product-card-body">
                  <h2>{p.name}</h2>
                  {p.description && <p>{p.description}</p>}
                  {a.manager && (
                    <div className="product-cost">
                      {p.purchase_cost == null ? (
                        <span>Costo pendiente</span>
                      ) : (
                        <>
                          <strong>
                            {percent(p.profit_percent)} de ganancia
                          </strong>
                          <span>Compra: {money(p.purchase_cost)}</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="product-price">
                    <small>Precio unitario</small>
                    <strong>{money(p.price)}</strong>
                  </div>
                  <dl className="product-stock">
                    <div>
                      <dt>Disponibles</dt>
                      <dd className={p.available ? "" : "text-danger"}>
                        {p.available}
                      </dd>
                    </div>
                    <div>
                      <dt>Reservadas</dt>
                      <dd>{p.reserved}</dd>
                    </div>
                    <div>
                      <dt>Asignadas</dt>
                      <dd>{p.assigned}</dd>
                    </div>
                  </dl>
                  {a.manager && (
                    <div className="product-actions">
                      <Button
                        variant="quiet"
                        icon={Pencil}
                        aria-label={"Editar " + p.name}
                        onClick={() => setModal({ type: "edit", product: p })}
                      >
                        Editar
                      </Button>
                      <button
                        className="icon-button"
                        aria-label={"Movimientos de " + p.name}
                        onClick={() =>
                          setModal({ type: "history", product: p })
                        }
                      >
                        <History size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Retirar " + p.name}
                        onClick={() => setModal({ type: "trash", product: p })}
                      >
                        <Archive size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Package} title="Sin productos">
            {a.manager
              ? "Añade un producto con su precio y existencias"
              : "El responsable añadirá los productos disponibles"}
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {modal?.type === "edit" && (
        <ProductForm product={modal.product} onClose={() => setModal(null)} />
      )}
      {modal?.type === "history" && (
        <StockHistory product={modal.product} onClose={() => setModal(null)} />
      )}
      {modal?.type === "trash" && (
        <TrashConfirm
          type="product"
          id={modal.product.id}
          name={modal.product.name}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
function ProductForm({ product: p, onClose }) {
  const a = useApp();
  const [cost, setCost] = useState(
    p?.purchase_cost == null ? "" : String(p.purchase_cost / 100),
  );
  const [profit, setProfit] = useState(p?.profit_percent ?? "");
  const entered = cost !== "" || profit !== "";
  const price =
    !entered && p
      ? p.price
      : percentagePrice(
          Math.round(Number(cost) * 100),
          percentageBasis(profit) ?? NaN,
        );
  return (
    <Modal title={p ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <Form
        disabled={price == null}
        onSubmit={async (b) => {
          b.image_id = b.image_id || null;
          if (!entered) {
            delete b.purchase_cost;
            delete b.profit_percent;
          }
          if (!p) b.group_id = a.group || undefined;
          await api(p ? "/products/" + p.id : "/products", {
            method: p ? "PATCH" : "POST",
            body: b,
          });
          a.refresh();
          onClose();
        }}
      >
        <FileField initial={p?.image_id} />
        <Field label="Nombre" name="name" required defaultValue={p?.name} />
        <Field label="Descripción">
          <textarea name="description" rows="2" defaultValue={p?.description} />
        </Field>
        <div className="form-grid">
          <Field
            label="Precio de compra (₡)"
            name="purchase_cost"
            type="number"
            min="0.01"
            max="10000000000"
            step="0.01"
            required={!p || entered}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <Field
            label="Ganancia sobre el costo (%)"
            name="profit_percent"
            type="number"
            min="0"
            max="10000"
            step="0.01"
            required={!p || entered}
            value={profit}
            onChange={(e) => setProfit(e.target.value)}
          />
          <Field
            label="Unidades disponibles"
            name="available"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={p?.available ?? 0}
          />
        </div>
        <div className="pricing-result" aria-live="polite">
          <span>Precio de venta</span>
          <strong>
            {price == null ? "Completa el costo y el porcentaje" : money(price)}
          </strong>
          <small>Redondeado al múltiplo de ₡5 más cercano</small>
        </div>
        {p?.purchase_cost == null && p && (
          <p className="muted">
            Costo pendiente. Puedes completar estos datos sin modificar las
            compras anteriores
          </p>
        )}
        {p && (
          <>
            <ReviewRecord groupId={p.group_id} />
            <p className="notice">
              Cambiar el catálogo conserva los precios de las compras
              anteriores. Las reservas y asignaciones se administran desde las
              compras
            </p>
            <Field label="Motivo del cambio" name="reason" required />
          </>
        )}
      </Form>
    </Modal>
  );
}
function StockHistory({ product, onClose }) {
  const state = useData("/products/" + product.id + "/history");
  return (
    <Modal wide title={"Movimientos · " + product.name} onClose={onClose}>
      <State {...state}>
        <h3>Reservas vigentes</h3>
        {state.data?.reservations.length ? (
          state.data.reservations.map((r) => (
            <p key={r.id}>
              {r.quantity} unidades · {r.client_name} · {r.owner_name}
            </p>
          ))
        ) : (
          <p>Sin reservas</p>
        )}
        <h3>Historial de inventario</h3>
        <div className="timeline">
          {state.data?.movements.map((m) => (
            <div key={m.id}>
              <strong>
                {m.reason} · {m.quantity} unidades
              </strong>
              <small>
                {m.actor_name || "Usuario retirado"} · {time(m.created_at)}
              </small>
            </div>
          ))}
        </div>
      </State>
    </Modal>
  );
}
export function PurchaseDetail({ id }) {
  const a = useApp(),
    state = useData("/purchases/" + id, a.revision),
    [modal, setModal] = useState(null);
  const p = state.data;
  return (
    <>
      <Button
        variant="quiet back"
        icon={ArrowLeft}
        onClick={() => a.navigate(p ? "/clients/" + p.client_id : "/clients")}
      >
        Cliente
      </Button>
      <State {...state}>
        {p && (
          <>
            <Heading
              title={p.product_name}
              description={`${p.client_name} · ${p.quantity} unidades de ${money(p.unit_price)}`}
            >
              <Badge status={p.status} />
              {!a.admin && p.status === "active" && p.can_edit && (
                <Button
                  icon={Wallet}
                  onClick={() => setModal({ type: "payment" })}
                >
                  Registrar pago
                </Button>
              )}
            </Heading>
            {["pending", "decision"].includes(p.status) ? (
              <div className="pending-panel">
                <h2>{labels[p.status]}</h2>
                <p className="price-change">
                  {priceChange(
                    p.original_price,
                    p.unit_price,
                    p.requests.find((r) => r.version === p.version)
                      ?.discount_percent,
                  )}
                </p>
                <p>
                  {p.quantity} unidades reservadas · Precio propuesto:{" "}
                  {money(p.unit_price)} · Total: {money(p.ledger.total)}
                </p>
                <p>Esta compra todavía no cuenta como deuda cobrable</p>
                {p.requests
                  .filter((r) => r.status === "rejected" && r.reason)
                  .map((r) => (
                    <p key={r.id}>
                      <strong>Motivo del rechazo:</strong> {r.reason}
                    </p>
                  ))}
                {p.can_edit && (
                  <div className="button-row">
                    <Button
                      variant="secondary"
                      onClick={() => setModal({ type: "original" })}
                    >
                      Usar precio original
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setModal({ type: "propose" })}
                    >
                      Enviar otra propuesta
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => setModal({ type: "cancel" })}
                    >
                      Cancelar definitivamente
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="money-strip">
                <div>
                  <span>Total acordado</span>
                  <strong>{money(p.ledger.total)}</strong>
                </div>
                <div>
                  <span>Pagado</span>
                  <strong>{money(p.ledger.paid)}</strong>
                </div>
                <div>
                  <span>Saldo pendiente</span>
                  <strong>{money(p.ledger.balance)}</strong>
                </div>
                <div>
                  <span>Vencido</span>
                  <strong className={p.ledger.overdue ? "text-danger" : ""}>
                    {money(p.ledger.overdue)}
                  </strong>
                </div>
              </div>
            )}
            <section className="section">
              <div className="section-heading">
                <h2>Calendario de cuotas</h2>
                <span>{p.ledger.remaining_count} pendientes</span>
                {p.can_edit && ["active", "paid"].includes(p.status) && (
                  <Button
                    variant="quiet"
                    icon={Pencil}
                    onClick={() => setModal({ type: "schedule" })}
                  >
                    Editar cuotas futuras
                  </Button>
                )}
              </div>
              {["pending", "decision"].includes(p.status) && (
                <p className="muted">
                  Vista provisional. El calendario se revisa al confirmar el
                  precio
                </p>
              )}
              <div className="records-wrap">
                <RecordTable>
                  <thead>
                    <tr>
                      <th>Cuota</th>
                      <th>Vencimiento</th>
                      <th>Monto</th>
                      <th>Pagado</th>
                      <th>Falta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.ledger.schedule.map((r, i) => (
                      <tr key={r.id}>
                        <td>Cuota {i + 1}</td>
                        <td>{day(r.due)}</td>
                        <td>{money(r.amount)}</td>
                        <td>{money(r.paid)}</td>
                        <td>{money(r.remaining)}</td>
                        <td>
                          <Badge status={r.status}>
                            {r.amount === 0
                              ? "Reducida por abono"
                              : r.status === "pending"
                                ? "Pendiente"
                                : labels[r.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </RecordTable>
              </div>
            </section>
            <section className="section">
              <h2>Pagos registrados</h2>
              {p.payments.length ? (
                <div className="payment-list">
                  {p.payments.map((pay) => (
                    <div className="payment-row" key={pay.id}>
                      <Receipt size={21} />
                      <div>
                        <strong>
                          {money(pay.amount)}{" "}
                          {pay.voided && (
                            <Badge status="cancelled">Anulado</Badge>
                          )}
                        </strong>
                        <small>
                          {pay.kind === "capital"
                            ? "Abono al capital"
                            : "Pago de cuotas"}{" "}
                          · {day(pay.paid_on)} ·{" "}
                          {pay.actor_name || "Usuario retirado"}
                        </small>
                        <small>
                          {pay.payment_cash == null
                            ? "Medio sin clasificar"
                            : methods
                                .filter((m) => pay["payment_" + m] > 0)
                                .map(
                                  (m) =>
                                    methodNames[m] +
                                    ": " +
                                    money(pay["payment_" + m]),
                                )
                                .join(" · ")}
                        </small>
                        {pay.cash_change > 0 && (
                          <small>Vuelto: {money(pay.cash_change)}</small>
                        )}
                        <small>{pay.note}</small>
                      </div>
                      {p.can_edit && (
                        <Button
                          variant="quiet"
                          onClick={() =>
                            setModal({ type: "correct", payment: pay })
                          }
                        >
                          Corregir
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Los pagos confirmados aparecerán aquí</p>
              )}
            </section>
            <details className="section history">
              <summary>Historial de cambios</summary>
              <div className="timeline">
                {p.audit.map((h) => (
                  <div key={h.id}>
                    <strong>{h.action}</strong>
                    <small>
                      {h.actor_name || "Usuario retirado"} ·{" "}
                      {time(h.created_at)}
                    </small>
                    {h.action.startsWith("Corregir pago") && (
                      <p>
                        Anterior: {money(h.before_data?.amount)} · Nuevo:{" "}
                        {money(h.after_data?.amount)}
                        {h.after_data?.voided ? " · Anulado" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
            {p.can_edit && (
              <div className="button-row section">
                {p.status !== "cancelled" && (
                  <Button
                    variant="quiet"
                    onClick={() => setModal({ type: "cancel" })}
                  >
                    Cancelar compra
                  </Button>
                )}
                <Button
                  variant="quiet"
                  icon={Archive}
                  onClick={() => setModal({ type: "trash" })}
                >
                  Enviar a papelera
                </Button>
              </div>
            )}
          </>
        )}
      </State>
      {modal?.type === "payment" && (
        <PaymentForm p={p} onClose={() => setModal(null)} />
      )}
      {modal?.type === "correct" && (
        <PaymentCorrection
          payment={modal.payment}
          onClose={() => setModal(null)}
        />
      )}
      {["original", "propose"].includes(modal?.type) && (
        <ResolvePurchase
          p={p}
          mode={modal.type}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "schedule" && (
        <EditSchedule p={p} onClose={() => setModal(null)} />
      )}
      {modal?.type === "cancel" && (
        <Modal title="Cancelar compra" onClose={() => setModal(null)}>
          <p>
            {p.had_assignment
              ? "Las unidades confirmadas no regresarán automáticamente al inventario. Los pagos quedarán en el historial"
              : "La cancelación liberará la reserva y dejará disponibles las unidades"}
          </p>
          <Form
            danger
            submit="Confirmar cancelación"
            onSubmit={async (b) => {
              await api(`/purchases/${id}/cancel`, { method: "POST", body: b });
              a.refresh("Compra cancelada");
              setModal(null);
            }}
          >
            <Field label="Motivo" name="reason" required />
          </Form>
        </Modal>
      )}
      {modal?.type === "trash" && (
        <TrashConfirm
          type="purchase"
          id={id}
          name={p.product_name}
          onClose={() => setModal(null)}
          onDone={() => a.navigate("/clients/" + p.client_id)}
        />
      )}
    </>
  );
}
function PaymentCorrection({ payment, onClose }) {
  const a = useApp(),
    [amount, setAmount] = useState(payment.amount / 100);
  return (
    <Modal title="Corregir pago" onClose={onClose}>
      <p>
        El valor anterior se conserva en el historial. Se recalcularán saldo y
        cuotas
      </p>
      <Form
        submit="Confirmar corrección"
        onSubmit={async (b) => {
          await api("/payments/" + payment.id, {
            method: "PATCH",
            body: {
              ...paymentFromForm(b, amount),
              amount,
              voided: b.voided === "yes",
            },
          });
          a.refresh("Pago corregido");
          onClose();
        }}
      >
        <Field
          label="Monto (₡)"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Field
          label="Fecha del pago"
          name="paid_on"
          type="date"
          required
          defaultValue={payment.paid_on}
        />
        <PaymentMethods amount={amount} previous={payment} />
        <Field label="Estado">
          <select name="voided" defaultValue={payment.voided ? "yes" : "no"}>
            <option value="no">Vigente</option>
            <option value="yes">Anulado</option>
          </select>
        </Field>
        <Field label="Motivo de la corrección" name="reason" required />
      </Form>
    </Modal>
  );
}
function PaymentForm({ p, onClose }) {
  const a = useApp(),
    [kind, setKind] = useState("installment"),
    [targets, setTargets] = useState([p.ledger.next?.id].filter(Boolean)),
    [amount, setAmount] = useState(
      (p.ledger.next?.remaining || p.ledger.balance) / 100,
    ),
    [key] = useState(newId);
  return (
    <Modal title="Confirmar pago" onClose={onClose}>
      <div className="payment-confirm">
        <strong>{p.client_name}</strong>
        <span>{p.product_name}</span>
        <small>Saldo actual: {money(p.ledger.balance)}</small>
      </div>
      <Form
        submit="Confirmar y registrar pago"
        onSubmit={async (b) => {
          await api(`/purchases/${p.id}/payments`, {
            method: "POST",
            body: {
              ...paymentFromForm(b, amount),
              amount,
              kind,
              targets: kind === "capital" ? [] : targets,
              idempotency_key: key,
            },
          });
          a.refresh("Pago confirmado por el servidor");
          onClose();
        }}
      >
        <Field label="Tipo de pago">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="installment">Pago o adelanto de cuotas</option>
            <option value="capital">Abono extra al capital</option>
          </select>
        </Field>
        {kind === "capital" ? (
          <p className="notice">
            Reduce las últimas cuotas. La cuota actual conserva su vencimiento y
            monto pendiente
          </p>
        ) : (
          <div className="check-list">
            {p.ledger.schedule
              .filter((r) => r.remaining > 0)
              .map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    checked={targets.includes(r.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...targets, r.id]
                        : targets.filter((x) => x !== r.id);
                      setTargets(next);
                      setAmount(
                        p.ledger.schedule
                          .filter((x) => next.includes(x.id))
                          .reduce((s, x) => s + x.remaining, 0) / 100,
                      );
                    }}
                  />
                  <span>{day(r.due)}</span>
                  <b>{money(r.remaining)}</b>
                </label>
              ))}
          </div>
        )}
        <div className="form-grid">
          <Field
            label="Monto recibido (₡)"
            type="number"
            min="0.01"
            max={p.ledger.balance / 100}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Field
            label="Fecha del pago"
            name="paid_on"
            type="date"
            required
            defaultValue={a.session.today}
          />
        </div>
        <PaymentMethods amount={amount} />
        <Field label="Nota opcional" name="note" />
        <p className="muted">
          No necesitas comprobante. Un pago parcial deja visible lo que falta
        </p>
      </Form>
    </Modal>
  );
}
function ResolvePurchase({ p, mode, onClose }) {
  const a = useApp(),
    [plan, setPlan] = useState(p.plan),
    [discount, setDiscount] = useState(
      p.requests.find((r) => r.version === p.version)?.discount_percent ??
        Math.max(
          0,
          Math.round(
            ((p.original_price - p.unit_price) * 10000) / p.original_price,
          ) / 100,
        ),
    ),
    [ready, setReady] = useState(false);
  const price =
    (mode === "original"
      ? p.original_price
      : percentagePrice(
          p.original_price,
          -(percentageBasis(discount) ?? NaN),
        ) || 0) / 100;
  return (
    <Modal
      title={
        mode === "original"
          ? "Confirmar precio original"
          : "Nueva propuesta de precio"
      }
      onClose={onClose}
    >
      <Form
        submit={mode === "original" ? "Confirmar compra" : "Enviar propuesta"}
        disabled={!ready}
        onSubmit={async () => {
          await api(`/purchases/${p.id}/${mode}`, {
            method: "POST",
            body: {
              plan,
              ...(mode === "propose" ? { discount_percent: discount } : {}),
            },
          });
          a.refresh();
          onClose();
        }}
      >
        {mode === "propose" ? (
          <Field
            label="Descuento (%)"
            type="number"
            min="0"
            max="99.99"
            step="0.01"
            required
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        ) : (
          <p>Precio original: {money(p.original_price)} por unidad</p>
        )}
        {mode === "propose" && (
          <p className="price-change">
            {percent(discount)} de descuento · Precio por unidad:{" "}
            {money(price * 100)}
          </p>
        )}
        <PlanEditor value={plan} onChange={setPlan} />
        <Preview
          price={price}
          quantity={p.quantity}
          plan={plan}
          onReady={setReady}
        />
      </Form>
    </Modal>
  );
}
function EditSchedule({ p, onClose }) {
  const a = useApp(),
    [rows, setRows] = useState(
      p.schedule.map((r) => ({ ...r, amount: r.amount / 100 })),
    ),
    [price, setPrice] = useState(p.unit_price / 100);
  return (
    <Modal wide title="Editar cuotas futuras" onClose={onClose}>
      <p>
        Las cuotas pasadas o con pagos se mantienen. Los importes deben sumar el
        total pactado antes de aplicar abonos
      </p>
      <Form
        submit="Guardar calendario"
        onSubmit={async (b) => {
          await api("/purchases/" + p.id, {
            method: "PATCH",
            body: {
              reason: b.reason,
              schedule: rows,
              ...(a.manager ? { price } : {}),
            },
          });
          a.refresh("Calendario actualizado");
          onClose();
        }}
      >
        {a.manager && (
          <Field
            label="Precio unitario acordado (₡)"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        )}
        <p>
          Total necesario:{" "}
          <strong>{money(Math.round(price * 100) * p.quantity)}</strong> ·
          Cuotas:{" "}
          {money(
            Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100),
          )}
        </p>
        {rows.map((r, i) => {
          const fixed =
            r.due < a.session.today ||
            (p.ledger.schedule.find((x) => x.id === r.id)?.paid || 0) > 0;
          return (
            <div className="custom-date" key={r.id}>
              <Field
                label={"Fecha " + (i + 1)}
                type="date"
                required
                value={r.due}
                disabled={fixed}
                onChange={(e) =>
                  setRows(
                    rows.map((x) =>
                      x.id === r.id ? { ...x, due: e.target.value } : x,
                    ),
                  )
                }
              />
              <Field
                label="Monto (₡)"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={r.amount}
                disabled={fixed}
                onChange={(e) =>
                  setRows(
                    rows.map((x) =>
                      x.id === r.id ? { ...x, amount: e.target.value } : x,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="quiet"
                disabled={fixed}
                onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
              >
                Quitar
              </Button>
            </div>
          );
        })}
        <Button
          variant="secondary"
          type="button"
          icon={Plus}
          onClick={() =>
            setRows([
              ...rows,
              { id: newId(), due: a.session.today, amount: "" },
            ])
          }
        >
          Añadir cuota
        </Button>
        <Field label="Motivo del cambio" name="reason" required />
      </Form>
    </Modal>
  );
}
export function TrashConfirm({ type, id, name, onClose, onDone }) {
  const a = useApp();
  return (
    <Modal title="Enviar a papelera" onClose={onClose}>
      <p>
        <strong>{name}</strong>
      </p>
      <p>
        {type === "client"
          ? "Se retirarán el cliente y sus compras con pagos y calendarios. Las reservas pendientes se liberarán. "
          : type === "purchase"
            ? "Se retirará la compra con sus pagos y calendario. Las reservas pendientes se liberarán. "
            : "Las compras confirmadas conservarán el nombre y precio pactados. "}
        El dueño podrá restaurar durante 30 días. Después se eliminará
        definitivamente
      </p>
      <Form
        danger
        submit="Enviar a papelera"
        onSubmit={async () => {
          await api(`/trash/${type}/${id}`, { method: "POST", body: {} });
          a.refresh("Registro en papelera");
          onClose();
          onDone?.();
        }}
      />
    </Modal>
  );
}
