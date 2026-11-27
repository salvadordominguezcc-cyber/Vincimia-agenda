// Aviso al dueño cuando se confirma una cita: el bot llena solo el
// FORMATO DE CITA y se lo manda por WhatsApp al dueño (Salvador) para
// que él lo reenvíe al grupo de promotores de WhatsApp.
// El bot NO puede publicar en el grupo: la API de WhatsApp Cloud de
// Meta solo manda mensajes 1 a 1, no a grupos. Por eso el reenvío al
// grupo sigue siendo manual, pero ya con la tarjeta llena.
// Solo servidor (rutas /api/*): aquí vive el token de WhatsApp.
// Es fire-and-forget: si el aviso al dueño falla, la confirmación al
// paciente ya se hizo (o ya falló por su lado) y el cambio de estado
// de la cita NO se rompe: el fallo solo queda registrado en la
// respuesta de la ruta, nunca se lanza una excepción.
//
// LÍMITE HONESTO DE META (ventana de 24 horas): el texto libre solo
// llega si el dueño escribió al número 663 en las últimas 24 horas.
// Fuera de esa ventana Meta rechaza el texto libre (error 131047) y
// haría falta una plantilla aprobada. NO se inventa ningún nombre de
// plantilla aquí: si Meta devuelve ese error, se registra tal cual
// ("fuera de la ventana de 24 horas") y NO se finge que se envió.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClinicDate, formatClinicTime } from "./clinic-time";
import { normalizePhone, sendWhatsAppText, whatsappConfigured } from "./whatsapp";
import { formatPhoneDisplay } from "./phone";
import type { ApptFull, OrgRow } from "./server-appointments";

/** Teléfono del dueño por defecto (Salvador), solo como último
 *  recurso: 686 114 0969 en México → 526861140969. Se usa solo si no
 *  hay OWNER_WHATSAPP_NUMBER ni teléfono de dueño en Supabase. */
export const DEFAULT_OWNER_WHATSAPP = "526861140969";

const CHANNEL_LABEL: Record<string, string> = {
  vincimia_link: "Link público",
  whatsapp_bot: "WhatsApp",
  excel_promoter: "Excel / Promotor",
  google_calendar: "Google Calendar",
};

export interface OwnerCardInput {
  /** Nombre del promotor que trajo la cita (si viene de la hoja o del
   *  bot). Sin promotor, la póliza por defecto ya dice SALVADOR. */
  promoterName?: string | null;
  /** Promoción o valoración que se escribe en la hoja. Por defecto
   *  VALORACIÓN: las citas que llegan por Agenda son normalmente de
   *  pacientes por primera vez. */
  promotion?: string | null;
  /** Tipo de póliza + promotor, ej. "PARTICULAR /SALVADOR". Por
   *  defecto "PARTICULAR /SALVADOR" cuando no viene ninguna. */
  policy?: string | null;
}

/** Texto del FORMATO DE CITA ya lleno, listo para reenviar al grupo
 *  de promotores (y al prospecto, con la línea de recepción). Fecha y
 *  hora en hora de la clínica (Mexicali). */
export function buildOwnerCardText(
  orgName: string,
  appt: ApptFull,
  input: OwnerCardInput = {}
): string {
  const date = formatClinicDate(appt.start_time);
  const time = formatClinicTime(appt.start_time);
  const promotion = (input.promotion ?? appt.serviceName ?? "VALORACIÓN").trim() || "VALORACIÓN";
  const policy = (input.policy ?? "PARTICULAR /SALVADOR").trim().toUpperCase() || "PARTICULAR /SALVADOR";
  const channel = CHANNEL_LABEL[appt.source] ?? appt.source ?? "Link público";
  const lines = [
    `⭐ FORMATO DE CITA — ${orgName.toUpperCase()}`,
    ``,
    `Clínica: DENTIPLUS MEXICALI`,
    `Paciente: ${appt.contactName}`,
    `Teléfono: ${appt.contactPhone ? formatPhoneDisplay(appt.contactPhone) : "—"}`,
    `Fecha: ${date}`,
    `Hora: ${time}`,
    `Tratamiento que busca: ${promotion}`,
    `Promotora: ${input.promoterName ?? "Salvador"}`,
    `Llegó por: ${channel}`,
    `Póliza: ${policy}`,
    ``,
    `Esta es tu cita, favor de presentar este cuadrito en recepción para que te puedan atender y te respeten promociones.`,
  ];
  return lines.join("\n");
}

/** Resuelve a qué número avisar al dueño, en este orden:
 *  1. Variable de entorno OWNER_WHATSAPP_NUMBER (Cloudflare).
 *  2. Teléfono del dueño en Supabase (columna owner_phone de la
 *     organización, si existe: hoy el esquema no la trae, así que si
 *     la consulta falla se ignora y se sigue al paso 3).
 *  3. Default 526861140969 (Salvador) como último recurso. */
export async function resolveOwnerPhone(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  const fromEnv = normalizePhone(process.env.OWNER_WHATSAPP_NUMBER?.trim());
  if (fromEnv) return fromEnv;
  try {
    const { data } = await supabase
      .from("organizations")
      .select("owner_phone")
      .eq("id", organizationId)
      .single();
    const fromDb = normalizePhone(
      (data as { owner_phone?: string | null } | null)?.owner_phone ?? null
    );
    if (fromDb) return fromDb;
  } catch {
    // Sin columna owner_phone (esquema actual): se sigue al default.
  }
  return DEFAULT_OWNER_WHATSAPP;
}

export type OwnerNotifyResult =
  | { done: true; to: string; messageId: string }
  | { done: false; to: string | null; reason: string };

/** Manda la tarjeta llena al dueño por WhatsApp. Nunca lanza: si
 *  algo falla (sin WhatsApp configurado, bot apagado, ventana de 24
 *  horas cerrada), devuelve el motivo para que la ruta lo registre
 *  en su respuesta sin romper la confirmación. */
export async function notifyOwnerOfConfirmation(
  supabase: SupabaseClient,
  org: OrgRow,
  appt: ApptFull,
  input: OwnerCardInput = {}
): Promise<OwnerNotifyResult> {
  if (!whatsappConfigured()) {
    return { done: false, to: null, reason: "WhatsApp no configurado en el servidor." };
  }
  if (!org.whatsapp_bot_enabled) {
    return { done: false, to: null, reason: "El bot está apagado para este negocio." };
  }
  const to = await resolveOwnerPhone(supabase, org.id);
  const text = buildOwnerCardText(org.name, appt, input);
  try {
    const messageId = await sendWhatsAppText(to, text);
    return { done: true, to, messageId };
  } catch (e) {
    const msg = String(e);
    // Error 131047 de Meta: texto libre fuera de la ventana de 24 h.
    // Se dice claro, no se finge envío y no se inventa plantilla.
    if (/131047|24\s*hours|ventana/i.test(msg)) {
      return {
        done: false,
        to,
        reason:
          "No llegó al dueño: fuera de la ventana de 24 horas de WhatsApp (el dueño no escribió al número 663 en las últimas 24 horas). Meta exige una plantilla aprobada para ese caso; no hay plantilla de aviso al dueño configurada.",
      };
    }
    return { done: false, to, reason: `WhatsApp al dueño: ${msg}` };
  }
}
