import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  Package,
  CalendarDays,
  GitPullRequest,
  MessagesSquare,
  Bell,
  Settings,
  UserCog,
  Archive,
  ChartNoAxesCombined,
  Building2,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  ArrowRight,
  Check,
  WifiOff,
  Wallet,
  Banknote,
} from "lucide-react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import { api, labels, day } from "./api";
import { Button, Field, Form, Photo, Modal, useData } from "./ui";
import {
  Dashboard,
  Calendar,
  Reports,
  Groups,
  Team,
  Trash,
  SettingsPage,
  Notifications,
} from "./management";
import { Clients, ClientDetail, Inventory, PurchaseDetail } from "./commerce";
import { Requests, Chats } from "./social";
import { AdminHome, AdminGroupReview } from "./admin";
import { CashRegister } from "./register";
import { CashCounterPage } from "./cash-counter";
import "./style.css";
export const Context = createContext(null);
export const useApp = () => useContext(Context);
function App() {
  const [session, setSession] = useState(null),
    [boot, setBoot] = useState(true),
    [route, setRoute] = useState(location.pathname),
    [revision, setRevision] = useState(0),
    [group, setGroup] = useState(""),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [onboarding, setOnboarding] = useState(false),
    [globalError, setGlobalError] = useState(""),
    [cashCounts, setCashCounts] = useState({});
  useEffect(() => setCashCounts({}), [session?.user.id]);
  const navigate = useCallback((path, keepGroup = false) => {
    if (!keepGroup) setGroup("");
    history.pushState({}, "", path);
    setRoute(path);
    setMenu(false);
    window.scrollTo(0, 0);
  }, []);
  const refresh = useCallback((message = "Guardado") => {
    setRevision((r) => r + 1);
    if (message) setToast(message);
  }, []);
  const loadSession = useCallback(async () => {
    try {
      const data = await api("/me");
      setSession(data);
      setOnboarding(!data.user.preferences.onboarded);
    } catch {
      setSession(null);
    } finally {
      setBoot(false);
    }
  }, []);
  useEffect(() => {
    const unhandled = (e) => {
      e.preventDefault();
      setGlobalError(e.reason?.message || "No se pudo confirmar la operación");
    };
    addEventListener("unhandledrejection", unhandled);
    return () => removeEventListener("unhandledrejection", unhandled);
  }, []);
  useEffect(() => {
    loadSession();
    const pop = () => setRoute(location.pathname);
    const expired = () => setSession(null);
    const connection = () => setOnline(navigator.onLine);
    addEventListener("popstate", pop);
    addEventListener("session-expired", expired);
    addEventListener("online", connection);
    addEventListener("offline", connection);
    return () => {
      removeEventListener("popstate", pop);
      removeEventListener("session-expired", expired);
      removeEventListener("online", connection);
      removeEventListener("offline", connection);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const es = new EventSource("/api/events");
    es.addEventListener("update", () => refresh(""));
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    const timer = setInterval(() => refresh(""), 30000);
    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const groupData = useData(
    session?.user.role === "admin" ? "/groups?limit=100" : null,
    revision,
  );
  const notices = useData(
    session && session.user.role !== "admin"
      ? "/notifications?limit=100"
      : null,
    revision,
  );
  if (boot)
    return (
      <div className="boot">
        <span className="brand-mark">p</span>
        <p>Abriendo Polacos…</p>
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={async () => {
          navigate("/");
          await loadSession();
        }}
      />
    );
  const { user } = session;
  const admin = user.role === "admin",
    manager = admin || user.role === "owner";
  const reviewId =
    admin && route.startsWith("/groups/") ? route.split("/")[2] : "";
  const activeGroup = reviewId || group;
  const groupQuery = admin && activeGroup ? `group_id=${activeGroup}` : "";
  const scope = (path) => path + (path.includes("?") ? "&" : "?") + groupQuery;
  const nav = admin
    ? [
        ["/", "Estadísticas", ChartNoAxesCombined],
        ["/groups", "Grupos", Building2],
      ]
    : [
        ["/", "Inicio", LayoutDashboard],
        ["/clients", "Clientes", Users],
        ["/inventory", "Inventario", Package],
        ["/calendar", "Cobros", CalendarDays],
        ["/register", "Cierre de caja", Wallet],
        ["/cash", "Contar efectivo", Banknote],
        ["/requests", "Solicitudes", GitPullRequest],
        ["/chats", "Chats", MessagesSquare],
        ["/notifications", "Notificaciones", Bell],
        ...(manager
          ? [
              ["/reports", "Reportes", ChartNoAxesCombined],
              ["/team", "Usuarios", UserCog],
              ["/trash", "Papelera", Archive],
            ]
          : []),
        ["/settings", "Configuración", Settings],
      ];
  const title =
    nav.find(([p]) => (p === "/" ? route === "/" : route.startsWith(p)))?.[1] ||
    "Detalle";
  const unread = notices.data?.items.filter((n) => !n.read_at).length || 0;
  const ctx = {
    session,
    user,
    admin,
    manager,
    group: activeGroup,
    setGroup,
    scope,
    navigate,
    revision,
    refresh,
    reload: loadSession,
    cashCounts,
    setCashCounts,
    groupData: groupData.data?.items || [],
  };
  let content;
  if (admin) {
    if (route.startsWith("/groups/"))
      content = (
        <AdminGroupReview
          id={reviewId}
          section={route.split("/")[3] || "overview"}
        />
      );
    else if (route === "/groups") content = <Groups />;
    else if (route === "/settings") content = <SettingsPage />;
    else content = <AdminHome />;
  } else if (route === "/") content = <Dashboard />;
  else if (!admin && route.startsWith("/register")) content = <CashRegister />;
  else if (!admin && route === "/cash") content = <CashCounterPage />;
  else if (route === "/clients") content = <Clients />;
  else if (route.startsWith("/clients/"))
    content = <ClientDetail id={route.split("/")[2]} />;
  else if (route === "/inventory") content = <Inventory />;
  else if (route.startsWith("/purchases/"))
    content = <PurchaseDetail id={route.split("/")[2]} />;
  else if (route === "/calendar") content = <Calendar />;
  else if (route === "/requests") content = <Requests />;
  else if (route.startsWith("/chats"))
    content = <Chats id={route.split("/")[2]} />;
  else if (route === "/notifications") content = <Notifications />;
  else if (route === "/reports" && manager) content = <Reports />;
  else if (route === "/team" && manager) content = <Team />;
  else if (route === "/groups" && admin) content = <Groups />;
  else if (route === "/trash" && manager) content = <Trash />;
  else if (route === "/settings") content = <SettingsPage />;
  else content = admin ? <AdminHome /> : <Dashboard />;
  return (
    <Context.Provider value={ctx}>
      <div
        className={
          "app palette-" +
          (user.preferences.palette || "forest") +
          " theme-" +
          (user.preferences.theme || "light")
        }
      >
        <aside className={"sidebar " + (menu ? "open" : "")}>
          <button
            className="icon-button drawer-close"
            aria-label="Cerrar navegación"
            onClick={() => setMenu(false)}
          >
            <X size={21} />
          </button>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            className="brand"
          >
            <span className="brand-mark">p</span>
            <span>
              polacos<span className="brand-dot">.</span>
            </span>
          </a>
          <nav aria-label="Navegación principal">
            {nav.map(([path, label, Icon]) => (
              <a
                key={path}
                className={
                  (path === "/" ? route === "/" : route.startsWith(path))
                    ? "active"
                    : ""
                }
                href={path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(path);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {path === "/notifications" && unread > 0 && (
                  <b className="nav-count">{unread}</b>
                )}
              </a>
            ))}
          </nav>
        </aside>
        {menu && (
          <button
            className="nav-overlay"
            aria-label="Cerrar menú"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="workspace">
          <header className="topbar">
            <div className="top-title">
              <button
                className="icon-button mobile-menu"
                aria-label="Abrir menú"
                onClick={() => setMenu(!menu)}
              >
                <Menu />
              </button>
              <span>{title}</span>
            </div>
            <div className="top-actions">
              {!admin && (
                <>
                  <button
                    className="icon-button notification-button"
                    aria-label="Ver notificaciones"
                    onClick={() => navigate("/notifications")}
                  >
                    <Bell size={21} />
                    {unread > 0 && <i />}
                  </button>
                </>
              )}
              <button
                className="user-button"
                onClick={() => navigate("/settings")}
              >
                <Photo name={user.name} />
                <span>
                  {user.name}
                  <small>{labels[user.role]}</small>
                </span>
              </button>
            </div>
          </header>
          {!online && (
            <div className="offline" role="status">
              <WifiOff size={17} /> Conexión interrumpida. Los cambios necesitan
              confirmación del servidor
            </div>
          )}
          <main key={route}>
            {globalError && (
              <div className="error" role="alert">
                {globalError}
                <button
                  onClick={() => setGlobalError("")}
                  aria-label="Cerrar error"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {content}
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Navegación móvil">
          {nav
            .filter(([p]) =>
              (admin
                ? ["/", "/groups"]
                : ["/", "/clients", "/calendar", "/chats"]
              ).includes(p),
            )
            .map(([p, l, I]) => (
              <button
                key={p}
                className={route === p ? "active" : ""}
                onClick={() => navigate(p)}
              >
                <I size={21} />
                {l}
              </button>
            ))}
          {!admin && (
            <button onClick={() => setMenu(true)}>
              <Menu size={21} />
              Más
            </button>
          )}
        </nav>
        {toast && (
          <div className="toast" role="status">
            <Check size={19} />
            {toast}
          </div>
        )}
        {onboarding && (
          <Modal
            title="Colores de tu cuenta"
            onClose={() => setOnboarding(false)}
          >
            <p>
              Elige los colores con los que vas a trabajar. Solo cambian en tu
              cuenta
            </p>
            <Palette
              current={user.preferences.palette || "forest"}
              onSelect={async (palette) => {
                await api("/me", {
                  method: "PATCH",
                  body: { palette, onboarded: true },
                });
                setOnboarding(false);
                await loadSession();
              }}
            />
            <Button
              variant="quiet"
              onClick={async () => {
                await api("/me", {
                  method: "PATCH",
                  body: { onboarded: true },
                });
                setOnboarding(false);
              }}
            >
              Continuar con estos colores
            </Button>
          </Modal>
        )}
      </div>
    </Context.Provider>
  );
}
export function Palette({ current, onSelect }) {
  return (
    <div className="palettes">
      {[
        ["forest", "Bosque"],
        ["ocean", "Océano"],
        ["plum", "Ciruela"],
        ["earth", "Tierra"],
      ].map(([id, name]) => (
        <button
          className={
            "palette-choice " + id + (current === id ? " selected" : "")
          }
          key={id}
          onClick={() => onSelect(id)}
        >
          <span />
          {name}
          {current === id && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}
function Login({ onLogin }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enter(role) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/entry", { method: "POST", body: { role } });
      await onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login demo-login">
      <section className="login-story">
        <a className="brand">
          <span className="brand-mark">p</span>polacos.
        </a>
        <h1>
          Clientes
          <br />y cobros
        </h1>
      </section>
      <section className="login-form">
        <span className="mobile-brand">polacos.</span>
        <h2>Elige un perfil</h2>
        <p className="demo-disclosure">
          Versión de pruebas compartida con datos ficticios
        </p>
        <div className="entry-options">
          <button
            className={"entry-option " + (adminOpen ? "selected" : "")}
            aria-expanded={adminOpen}
            aria-controls="admin-login"
            disabled={busy}
            onClick={() => {
              setAdminOpen(!adminOpen);
              setError("");
            }}
          >
            <strong>Administrador</strong>
            <span>Estadísticas y grupos · Con contraseña</span>
          </button>
          <button
            className="entry-option"
            disabled={busy}
            onClick={() => enter("owner")}
          >
            <strong>Dueño</strong>
            <span>Inventario y equipo · Acceso directo</span>
          </button>
          <button
            className="entry-option"
            disabled={busy}
            onClick={() => enter("polaco")}
          >
            <strong>Polaco</strong>
            <span>Clientes y cobros · Acceso directo</span>
          </button>
        </div>
        {busy && <p role="status">Entrando…</p>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {adminOpen && (
          <div id="admin-login" className="admin-login">
            <h3>Acceso de administrador</h3>
            <Form
              submit="Iniciar sesión"
              onSubmit={async (values) => {
                await api("/login", { method: "POST", body: values });
                await onLogin();
              }}
            >
              <Field
                label="Usuario"
                name="username"
                autoComplete="username"
                required
                placeholder="Tu nombre de usuario"
              />
              <Field
                label="Contraseña"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="Tu contraseña"
              />
            </Form>
          </div>
        )}
        <p className="demo-warning">
          Los cambios de Dueño y Polaco son visibles para quienes prueben la
          página. Usa solo datos ficticios
        </p>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
