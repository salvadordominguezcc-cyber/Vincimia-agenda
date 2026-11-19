// Ayudas de servidor para Fase 2: cargar una cita con sus datos desde
// Supabase, armar el texto de confirmación y empujarla a Google Calendar.
// Solo se usa en rutas /api/* (service_role). La app del panel sigue
// leyendo sus datos del aparato; estas rutas trabajan sobre la nube, así
// que solo actúan cuando la cita existe en Supabase (semilla, Sheets o
// citas creadas por el servidor). Si la cita solo existe en el aparato,
// devuelven "not_in_cloud" y el panel sigue mostrando el texto para
// copiar a mano, como antes.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  googleEventBody,
  refreshGoogleAccessToken,
  updateGoogleEvent,
  siteUrl,
  type AppointmentForGoogle,
} from "./google";

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  buffer_minutes: number;
  break_start: string | null;
  break_end: string | null;
  google_calendar_sync: boolean;
  connected_google_email: string | null;
  google_calendar_id: string;
  google_refresh_token: string | null;
  whatsapp_bot_enabled: boolean;
}

export interface ApptFull {
  id: string;
  organization_id: string;
  contact_id: string | null;
  service_id: string | null;
  doctor_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  status: string;
  source: string;
  notes: string | null;
  proposed_times: string | null;
  whatsapp_confirmed: boolean;
  google_event_id: string | null;
  contactName: string;
  contactPhone: string | null;
  serviceName: string;
  doctorName: string | null;
}

export async function loadOrg(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrgRow | null> {
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, buffer_minutes, break_start, break_end, google_calendar_sync, connected_google_email, google_calendar_id, google_refresh_token, whatsapp_bot_enabled"
    )
    .eq("id", organizationId)
    .single();
  return (data as OrgRow | null) ?? null;
}

export async function loadAppointmentFull(
  supabase: SupabaseClient,
  organizationId: string,
  appointmentId: string
): Promise<ApptFull | null> {
  const { data: appt } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();
  if (!appt) return null;
  const [contact, service, doctor] = await Promise.all([
    appt.contact_id
      ? supabase.from("contacts").select("full_name, phone").eq("id", appt.contact_id).single()
      : Promise.resolve({ data: null }),
    appt.service_id
      ? supabase.from("services").select("name").eq("id", appt.service_id).single()
      : Promise.resolve({ data: null }),
    appt.doctor_id
      ? supabase.from("doctors").select("name").eq("id", appt.doctor_id).single()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...(appt as ApptFull),
    contactName: (contact.data as { full_name?: string } | null)?.full_name ?? "Sin contacto",
    contactPhone: (contact.data as { phone?: string | null } | null)?.phone ?? null,
    serviceName: (service.data as { name?: string } | null)?.name ?? "Servicio",
    doctorName: (doctor.data as { name?: string } | null)?.name ?? null,
  };
}

/** ¿Es la primera vez que viene este paciente? Igual que en el panel:
 *  primera vez si no tiene ninguna cita anterior (no cancelada, no en
 *  conflicto, no en pausa). */
export async function isFirstVisitCloud(
  supabase: SupabaseClient,
  appt: ApptFull
): Promise<boolean> {
  if (!appt.contact_id) return true;
  const { data } = await supabase
    .from("appointments")
    .select("id, start_time, status")
    .eq("organization_id", appt.organization_id)
    .eq("contact_id", appt.contact_id)
    .lt("start_time", appt.start_time)
    .not("status", "in", '("cancelled","conflict","on_hold")');
  return !data || data.length === 0;
}

const dayFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function confirmationTextCloud(
  orgName: string,
  appt: ApptFull,
  firstVisit: boolean
): string {
  const date = dayFmt.format(new Date(`${appt.start_time.slice(0, 10)}T12:00:00`));
  const time = appt.start_time.slice(11, 16);
  let text =
    `Hola ${appt.contactName}, tu cita en ${orgName} está confirmada: ` +
    `${appt.serviceName}${appt.doctorName ? ` con ${appt.doctorName}` : ""} el ${date} a las ${time}.`;
  if (firstVisit) {
    text +=
      " Te recomendamos llegar 15 minutos antes para llenar tu historial clínico.";
  } else {
    text += " Te esperamos.";
  }
  return text;
}

function toGoogleAppt(org: OrgRow, appt: ApptFull): AppointmentForGoogle {
  return {
    id: appt.id,
    start_time: appt.start_time,
    end_time: appt.end_time,
    status: appt.status,
    notes: appt.notes,
    contactName: appt.contactName,
    contactPhone: appt.contactPhone,
    serviceName: appt.serviceName,
    doctorName: appt.doctorName,
    orgName: org.name,
    siteUrl: siteUrl(),
  };
}

export type GooglePushResult =
  | { done: false; reason: string }
  | { done: true; action: "created" | "updated" | "deleted" | "skipped"; eventId: string | null };

/** Empuja una cita a Google Calendar (o la borra si se canceló).
 *  No hace nada si Google no está conectado. Devuelve el motivo cuando
 *  no se pudo, para que el panel lo muestre en palabras normales. */
export async function pushAppointmentToGoogle(
  supabase: SupabaseClient,
  org: OrgRow,
  appt: ApptFull
): Promise<GooglePushResult> {
  if (!org.google_calendar_sync || !org.google_refresh_token) {
    return { done: false, reason: "Google Calendar no conectado." };
  }
  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken(org.google_refresh_token);
  } catch (e) {
    return { done: false, reason: `No se pudo renovar la sesión de Google: ${String(e)}` };
  }
  const calendarId = org.google_calendar_id || "primary";
  const gAppt = toGoogleAppt(org, appt);
  try {
    if (appt.status === "cancelled") {
      if (!appt.google_event_id) return { done: true, action: "skipped", eventId: null };
      await deleteGoogleEvent(accessToken, calendarId, appt.google_event_id);
      await supabase
        .from("appointments")
        .update({ google_event_id: null })
        .eq("id", appt.id);
      return { done: true, action: "deleted", eventId: null };
    }
    if (appt.status === "conflict" || appt.status === "on_hold") {
      // En pausa o en conflicto no se publica en Google: no bloquea.
      return { done: true, action: "skipped", eventId: appt.google_event_id };
    }
    if (appt.google_event_id) {
      const ev = await updateGoogleEvent(accessToken, calendarId, appt.google_event_id, gAppt);
      return { done: true, action: "updated", eventId: ev.id };
    }
    const ev = await createGoogleEvent(accessToken, calendarId, gAppt);
    await supabase
      .from("appointments")
      .update({ google_event_id: ev.id })
      .eq("id", appt.id);
    return { done: true, action: "created", eventId: ev.id };
  } catch (e) {
    return { done: false, reason: `Google Calendar: ${String(e)}` };
  }
}

export { googleEventBody };
