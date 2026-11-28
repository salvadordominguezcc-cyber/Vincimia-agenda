// Registro de páginas 404.
// POST /api/not-found/log { path }
// - Todas las rutas quedan registradas en el log del servidor.
// - Solo los links de reserva rotos (ruta que empieza con /reserva/)
//   avisan al dueño por WhatsApp, y como máximo 1 aviso por ruta por
//   hora, para no llenarlo de mensajes.
// - No se guarda nada en Supabase ni se crean columnas o tablas.
// - El aviso usa el mismo número del dueño que el aviso de
//   confirmación (src/lib/owner-notify.ts: 526861140969) y el mismo
//   envío de texto libre. Límite honesto de Meta: el texto libre solo
//   llega si el dueño escribió al número 663 en las últimas 24 horas;
//   fuera de esa ventana el fallo queda registrado y no se finge envío.

export const runtime = "edge";

import { DEFAULT_OWNER_WHATSAPP } from "@/lib/owner-notify";
import { sendWhatsAppText, whatsappConfigured } from "@/lib/whatsapp";
import { formatClinicDate, formatClinicTime } from "@/lib/clinic-time";

const ALERT_TTL_MS = 60 * 60 * 1000; // 1 aviso por ruta por hora
const lastAlertAt = new Map<string, number>();

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const path =
    typeof body.path === "string" && body.path.startsWith("/")
      ? body.path
      : "/";
  const now = new Date();
  console.warn(`[404] ${path} — ${now.toISOString()}`);

  if (!path.startsWith("/reserva/")) {
    return Response.json({ ok: true, alerted: false });
  }

  const last = lastAlertAt.get(path) ?? 0;
  if (now.getTime() - last < ALERT_TTL_MS) {
    return Response.json({ ok: true, alerted: false, throttled: true });
  }
  lastAlertAt.set(path, now.getTime());

  if (!whatsappConfigured()) {
    console.warn("[404] WhatsApp no configurado; no se avisó al dueño.");
    return Response.json({
      ok: true,
      alerted: false,
      reason: "WhatsApp no configurado en el servidor.",
    });
  }

  const text = [
    `⚠️ Link de reserva roto — Dentiplus Mexicali`,
    ``,
    `Alguien abrió ${path} y no existe.`,
    `Fecha: ${formatClinicDate(now.toISOString())}`,
    `Hora: ${formatClinicTime(now.toISOString())} (Mexicali)`,
    ``,
    `Link bueno: https://vincimia-agenda.pages.dev/reserva/clinica-dentiplus`,
  ].join("\n");

  try {
    const messageId = await sendWhatsAppText(DEFAULT_OWNER_WHATSAPP, text);
    return Response.json({ ok: true, alerted: true, messageId });
  } catch (e) {
    const reason = String(e);
    console.warn(`[404] No se pudo avisar al dueño: ${reason}`);
    return Response.json({ ok: true, alerted: false, reason });
  }
}
