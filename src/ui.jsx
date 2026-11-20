import React, { useEffect, useRef, useState } from "react";
import {
  X,
  LoaderCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  Check,
  AlertCircle,
  CalendarDays,
  Plus,
  Trash2,
} from "lucide-react";
import { api, money, day, labels } from "./api";
export function useData(path, revision = 0) {
  const [state, set] = useState({ data: null, error: "", loading: true });
  useEffect(() => {
    let active = true;
    if (!path) {
      set({ data: null, error: "", loading: false });
      return;
    }
    set((s) => ({ ...s, loading: true, error: "" }));
    api(path)
      .then((data) => {
        if (active) set({ data, error: "", loading: false });
      })
      .catch((e) => {
        if (active) set({ data: null, error: e.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return state;
}
export function State({ loading, error, children }) {
  if (loading)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="spin" size={22} /> Cargando tus datos…
      </div>
    );
  if (error)
    return (
      <div className="error" role="alert">
        <AlertCircle size={20} />
        {error}
      </div>
    );
  return children;
}
// Keep column labels and native table semantics when records reflow into cards.
export function RecordTable({ children }) {
  const tableId = useRef("records-" + crypto.randomUUID()).current;
  const sections = React.Children.toArray(children);
  const head = sections.find((section) => section.type === "thead");
  const columns = React.Children.toArray(head.props.children.props.children);
  return (
    <table className="record-table" role="table">
      {sections.map((section) => {
        if (section.type === "thead") {
          const headers = columns.map((column, index) =>
            React.cloneElement(
              column,
              {
                id: tableId + "-" + index,
                scope: "col",
                role: "columnheader",
                key: index,
              },
              column.props.children || "Acciones",
            ),
          );
          return React.cloneElement(
            section,
            { role: "rowgroup" },
            React.cloneElement(
              section.props.children,
              { role: "row" },
              headers,
            ),
          );
        }
        const rows = React.Children.map(section.props.children, (row) => {
          if (!row) return null;
          const cells = React.Children.toArray(row.props.children).map(
            (cell, index) =>
              React.cloneElement(cell, {
                role: "cell",
                headers: tableId + "-" + index,
                "data-label": columns[index].props.children || "Acciones",
              }),
          );
          return React.cloneElement(row, { role: "row" }, cells);
        });
        return React.cloneElement(section, { role: "rowgroup" }, rows);
      })}
    </table>
  );
}
export function Empty({ icon: Icon = CalendarDays, title, children, action }) {
  return (
    <div className="empty">
      <Icon size={38} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Badge({ status, children }) {
  return (
    <span className={"badge " + status}>
      {children || labels[status] || status}
    </span>
  );
}
export function Button({
  children,
  icon: Icon,
  variant = "",
  busy = false,
  ...props
}) {
  return (
    <button
      {...props}
      className={`button ${variant} ${props.className || ""}`}
      disabled={busy || props.disabled}
    >
      {busy ? (
        <LoaderCircle size={17} className="spin" />
      ) : Icon ? (
        <Icon size={17} />
      ) : null}
      {children}
    </button>
  );
}
export function Field({ label, hint, children, ...props }) {
  const ref = useRef(crypto.randomUUID());
  return (
    <div className="field">
      <label htmlFor={ref.current}>{label}</label>
      {children ? (
        React.cloneElement(children, { id: ref.current })
      ) : (
        <input id={ref.current} {...props} />
      )}{" "}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Form({
  onSubmit,
  children,
  submit = "Guardar",
  danger = false,
  disabled = false,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || disabled) return;
        const values = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError("");
        try {
          await onSubmit(values);
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="form-footer">
        <Button
          type="submit"
          busy={busy}
          disabled={disabled}
          variant={danger ? "danger" : ""}
        >
          {submit}
        </Button>
      </div>
    </form>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const cancel = (e) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", cancel);
    return () => d.removeEventListener("cancel", cancel);
  }, []);
  return (
    <dialog ref={ref} className={wide ? "wide" : ""}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Pager({ data, page, setPage }) {
  if (!data || data.pages < 2) return null;
  return (
    <div className="pager">
      <span>
        {data.total} registros · Página {page} de {data.pages}
      </span>
      <Button
        variant="quiet"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
        icon={ChevronLeft}
      >
        Anterior
      </Button>
      <Button
        variant="quiet"
        disabled={page >= data.pages}
        onClick={() => setPage(page + 1)}
        icon={ChevronRight}
      >
        Siguiente
      </Button>
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = "Buscar…" }) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Photo({ id, name, size = "" }) {
  return id ? (
    <img className={`avatar ${size}`} src={"/api/files/" + id} alt={name} />
  ) : (
    <span className={`avatar ${size}`}>
      {(name || "P")
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function FileField({
  label = "Imagen",
  name = "image_id",
  initial = "",
  accept = "image/*",
}) {
  const [value, setValue] = useState(initial || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="field">
      <label>{label}</label>
      <input type="hidden" name={name} value={value} />
      <div className="upload">
        <Upload size={18} />
        <input
          aria-label={label}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const data = new FormData();
              data.append("file", file);
              const saved = await api("/files", { method: "POST", body: data });
              setValue(saved.id);
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {busy ? (
        <small>Guardando archivo…</small>
      ) : value ? (
        <small className="success">
          Archivo guardado{" "}
          <button type="button" onClick={() => setValue("")}>
            Quitar
          </button>
        </small>
      ) : (
        <small>Opcional · Máximo 10 MB</small>
      )}
      {error && <small className="error">{error}</small>}
    </div>
  );
}
export const frequencies = [
  "daily",
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "custom",
];
export function PlanEditor({ value, onChange }) {
  const change = (key, val) => onChange({ ...value, [key]: val });
  return (
    <div className="plan-editor">
      <div className="form-grid">
        <Field label="Frecuencia">
          <select
            value={value.frequency}
            onChange={(e) => change("frequency", e.target.value)}
          >
            {frequencies.map((f) => (
              <option key={f} value={f}>
                {labels[f]}
              </option>
            ))}
          </select>
        </Field>
        {value.frequency !== "custom" && (
          <>
            <Field
              label="Primera fecha"
              type="date"
              required
              value={value.start || ""}
              onChange={(e) => change("start", e.target.value)}
            />
            <Field
              label="Monto de la cuota (₡)"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={value.installment || ""}
              onChange={(e) => change("installment", e.target.value)}
            />
          </>
        )}
        {["monthly", "quarterly"].includes(value.frequency) && (
          <Field
            label="Día del mes"
            type="number"
            min="1"
            max="31"
            value={value.day || ""}
            onChange={(e) => change("day", e.target.value)}
            hint="Si ese día no existe se usa el último día del mes"
          />
        )}
        {value.frequency === "semimonthly" && (
          <>
            <Field
              label="Primer día"
              type="number"
              min="1"
              max="30"
              value={value.days?.[0] || 15}
              onChange={(e) =>
                change("days", [Number(e.target.value), value.days?.[1] || 30])
              }
            />
            <Field
              label="Segundo día"
              type="number"
              min="2"
              max="31"
              value={value.days?.[1] || 30}
              onChange={(e) =>
                change("days", [value.days?.[0] || 15, Number(e.target.value)])
              }
            />
          </>
        )}
      </div>
      {value.frequency === "custom" && (
        <div>
          {(value.dates || []).map((r, i) => (
            <div className="custom-date" key={i}>
              <Field
                label={`Fecha ${i + 1}`}
                type="date"
                required
                value={r.due}
                onChange={(e) =>
                  change(
                    "dates",
                    value.dates.map((a, j) =>
                      j === i ? { ...a, due: e.target.value } : a,
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
                onChange={(e) =>
                  change(
                    "dates",
                    value.dates.map((a, j) =>
                      j === i ? { ...a, amount: e.target.value } : a,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="quiet"
                aria-label="Quitar vencimiento"
                icon={Trash2}
                onClick={() =>
                  change(
                    "dates",
                    value.dates.filter((_, j) => i !== j),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="quiet"
            icon={Plus}
            onClick={() =>
              change("dates", [
                ...(value.dates || []),
                { due: value.start, amount: "" },
              ])
            }
          >
            Añadir vencimiento
          </Button>
        </div>
      )}
    </div>
  );
}
export function Preview({ price, quantity, plan, onReady }) {
  const [state, set] = useState({ data: null, error: "", busy: false });
  const signature = JSON.stringify([price, quantity, plan]);
  useEffect(() => {
    set({ data: null, error: "", busy: false });
    onReady(false);
  }, [signature]);
  return (
    <div className="preview">
      <Button
        type="button"
        variant="secondary"
        icon={CalendarDays}
        busy={state.busy}
        onClick={async () => {
          set((s) => ({ ...s, busy: true, error: "" }));
          try {
            const data = await api("/schedule/preview", {
              method: "POST",
              body: { price, quantity, plan },
            });
            set({ data, error: "", busy: false });
            onReady(true);
          } catch (e) {
            set({ data: null, error: e.message, busy: false });
          }
        }}
      >
        Ver calendario
      </Button>
      {state.error && <div className="error">{state.error}</div>}
      {state.data && (
        <div className="schedule-preview">
          <strong>
            {state.data.schedule.length} cuotas ·{" "}
            {money(state.data.schedule.reduce((s, r) => s + r.amount, 0))}
          </strong>
          <div className="preview-rows">
            {state.data.schedule.map((r, i) => (
              <div key={r.id}>
                <span>
                  {i + 1}. {day(r.due)}
                </span>
                <strong>{money(r.amount)}</strong>
              </div>
            ))}
          </div>
          <small>Sin intereses ni recargos</small>
        </div>
      )}
    </div>
  );
}
