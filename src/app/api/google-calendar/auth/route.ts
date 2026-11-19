// Inicia el OAuth de Google Calendar con la cuenta secundaria.
// GET /api/google-calendar/auth?organization_id=<uuid>
// Redirige a Google con prompt=select_account para elegir la cuenta
// secundaria sin cerrar la sesión principal de Vincimia Agenda.

export const runtime = "edge";

import { googleAuthUrl, googleConfigured } from "@/lib/google";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id") ?? "";
  if (!organizationId) {
    return Response.json(
      { ok: false, message: "Falta organization_id." },
      { status: 400 }
    );
  }
  if (!googleConfigured()) {
    return Response.json(
      {
        ok: false,
        message:
          "Faltan las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Créalas en Google Cloud y guárdalas en Cloudflare (ver FASE2_SETUP.md).",
      },
      { status: 503 }
    );
  }
  const supabase = supabaseServer();
  if (supabase) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .single();
    if (!org) {
      return Response.json(
        { ok: false, message: "Organización no encontrada." },
        { status: 404 }
      );
    }
  }
  return Response.redirect(googleAuthUrl(organizationId));
}
