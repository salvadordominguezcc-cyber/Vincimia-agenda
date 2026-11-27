// Google Calendar — solo servidor (rutas /api/*). Nunca se importa
// desde un componente del navegador: aquí viven el client_secret y
// el refresh_token de la cuenta secundaria.
// Sin GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configurados, nada de
// esto corre: la página Conectores dice Pendiente y por qué.

import { formatPhoneDisplay, normalizeStoredPhone } from "./phone";
import {
  attachClinicOffset,
  CLINIC_TIME_ZONE,
  clinicWallISO,
  formatClinicDate,
  formatClinicTime12,
} from "./clinic-time";

/** Zona horaria de las clínicas: Mexicali (America/Tijuana). La hora
 *  y el desfase viven en src/lib/clinic-time.ts. */
export { CLINIC_TIME_ZONE };

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
  "profile",
].join(" ");

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://vincimia-agenda.pages.dev"
  ).replace(/\/$/, "");
}

export function googleRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    `${siteUrl()}/api/google-calendar/callback`
  );
}

/** URL de autorización OAuth. prompt=select_account para elegir la
 *  cuenta secundaria sin cerrar la sesión principal. access_type=offline
 *  para que Google devuelva un refresh_token que se guarda en
 *  organizations.google_refresh_token. */
export function googleAuthUrl(organizationId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "select_account",
    include_granted_scopes: "true",
    state: organizationId,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? "Google no devolvió un token."
    );
  }
  return json;
}

export async function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  return postToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(),
  });
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<string> {
  const json = await postToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return json.access_token;
}

export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

export interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
}

