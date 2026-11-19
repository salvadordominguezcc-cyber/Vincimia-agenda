// Desconecta Google Calendar: borra el token guardado y apaga la
// sincronización. Las citas ya creadas en Google no se borran.
// POST /api/google-calendar/disconnect  { organization_id }
// Authorization: Bearer <excel_webhook_secret de la organización>

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";

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
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !secret) {
    return Response.json({ ok: false, message: "Faltan organization_id o el secreto." }, { status: 400 });
  }
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (!org) {
    return Response.json({ ok: false, message: "Secreto inválido u organización no encontrada." }, { status: 401 });
  }
  await supabase
    .from("organizations")
    .update({
      google_refresh_token: null,
      connected_google_email: null,
      google_calendar_sync: false,
    })
    .eq("id", organizationId);
  return Response.json({ ok: true, message: "Google Calendar desconectado." });
}
