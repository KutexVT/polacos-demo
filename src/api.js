export async function api(path, options = {}) {
  const headers =
    options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" };
  let response;
  try {
    response = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: { ...headers, ...options.headers },
      body:
        options.body instanceof FormData
          ? options.body
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "Sin conexión. La operación no está confirmada. Reconecta y reintenta",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "Respuesta inesperada del servidor" }));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "No se pudo completar la operación");
  }
  return data;
}
export const money = (value) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format((value || 0) / 100);
export const percent = (value) =>
  new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 }).format(
    Number(value),
  ) + "%";
export function priceChange(original, proposed, requested = null) {
  const change =
    requested == null
      ? ((original - proposed) * 100) / original
      : Number(requested);
  return (
    percent(Math.abs(change)) + (change < 0 ? " de aumento" : " de descuento")
  );
}
export const day = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "America/Costa_Rica",
      }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value))
    : "Sin fecha";
export const time = (value) =>
  new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
export const labels = {
  admin: "Administrador",
  owner: "Dueño",
  polaco: "Polaco",
  pending: "Pendiente de aprobación",
  decision: "Pendiente de decisión",
  active: "Activa",
  paid: "Pagada",
  cancelled: "Cancelada",
  approved: "Aprobada",
  rejected: "Rechazada",
  revoked: "Revocada",
  overdue: "Atrasada",
  partial: "Parcial",
  read: "Lectura",
  edit: "Edición",
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Cada 15 días",
  semimonthly: "Dos fechas fijas al mes",
  monthly: "Mensual",
  quarterly: "Trimestral",
  custom: "Fechas personalizadas",
};
export const id = () => crypto.randomUUID();
