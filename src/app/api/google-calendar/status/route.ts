// Estado real de Google Calendar — Vincimia Agenda.
// No hay OAuth conectado en el MVP: responde siempre "pending" hasta que
// se configure el proyecto de Google Cloud y se guarde un refresh_token.
// Esta ruta existe para que el panel no invente una conexión.

export const runtime = "edge";

import { googleConfigured } from "@/lib/google";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  const supabase = supabaseServer();
  if (!supabase || !organizationId) {
    return Response.json({
      connected: false,
      status: "pending",
      configured: googleConfigured(),
      connected_google_email: null,
      last_calendar_sync: null,
      message: googleConfigured()
        ? "Google Calendar no conectado. Falta el OAuth con select_account y el refresh_token (ver /dashboard/conectores)."
        : "Faltan las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) en Cloudflare (ver FASE2_SETUP.md).",
    });
  }
  const { data: org } = await supabase
    .from("organizations")
    .select("google_calendar_sync, connected_google_email, last_calendar_sync")
    .eq("id", organizationId)
    .single();
  return Response.json({
    connected: Boolean(org?.google_calendar_sync),
    status: org?.google_calendar_sync ? "connected" : "pending",
    configured: googleConfigured(),
    connected_google_email: org?.connected_google_email ?? null,
    last_calendar_sync: org?.last_calendar_sync ?? null,
    message: org?.google_calendar_sync
      ? "Sincronización activa."
      : googleConfigured()
        ? "Google Calendar no conectado."
        : "Faltan las credenciales de Google en Cloudflare (ver FASE2_SETUP.md).",
  });
}
