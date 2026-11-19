// Callback del OAuth de Google Calendar.
// GET /api/google-calendar/callback?code=...&state=<organization_id>
// Canjea el código por tokens, guarda el refresh_token en la
// organización y marca google_calendar_sync = true. El refresh_token
// nunca sale de la base de datos: solo lo usa el servidor para renovar
// la sesión de Google. Si Google no devolvió refresh_token (ya había
// uno concedido antes), se conserva el guardado.

export const runtime = "edge";

import {
  exchangeGoogleCode,
  googleAccountEmail,
  siteUrl,
} from "@/lib/google";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const organizationId = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");
  const conectores = `${siteUrl()}/dashboard/conectores`;
  if (error || !code || !organizationId) {
    return Response.redirect(
      `${conectores}?google=error&message=${encodeURIComponent(
        error === "access_denied"
          ? "Se canceló el permiso en Google. Vuelve a intentarlo y elige la cuenta secundaria."
          : "Google no devolvió el código de autorización."
      )}`
    );
  }
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.redirect(
      `${conectores}?google=error&message=${encodeURIComponent(
        "Supabase no configurado en el servidor."
      )}`
    );
  }
  let tokens;
  try {
    tokens = await exchangeGoogleCode(code);
  } catch (e) {
    return Response.redirect(
      `${conectores}?google=error&message=${encodeURIComponent(
        `No se pudo completar la conexión con Google: ${String(e)}`
      )}`
    );
  }
  const email = await googleAccountEmail(tokens.access_token);
  const { data: org } = await supabase
    .from("organizations")
    .select("google_refresh_token")
    .eq("id", organizationId)
    .single();
  const refreshToken = tokens.refresh_token ?? (org as { google_refresh_token?: string } | null)?.google_refresh_token ?? null;
  if (!refreshToken) {
    return Response.redirect(
      `${conectores}?google=error&message=${encodeURIComponent(
        "Google no devolvió el permiso para sincronizar sin que entres cada vez. En Google Cloud, quita el acceso de Vincimia Agenda a esa cuenta y vuelve a conectar."
      )}`
    );
  }
  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      google_refresh_token: refreshToken,
      connected_google_email: email,
      google_calendar_sync: true,
      last_calendar_sync: new Date().toISOString(),
    })
    .eq("id", organizationId);
  if (updateError) {
    return Response.redirect(
      `${conectores}?google=error&message=${encodeURIComponent(
        `Se conectó con Google pero no se pudo guardar: ${updateError.message}`
      )}`
    );
  }
  return Response.redirect(`${conectores}?google=connected`);
}
