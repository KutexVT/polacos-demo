import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Check,
  X,
  Shield,
  Clock,
  MessagesSquare,
  Send,
  Paperclip,
  Mic,
  Square,
  ArrowLeft,
  Headphones,
  Users,
  File,
  Download,
  RotateCw,
} from "lucide-react";

import { useApp } from "./main";
import { Heading } from "./commerce";
import { api, money, priceChange, day, time, labels, id as newId } from "./api";
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
  PlanEditor,
  Preview,
  useData,
} from "./ui";
export function Requests() {
  const a = useApp(),
    [tab, setTab] = useState("prices"),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(null),
    [status, setStatus] = useState("all"),
    [q, setQ] = useState("");
  const filters = `?page=${page}&q=${encodeURIComponent(q)}${status === "all" ? "" : "&status=" + status}`;
  const prices = useData(a.scope("/price-requests" + filters), a.revision),
    access = useData(a.scope("/access" + filters), a.revision),
    directory = useData(a.scope("/directory"), a.revision);
  const state = tab === "prices" ? prices : access;
  const items = state.data?.items || [];
  return (
    <>
      <Heading
        title="Solicitudes"
        description="Decisiones de precio y acceso compartido"
      >
        {a.user.role === "polaco" && (
          <Button icon={Plus} onClick={() => setModal({ type: "request" })}>
            Solicitar acceso
          </Button>
        )}
      </Heading>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={tab === "prices" ? "active" : ""}
            onClick={() => {
              setTab("prices");
              setPage(1);
              setStatus("all");
            }}
          >
            Precios
          </button>
          <button
            className={tab === "access" ? "active" : ""}
            onClick={() => {
              setTab("access");
              setPage(1);
              setStatus("all");
            }}
          >
            Accesos temporales
          </button>
        </div>
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Buscar solicitud"
        />
        <select
          aria-label="Estado de solicitudes"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todos los estados</option>
          {[
            "pending",
            "approved",
            "rejected",
            ...(tab === "prices" ? ["cancelled"] : ["revoked", "expired"]),
          ].map((s) => (
            <option key={s} value={s}>
              {s === "pending"
                ? "Pendientes"
                : s === "expired"
                  ? "Vencidos"
                  : labels[s]}
            </option>
          ))}
        </select>
      </div>
      <State {...state}>
        {items.length ? (
          <div className="request-list">
            {items.map((r) => (
              <article className="request-row" key={r.id}>
                <div className="request-title">
                  <h3>
                    {tab === "prices"
                      ? r.product_name
                      : `${r.requester_name} → ${r.target_name}`}
                  </h3>
                  <Badge status={r.expired ? "revoked" : r.status}>
                    {r.expired
                      ? "Vencido"
                      : r.status === "pending"
                        ? "Pendiente"
                        : labels[r.status]}
                  </Badge>
                </div>
                {tab === "prices" ? (
                  <>
                    <p>
                      {r.client_name} · {r.quantity} unidades · Solicitado por{" "}
                      {r.requester_name}
                    </p>
                    <p className="price-change">
                      {priceChange(
                        r.original_price,
                        r.price,
                        r.discount_percent,
                      )}
                    </p>
                    <div className="price-comparison">
                      <span>
                        Original <b>{money(r.original_price)}</b>
                      </span>
                      <span>
                        Propuesto <b>{money(r.price)}</b>
                      </span>
                      <span>
                        Total <b>{money(r.price * r.quantity)}</b>
                      </span>
                    </div>
                    {r.reason && <p>Motivo: {r.reason}</p>}
                    <div className="button-row">
                      {a.manager && r.status === "pending" && (
                        <>
                          <Button
                            onClick={() =>
                              setModal({ type: "approve", request: r })
                            }
                          >
                            Revisar y aprobar
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setModal({ type: "reject", request: r })
                            }
                          >
                            Rechazar
                          </Button>
                        </>
                      )}
                      <Button
                        variant="quiet"
                        onClick={() =>
                          a.navigate("/purchases/" + r.purchase_id)
                        }
                      >
                        Ver compra
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{r.scope}</p>
                    <p>
                      {labels[r.permission]} ·{" "}
                      {r.all_clients
                        ? "Todos los clientes"
                        : `${r.client_ids.length} clientes y ${r.purchase_ids.length} compras seleccionados`}
                    </p>
                    <small>Caduca: {time(r.expires_at)}</small>
                    {r.reason && <p>{r.reason}</p>}
                    <div className="button-row">
                      {r.status === "pending" &&
                        (r.target_id === a.user.id || a.admin) && (
                          <>
                            <Button
                              onClick={() =>
                                setModal({ type: "grant", request: r })
                              }
                            >
                              Elegir qué compartir
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setModal({ type: "denyAccess", request: r })
                              }
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                      {["pending", "approved"].includes(r.status) &&
                        (r.target_id === a.user.id || a.manager) && (
                          <Button
                            variant="quiet"
                            onClick={() =>
                              setModal({ type: "revoke", request: r })
                            }
                          >
                            Revocar
                          </Button>
                        )}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Shield} title="Sin solicitudes en esta vista">
            Las decisiones pendientes y resueltas aparecerán aquí
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
      {modal?.type === "request" && (
        <Modal title="Solicitar acceso temporal" onClose={() => setModal(null)}>
          <p>
            El destinatario elegirá los clientes o compras que quiere compartir
            contigo
          </p>
          <Form
            submit="Enviar solicitud"
            onSubmit={async (b) => {
              await api("/access", { method: "POST", body: b });
              a.refresh("Solicitud enviada");
              setModal(null);
            }}
          >
            <Field label="Compañero">
              <select name="target_id" required>
                <option value="">Selecciona una persona</option>
                {directory.data
                  ?.filter((u) => u.id !== a.user.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Qué acceso necesitas">
              <textarea
                name="scope"
                required
                maxLength="1000"
                rows="3"
                placeholder="Describe el trabajo que necesitas realizar"
              />
            </Field>
            <Field label="Permiso solicitado">
              <select name="permission">
                <option value="read">Solo lectura</option>
                <option value="edit">Lectura y edición comercial</option>
              </select>
            </Field>
            <Field
              label="Duración solicitada (horas)"
              name="hours"
              type="number"
              min="1"
              max="720"
              defaultValue="24"
              required
            />
          </Form>
        </Modal>
      )}
      {modal?.type === "approve" && (
        <Approve r={modal.request} onClose={() => setModal(null)} />
      )}
      {modal?.type === "grant" && (
        <Grant r={modal.request} onClose={() => setModal(null)} />
      )}
      {["reject", "denyAccess", "revoke"].includes(modal?.type) && (
        <Modal
          title={
            modal.type === "revoke" ? "Revocar acceso" : "Rechazar solicitud"
          }
          onClose={() => setModal(null)}
        >
          <Form
            submit="Confirmar decisión"
            onSubmit={async (b) => {
              await api(
                modal.type === "reject"
                  ? `/price-requests/${modal.request.id}/decide`
                  : `/access/${modal.request.id}/decide`,
                {
                  method: "POST",
                  body: {
                    ...b,
                    decision: modal.type === "revoke" ? "revoked" : "rejected",
                  },
                },
              );
              a.refresh("Decisión guardada");
              setModal(null);
            }}
          >
            <Field label="Motivo (opcional)">
              <textarea name="reason" rows="3" maxLength="1000" />
            </Field>
            {modal.type === "reject" && (
              <p className="notice">
                La compra quedará pendiente de decisión y conservará su reserva
              </p>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
function Approve({ r, onClose }) {
  const a = useApp(),
    [plan, setPlan] = useState(r.plan),
    [ready, setReady] = useState(false);
  return (
    <Modal wide title="Aprobar precio y calendario" onClose={onClose}>
      <p className="price-change">
        {priceChange(r.original_price, r.price, r.discount_percent)}
      </p>
      <p>
        {r.client_name} · {r.quantity} × {money(r.price)} · Total{" "}
        {money(r.price * r.quantity)}
      </p>
      <Form
        submit="Aprobar compra"
        disabled={!ready}
        onSubmit={async (b) => {
          await api("/price-requests/" + r.id + "/decide", {
            method: "POST",
            body: { ...b, decision: "approved", plan },
          });
          a.refresh("Precio aprobado");
          onClose();
        }}
      >
        <PlanEditor value={plan} onChange={setPlan} />
        <Preview
          price={r.price / 100}
          quantity={r.quantity}
          plan={plan}
          onReady={setReady}
        />
        <Field label="Motivo o comentario (opcional)" name="reason" />
      </Form>
    </Modal>
  );
}
function Grant({ r, onClose }) {
  const a = useApp(),
    [all, setAll] = useState(false),
    [clientIds, setClients] = useState([]),
    [purchaseIds, setPurchases] = useState([]);
  const [search, setSearch] = useState("");
  const clients = useData(
      a.scope("/clients?limit=100&q=" + encodeURIComponent(search)),
    ),
    purchases = useData(
      a.scope("/purchases?limit=100&q=" + encodeURIComponent(search)),
    );
  const expiry = new Date(r.expires_at)
    .toLocaleString("sv-SE", { timeZone: "America/Costa_Rica" })
    .replace(" ", "T")
    .slice(0, 16);
  const toggle = (arr, set, id) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <Modal wide title={"Compartir con " + r.requester_name} onClose={onClose}>
      <Form
        submit="Conceder acceso"
        onSubmit={async (b) => {
          await api("/access/" + r.id + "/decide", {
            method: "POST",
            body: {
              decision: "approved",
              permission: b.permission,
              expires_at: b.expires_at + ":00-06:00",
              all_clients: all,
              client_ids: all ? [] : clientIds,
              purchase_ids: all ? [] : purchaseIds,
            },
          });
          a.refresh("Acceso concedido");
          onClose();
        }}
      >
        <p>{r.scope}</p>
        <div className="form-grid">
          <Field label="Permiso">
            <select name="permission" defaultValue={r.permission}>
              <option value="read">Solo lectura</option>
              <option value="edit">Edición de registros compartidos</option>
            </select>
          </Field>
          <Field
            label="Caduca en Costa Rica"
            name="expires_at"
            type="datetime-local"
            defaultValue={expiry}
            required
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Compartir todos mis clientes
        </label>
        {!all && (
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Buscar cliente o compra para compartir"
          />
        )}
        {!all && (
          <div className="share-columns">
            <div>
              <h3>Clientes completos</h3>
              {clients.data?.items
                .filter((c) => c.owner_id === r.target_id)
                .map((c) => (
                  <label className="checkbox" key={c.id}>
                    <input
                      type="checkbox"
                      checked={clientIds.includes(c.id)}
                      onChange={() => toggle(clientIds, setClients, c.id)}
                    />
                    {c.name}
                  </label>
                ))}
            </div>
            <div>
              <h3>Compras concretas</h3>
              {purchases.data?.items
                .filter((p) => p.owner_id === r.target_id)
                .map((p) => (
                  <label className="checkbox" key={p.id}>
                    <input
                      type="checkbox"
                      checked={purchaseIds.includes(p.id)}
                      onChange={() => toggle(purchaseIds, setPurchases, p.id)}
                    />
                    {p.client_name} · {p.product_name}
                  </label>
                ))}
            </div>
          </div>
        )}
        <p className="notice">
          La edición permite modificar y cobrar en el alcance elegido. No
          permite administrar inventario, usuarios, precios ni compartir los
          datos con terceros
        </p>
      </Form>
    </Modal>
  );
}
export function Chats({ id }) {
  const a = useApp(),
    [page, setPage] = useState(1),
    [messagePage, setMessagePage] = useState(1),
    [q, setQ] = useState(""),
    [modal, setModal] = useState(false);
  const conversations = useData(
      a.scope(`/conversations?page=${page}&q=${encodeURIComponent(q)}`),
      a.revision,
    ),
    chat = useData(
      id ? `/conversations/${id}?page=${messagePage}&limit=40` : null,
      a.revision,
    );
  const end = useRef(),
    chatStart = useRef();
  useEffect(() => {
    setMessagePage(1);
  }, [id]);
  useEffect(() => {
    if (chat.data && id) {
      api("/conversations/" + id + "/read", { method: "POST", body: {} }).catch(
        () => {},
      );
      end.current?.scrollIntoView({ block: "nearest" });
    }
  }, [chat.data?.messages.items[0]?.id, id]);
  return (
    <>
      <Heading
        title="Conversaciones"
        description="Conversaciones con tu equipo"
      >
        <Button icon={Plus} onClick={() => setModal(true)}>
          Nueva conversación
        </Button>
      </Heading>
      <p className="chat-disclosure">
        <Shield size={15} />
        Solo los participantes pueden consultar la conversación. Sin cifrado de
        extremo a extremo
      </p>
      <div ref={chatStart} className={"chat-layout " + (id ? "has-chat" : "")}>
        <aside className="chat-sidebar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Buscar conversación"
          />
          <State {...conversations}>
            {conversations.data?.items.length ? (
              conversations.data.items.map((c) => (
                <button
                  key={c.id}
                  className={"chat-link " + (id === c.id ? "active" : "")}
                  onClick={() => a.navigate("/chats/" + c.id, true)}
                >
                  <Photo name={c.name} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.message_count} mensajes</small>
                  </span>
                  {c.unread > 0 && <b className="nav-count">{c.unread}</b>}
                </button>
              ))
            ) : (
              <Empty icon={MessagesSquare} title="Sin conversaciones">
                Escribe a un compañero de tu equipo
              </Empty>
            )}
            <Pager data={conversations.data} page={page} setPage={setPage} />
          </State>
        </aside>
        <section className="chat-main">
          {id ? (
            <State {...chat}>
              {chat.data && (
                <>
                  <div className="chat-header">
                    <button
                      className="icon-button chat-back"
                      aria-label="Volver a conversaciones"
                      onClick={() => a.navigate("/chats", true)}
                    >
                      <ArrowLeft />
                    </button>
                    <div>
                      <h2>{chat.data.name}</h2>
                      <small>
                        {chat.data.members
                          .map(
                            (m) => m.name + (m.deleted_at ? " (retirado)" : ""),
                          )
                          .join(" · ")}
                      </small>
                    </div>
                  </div>
                  <div className="messages">
                    <Pager
                      data={chat.data.messages}
                      page={messagePage}
                      setPage={setMessagePage}
                    />
                    {[...chat.data.messages.items].reverse().map((m) => (
                      <div
                        key={m.id}
                        className={
                          "message " + (m.sender_id === a.user.id ? "mine" : "")
                        }
                      >
                        <strong className="sender">{m.sender_name}</strong>
                        {m.body && <p>{m.body}</p>}
                        {m.file_id && <Attachment m={m} />}
                        <small>{time(m.created_at)}</small>
                      </div>
                    ))}
                    <div ref={end} />
                  </div>
                  {chat.data.can_send && <Composer conversationId={id} />}
                </>
              )}
            </State>
          ) : (
            <Empty
              icon={MessagesSquare}
              title="Ninguna conversación seleccionada"
            >
              Elige una conversación para ver su historial
            </Empty>
          )}
        </section>
      </div>
      {modal && <NewConversation onClose={() => setModal(false)} />}
    </>
  );
}
function Attachment({ m }) {
  const url = "/api/files/" + m.file_id;
  return (
    <div className="attachment">
      {m.file_mime?.startsWith("image/") ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={m.file_name} />
        </a>
      ) : /^(audio|video)\//.test(m.file_mime) ? (
        <audio controls preload="metadata" src={url} />
      ) : null}
      <a href={url} target="_blank" rel="noreferrer">
        <File size={15} />
        {m.file_name}
        <Download size={15} />
      </a>
    </div>
  );
}
function Composer({ conversationId }) {
  const a = useApp(),
    [body, setBody] = useState(""),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [key, setKey] = useState(newId);
  const recorder = useRef(),
    stream = useRef();
  useEffect(
    () => () => {
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function upload(file) {
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      setFile(await api("/files", { method: "POST", body: data }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    if (recording) {
      recorder.current.stop();
      setRecording(false);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Este navegador no permite grabar audio. Puedes adjuntar un archivo",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const chunks = [];
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.current.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType });
        upload(
          new window.File(
            [blob],
            "Audio-" +
              Date.now() +
              "." +
              (r.mimeType.includes("mp4") ? "m4a" : "webm"),
            { type: r.mimeType },
          ),
        );
      };
      r.start();
      setRecording(true);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <form
      className="composer"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || recording) return;
        setBusy(true);
        setError("");
        try {
          await api("/conversations/" + conversationId + "/messages", {
            method: "POST",
            body: { body, file_id: file?.id, idempotency_key: key },
          });
          setBody("");
          setFile(null);
          setKey(newId());
          a.refresh("");
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <div className="error">{error} · Puedes reintentar el envío</div>
      )}
      {file && (
        <div className="attached">
          <File size={16} />
          {file.name}
          <button
            type="button"
            className="icon-button"
            aria-label="Quitar adjunto"
            onClick={() => setFile(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <textarea
        aria-label="Mensaje"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escribe un mensaje…"
        rows="2"
        maxLength="5000"
      />
      <div className="composer-actions">
        <label
          className="icon-button attachment-input"
          aria-label="Adjuntar archivo"
        >
          <Paperclip size={20} />
          <input
            type="file"
            aria-label="Adjuntar archivo"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) upload(e.target.files[0]);
            }}
          />
        </label>
        <button
          type="button"
          className={"icon-button " + (recording ? "recording" : "")}
          disabled={busy}
          aria-label={recording ? "Terminar grabación" : "Grabar audio"}
          onClick={record}
        >
          {recording ? <Square size={20} /> : <Mic size={20} />}
        </button>
        <small>
          {recording
            ? "Grabando… pulsa para terminar"
            : "Archivos de hasta 10 MB"}
        </small>
        <Button
          type="submit"
          busy={busy}
          disabled={recording || (!body.trim() && !file)}
          icon={Send}
        >
          Enviar
        </Button>
      </div>
    </form>
  );
}
function NewConversation({ onClose }) {
  const a = useApp(),
    directory = useData(a.scope("/directory")),
    [kind, setKind] = useState("direct"),
    [members, setMembers] = useState([]),
    [key] = useState(newId);
  return (
    <Modal title="Nueva conversación" onClose={onClose}>
      <Form
        submit="Enviar primer mensaje"
        onSubmit={async (b) => {
          const c = await api("/conversations", {
            method: "POST",
            body: { ...b, kind, members, idempotency_key: key },
          });
          a.refresh("Mensaje enviado");
          onClose();
          a.navigate("/chats/" + c.id);
        }}
      >
        <Field label="Tipo de conversación">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setMembers([]);
            }}
          >
            <option value="direct">Individual</option>
            <option value="group">Grupo de chat</option>
          </select>
        </Field>
        {kind === "direct" ? (
          <Field label="Compañero">
            <select
              required
              value={members[0] || ""}
              onChange={(e) => setMembers([e.target.value])}
            >
              <option value="">Selecciona una persona</option>
              {directory.data
                ?.filter((u) => u.id !== a.user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Nombre del chat" name="name" required />
            <div className="check-list">
              {directory.data
                ?.filter((u) => u.id !== a.user.id)
                .map((u) => (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      checked={members.includes(u.id)}
                      onChange={() =>
                        setMembers(
                          members.includes(u.id)
                            ? members.filter((x) => x !== u.id)
                            : [...members, u.id],
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
            </div>
          </>
        )}
        <Field label="Primer mensaje">
          <textarea
            name="body"
            required
            maxLength="5000"
            rows="4"
            placeholder="Escribe aquí…"
          />
        </Field>
      </Form>
    </Modal>
  );
}
