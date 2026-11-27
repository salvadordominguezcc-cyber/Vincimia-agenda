// Webhook de WhatsApp Cloud API (Meta) — recibe las respuestas de
// los pacientes y contesta solo. Esta es la URL que se pega en Meta:
// https://vincimia-agenda.pages.dev/api/webhook/whatsapp
//
// GET: verificación de Meta (hub.verify_token debe ser igual a
// WHATSAPP_VERIFY_TOKEN). POST: mensajes entrantes.
// - El paciente escribe "confirmo" o "sí" → su próxima cita en
//   pendiente se confirma y se marca whatsapp_confirmed = true.
// - Escribe "cancelar" o "no" → se cancela su próxima cita.
// - Cualquier otro texto → se le contesta su próxima cita (fecha, hora,
//   servicio y doctor) y se le pide que escriba Confirmo o Cancelar.
// Solo actúa sobre citas en la nube y solo sobre el número del
// paciente (se busca por teléfono). Nunca simula: sin token, no
// contesta. Los mensajes que cobra Meta son los que envía la clínica;
// los que manda el paciente nunca se cobran.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { formatClinicDate, formatClinicTime } from "@/lib/clinic-time";
import {
  isFirstVisitCloud,
  loadAppointmentFull,
  loadOrg,
} from "@/lib/server-appointments";
import {
  normalizeStoredPhone,
  sendWhatsAppText,
  whatsappConfigured,
  whatsappVerifyToken,
} from "@/lib/whatsapp";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = whatsappVerifyToken();
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge, { status: 200 });
  }
  return Response.json(
    { ok: false, message: "Token de verificación incorrecto." },
    { status: 403 }
  );
}

interface IncomingMessage {
  from?: string;
  text?: { body?: string };
  type?: string;
}

function findPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase || !whatsappConfigured()) {
    // Meta reintenta solo: se responde 200 para no entrar en bucle,
    // pero no se contesta nada sin configuración.
    return Response.json({ ok: false, message: "WhatsApp no configurado." });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true });
  }
  const entries = (body.entry as unknown[] | undefined) ?? [];
  for (const entry of entries) {
    const changes = ((entry as { changes?: unknown[] }).changes ?? []) as {
      value?: { messages?: IncomingMessage[] };
    }[];
    for (const change of changes) {
      const messages = change.value?.messages ?? [];
      for (const msg of messages) {
        if (msg.type !== "text" || !msg.from || !msg.text?.body) continue;
        const fromDigits = findPhoneDigits(msg.from);
        const text = msg.text.body.trim().toLowerCase();
        // Se busca el contacto por el teléfono COMPLETO en
        // internacional (52… México, 1… Estados Unidos): los
        // últimos 10 dígitos de un número de EUA podían coincidir
        // con un contacto mexicano distinto. Meta manda el número
        // en E.164 sin "+", así que el país se detecta solo.
        const fromNormalized = normalizeStoredPhone(fromDigits);
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, organization_id, full_name, phone");
        const contact = (
          contacts as
            | { id: string; organization_id: string; full_name: string; phone: string }[]
            | null
        )?.find(
          (c) => normalizeStoredPhone(c.phone) === fromNormalized
        );
        if (!contact) {
          await sendWhatsAppText(
            normalizeStoredPhone(msg.from) ?? msg.from,
            "Hola, gracias por escribir a Vincimia Agenda. No encontramos una cita con este número. Llama a la clínica para agendar."
          ).catch(() => undefined);
          continue;
        }
        const org = await loadOrg(supabase, contact.organization_id);
        if (!org || !org.whatsapp_bot_enabled) continue;
        const nowISO = new Date().toISOString();
        const { data: appts } = await supabase
          .from("appointments")
          .select("id")
          .eq("organization_id", contact.organization_id)
          .eq("contact_id", contact.id)
          .in("status", ["pending", "confirmed", "on_hold"])
          .gte("start_time", nowISO)
          .order("start_time", { ascending: true })
          .limit(1);
        const apptRow = (appts as { id: string }[] | null)?.[0];
        const to = normalizeStoredPhone(msg.from) ?? msg.from;
        if (!apptRow) {
          await sendWhatsAppText(
            to,
            `Hola ${contact.full_name}, no tienes citas próximas registradas. Llama a la clínica para agendar una.`
          ).catch(() => undefined);
          continue;
        }
        const appt = await loadAppointmentFull(supabase, contact.organization_id, apptRow.id);
        if (!appt) continue;
        const date = formatClinicDate(appt.start_time);
        const time = formatClinicTime(appt.start_time);
        if (text.includes("confirmo") || text === "si" || text === "sí" || text === "acepto") {
          if (appt.status === "on_hold") {
            await sendWhatsAppText(
              to,
              `Hola ${appt.contactName}, tu cita quedó en pausa porque el doctor atiende con anticipo. La clínica te va a confirmar los horarios propuestos.`
            ).catch(() => undefined);
            continue;
          }
          await supabase
            .from("appointments")
            .update({ status: "confirmed", whatsapp_confirmed: true })
            .eq("id", appt.id);
          await sendWhatsAppText(
            to,
            `Listo, ${appt.contactName}, tu cita de ${appt.serviceName} el ${date} a las ${time} quedó confirmada. Te esperamos.`
          ).catch(() => undefined);
        } else if (text.includes("cancelar") || text === "no" || text.includes("no puedo")) {
          await supabase
            .from("appointments")
            .update({ status: "cancelled" })
            .eq("id", appt.id);
          await sendWhatsAppText(
            to,
            `Entendido, ${appt.contactName}, tu cita de ${appt.serviceName} el ${date} a las ${time} quedó cancelada. Cuando quieras, puedes agendar otra.`
          ).catch(() => undefined);
        } else {
          const first = await isFirstVisitCloud(supabase, appt);
          const summary =
            `Hola ${appt.contactName}, tienes una cita de ${appt.serviceName}` +
            `${appt.doctorName ? ` con ${appt.doctorName}` : ""} el ${date} a las ${time} ` +
            `(${appt.status === "confirmed" ? "confirmada" : appt.status === "on_hold" ? "en pausa, esperando los horarios del doctor" : "pendiente de confirmar"}).` +
            (first
              ? " Te recomendamos llegar 15 minutos antes para llenar tu historial clínico."
              : "") +
            " Responde Confirmo para confirmar o Cancelar para cancelarla.";
          await sendWhatsAppText(to, summary).catch(() => undefined);
        }
      }
    }
  }
  return Response.json({ ok: true });
}
