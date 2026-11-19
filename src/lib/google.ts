// Google Calendar — solo servidor (rutas /api/*). Nunca se importa
// desde un componente del navegador: aquí viven el client_secret y
// el refresh_token de la cuenta secundaria.
// Sin GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configurados, nada de
// esto corre: la página Conectores dice Pendiente y por qué.

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

/** Zona horaria de las clínicas (sin horario de verano desde 2022). */
export const CLINIC_TIME_ZONE = "America/Mexico_City";
const MX_OFFSET = "-06:00";

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
  orgName: string;
  siteUrl: string;
}

/** Las citas se guardan como hora local (ej. "2026-11-19T10:00:00").
 *  Google necesita fecha con zona horaria: se fija la de la clínica. */
function toGoogleDateTime(localISO: string): string {
  const clean = localISO.slice(0, 19);
  return `${clean}${MX_OFFSET}`;
}

export function googleEventBody(appt: AppointmentForGoogle): Record<string, unknown> {
  return {
    summary: `Cita — ${appt.contactName} — ${appt.serviceName}`,
    description:
      `Cita de ${appt.orgName} (Vincimia Agenda).\n` +
      `Paciente: ${appt.contactName}${appt.contactPhone ? ` (${appt.contactPhone})` : ""}\n` +
      `Servicio: ${appt.serviceName}\n` +
      `Doctor: ${appt.doctorName ?? "Sin asignar"}\n` +
      `Estado: ${appt.status}\n` +
      (appt.notes ? `Notas: ${appt.notes}\n` : "") +
      `Ver en la agenda: ${appt.siteUrl}/dashboard`,
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
