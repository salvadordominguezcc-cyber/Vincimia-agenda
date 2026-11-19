// Cambia el estado de una cita en la nube y avisa a los canales
// conectados. La usa el panel cuando la cita existe en Supabase.
// POST /api/appointments/status  { organization_id, appointment_id, status }
// Authorization: Bearer <excel_webhook_secret de la organización>
// status: confirmed | cancelled | completed
// - confirmed: actualiza en Supabase, la sube/actualiza en Google
//   Calendar (si está conectado) y manda la confirmación por WhatsApp
//   (si está configurado y el paciente tiene teléfono).
// - cancelled: actualiza, borra su evento de Google y no manda WhatsApp.
// - completed: actualiza (check-in) y actualiza su evento en Google.
// Devuelve el resultado por canal: si un canal no está conectado, lo
// dice y no lo inventa. Si la cita solo existe en el aparato del
// usuario (no en la nube), responde 404 y el panel sigue funcionando
// en local, como antes.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  confirmationTextCloud,
  isFirstVisitCloud,
  loadAppointmentFull,
  loadOrg,
  pushAppointmentToGoogle,
} from "@/lib/server-appointments";
import {
  normalizePhone,
  sendWhatsAppConfirmation,
  whatsappConfigured,
} from "@/lib/whatsapp";

const ALLOWED = ["confirmed", "cancelled", "completed"] as const;

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const appointmentId = String(body.appointment_id ?? "");
  const status = String(body.status ?? "");
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !appointmentId || !ALLOWED.includes(status as (typeof ALLOWED)[number]) || !secret) {
    return Response.json(
      { ok: false, message: "Faltan datos o el estado no es válido (confirmed, cancelled o completed)." },
      { status: 400 }
    );
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
  const org = await loadOrg(supabase, organizationId);
  if (!org) {
    return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
  }
  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("organization_id", organizationId);
  if (updateError) {
    return Response.json({ ok: false, message: updateError.message }, { status: 500 });
  }
  const appt = await loadAppointmentFull(supabase, organizationId, appointmentId);
  if (!appt) {
    return Response.json(
      { ok: false, message: "Esa cita no está en la nube (solo existe en el aparato)." },
      { status: 404 }
    );
  }

  const google = await pushAppointmentToGoogle(supabase, org, appt);

  let whatsapp: { done: boolean; reason?: string; messageId?: string } = {
    done: false,
    reason: "No se manda WhatsApp para este estado.",
  };
  if (status === "confirmed") {
    if (!whatsappConfigured()) {
      whatsapp = { done: false, reason: "WhatsApp no configurado en el servidor." };
    } else if (!org.whatsapp_bot_enabled) {
      whatsapp = { done: false, reason: "El bot está apagado para este negocio." };
    } else {
      const to = normalizePhone(appt.contactPhone);
      if (!to) {
        whatsapp = { done: false, reason: "El paciente no tiene teléfono guardado." };
      } else {
        const first = await isFirstVisitCloud(supabase, appt);
        const text = confirmationTextCloud(org.name, appt, first);
        const date = new Intl.DateTimeFormat("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(`${appt.start_time.slice(0, 10)}T12:00:00`));
        try {
          const sent = await sendWhatsAppConfirmation(
            to,
            text,
            [appt.contactName, appt.serviceName, date, appt.start_time.slice(11, 16)]
          );
          await supabase
            .from("appointments")
            .update({ whatsapp_confirmed: true })
            .eq("id", appt.id);
          whatsapp = { done: true, messageId: sent.messageId };
        } catch (e) {
          whatsapp = { done: false, reason: `WhatsApp: ${String(e)}` };
        }
      }
    }
  }

  return Response.json({
    ok: true,
    status,
    google: google.done
      ? { done: true, action: google.action }
      : { done: false, reason: google.reason },
    whatsapp,
  });
}
