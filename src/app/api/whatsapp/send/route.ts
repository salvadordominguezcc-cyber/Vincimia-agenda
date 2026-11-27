// Envía la confirmación de una cita por WhatsApp.
// POST /api/whatsapp/send  { organization_id, appointment_id }
// Authorization: Bearer <excel_webhook_secret de la organización>
// Usa el mismo texto que el panel (con el aviso de llegar 15 minutos
// antes solo si es primera vez). Si hay plantilla configurada
// (WHATSAPP_TEMPLATE_NAME) se manda la plantilla; si no, texto libre
// (solo llega si el paciente escribió en las últimas 24 horas).
// Marca whatsapp_confirmed = true en la cita. Nunca simula: sin
// token o sin teléfono del paciente responde 503/400 y explica por qué.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { formatClinicDate, formatClinicTime } from "@/lib/clinic-time";
import {
  confirmationTextCloud,
  isFirstVisitCloud,
  loadAppointmentFull,
  loadOrg,
} from "@/lib/server-appointments";
import {
  normalizeStoredPhone,
  sendWhatsAppConfirmation,
  whatsappConfigured,
} from "@/lib/whatsapp";

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  if (!whatsappConfigured()) {
    return Response.json(
      {
        ok: false,
        message:
          "WhatsApp no configurado: faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Cloudflare (ver FASE2_SETUP.md).",
      },
      { status: 503 }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const appointmentId = String(body.appointment_id ?? "");
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !appointmentId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id, appointment_id o el secreto." },
      { status: 400 }
    );
  }
  const org = await loadOrg(supabase, organizationId);
  if (!org) {
    return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
  }
  const { data: secretOk } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (!secretOk) {
    return Response.json({ ok: false, message: "Secreto inválido." }, { status: 401 });
  }
  const appt = await loadAppointmentFull(supabase, organizationId, appointmentId);
  if (!appt) {
    return Response.json(
      { ok: false, message: "Esa cita no está en la nube (solo existe en el aparato)." },
      { status: 404 }
    );
  }
  const to = normalizeStoredPhone(appt.contactPhone);
  if (!to) {
    return Response.json(
      { ok: false, message: "Ese paciente no tiene teléfono guardado." },
      { status: 400 }
    );
  }
  const first = await isFirstVisitCloud(supabase, appt);
  const text = confirmationTextCloud(org.name, appt, first);
  const date = formatClinicDate(appt.start_time);
  try {
    const sent = await sendWhatsAppConfirmation(
      to,
      text,
      [appt.contactName, appt.serviceName, date, formatClinicTime(appt.start_time)]
    );
    await supabase
      .from("appointments")
      .update({ whatsapp_confirmed: true })
      .eq("id", appt.id);
    return Response.json({
      ok: true,
      messageId: sent.messageId,
      via: sent.via,
      message: `Confirmación enviada por WhatsApp a ${appt.contactName}.`,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        message: `WhatsApp no pudo enviar el mensaje: ${String(e)}`,
      },
      { status: 502 }
    );
  }
}