async function googleFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Google Calendar: HTTP ${res.status}`);
  }
  return json;
}

/** Eventos del calendario entre dos fechas (RFC 3339). */
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const json = (await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  )) as { items?: GoogleEvent[] };
  return (json.items ?? []).filter((e) => e.status !== "cancelled");
}

export interface AppointmentForGoogle {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  contactName: string;
  contactPhone: string | null;
  serviceName: string;
  doctorName: string | null;
  /** Especialidad del doctor (general, ortodoncia_general,
   *  endodoncista, ...): decide el color del evento. */
  doctorSpecialty?: string | null;
  /** Póliza de la cita, ej. "PARTICULAR /SALVADOR". */
  policy?: string | null;
  /** Nombre del promotor que trajo la cita (por defecto Salvador). */
  promoterName?: string | null;
  source?: string | null;
  orgName: string;
  siteUrl: string;
}

/** Teléfono a 10 dígitos (formato que usa la clínica en el título:
 *  "6861991700"). Quita el 52 de México y cualquier otro carácter. */
export function phone10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits || null;
}

/** Colores de Google Calendar (colorId) según la regla de la clínica
 *  (2026-11-26): rojo para póliza Particular con doctor general;
 *  otros tratamientos llevan su color. Google solo tiene 11 colores:
 *  11 = Tomato (rojo), 3 = Grape (morado), 7 = Peacock (turquesa). */
export function googleColorIdFor(appt: AppointmentForGoogle): string {
  const s = (appt.doctorSpecialty ?? "").toLowerCase();
  if (s === "endodoncista" || s === "endodoncista_general") return "7";
  if (s === "ortodoncia_general") return "3";
  return "11";
}

/** Emoji de estado del título, como lo usa la clínica en su
 *  calendario: 🟢 cita confirmada, 🟡 pendiente. */
export function statusEmoji(status: string): string {
  return status === "confirmed" || status === "completed" ? "🟢" : "🟡";
}

/** Texto que se le manda al paciente por WhatsApp, con el mismo
 *  formato que usa la clínica hoy: "Hola, tienes una cita el jueves,
 *  12 de noviembre, a las 02:00 p. m. con Dental dentiplus Mexicali."
 *  El nombre del negocio sale de la organización (Ajustes). Fecha y
 *  hora en hora de la clínica (Mexicali). */
export function clientWhatsAppText(appt: AppointmentForGoogle): string {
  const day = formatClinicDate(appt.start_time);
  const time = formatClinicTime12(appt.start_time);
  return `Hola, tienes una cita el ${day}, a las ${time} con ${appt.orgName}.`;
}

/** Link api.whatsapp.com/send con el texto ya escrito, listo para
 *  hablarle al cliente desde la descripción del evento (como lo hace
 *  Confirmafy hoy, pero sin depender de ese servicio externo).
 *  Usa el internacional completo (52… México, 1… Estados Unidos):
 *  antes se pegaba un 52 fijo y un número de EUA quedaba roto. */
export function clientWhatsAppLink(appt: AppointmentForGoogle): string | null {
  const full = normalizeStoredPhone(appt.contactPhone);
  if (!full) return null;
  return `https://api.whatsapp.com/send?phone=${full}&text=${encodeURIComponent(
    clientWhatsAppText(appt)
  )}`;
}

/** Las citas se guardan como instantes (o como hora local con
 *  desfase). Google necesita fecha con zona horaria: se convierte a
 *  hora de pared de la clínica con su desfase correcto (Mexicali). */
function toGoogleDateTime(iso: string): string {
  const wall = clinicWallISO(iso);
  return attachClinicOffset(wall);
}

/** Formato de evento igual al que usa la clínica en su Google
 *  Calendar (antes lo generaba Confirmafy; ahora lo genera Vincimia):
 *  título "🟢 Nombre / teléfono / tratamiento", color según el
 *  doctor (rojo Particular/general, morado ortodoncia, turquesa
 *  endodoncia), recordatorio 30 minutos antes, y descripción con la
 *  póliza, el promotor, el canal y el link de WhatsApp con el texto
 *  ya escrito para hablarle al cliente. */
export function googleEventBody(appt: AppointmentForGoogle): Record<string, unknown> {
  const p10 = phone10(appt.contactPhone);
  const emoji = statusEmoji(appt.status);
  const summary = p10
    ? `${emoji} ${appt.contactName} / ${p10} / ${appt.serviceName}`
    : `${emoji} ${appt.contactName} / ${appt.serviceName}`;
  const waLink = clientWhatsAppLink(appt);
  const channel: Record<string, string> = {
    vincimia_link: "Link público",
    whatsapp_bot: "WhatsApp",
    excel_promoter: "Excel / Promotor",
    google_calendar: "Google Calendar",
  };
  const description =
    `Cita de ${appt.orgName} (Vincimia Agenda).\n` +
    `Paciente: ${appt.contactName}${appt.contactPhone ? ` (${formatPhoneDisplay(appt.contactPhone)})` : ""}\n` +
    `Servicio: ${appt.serviceName}\n` +
    `Doctor: ${appt.doctorName ?? "Sin asignar"}\n` +
    `Póliza: ${appt.policy ?? "PARTICULAR /SALVADOR"}\n` +
    `Promotora: ${appt.promoterName ?? "Salvador"}\n` +
    `Llegó por: ${channel[appt.source ?? ""] ?? "Link público"}\n` +
    `Estado: ${appt.status}\n` +
    (appt.notes ? `Notas: ${appt.notes}\n` : "") +
    (waLink ? `Hablar con el cliente: ${waLink}\n` : "") +
    `Ver en la agenda: ${appt.siteUrl}/dashboard`;
  return {
    summary,
    description,
    colorId: googleColorIdFor(appt),
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 30 }],
    },
    start: { dateTime: toGoogleDateTime(appt.start_time), timeZone: CLINIC_TIME_ZONE },
    end: { dateTime: toGoogleDateTime(appt.end_time), timeZone: CLINIC_TIME_ZONE },
  };
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  appt: AppointmentForGoogle
): Promise<GoogleEvent> {
  return (await googleFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(googleEventBody(appt)),
  })) as GoogleEvent;
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  appt: AppointmentForGoogle
): Promise<GoogleEvent> {
  return (await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(googleEventBody(appt)) }
  )) as GoogleEvent;
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
}
