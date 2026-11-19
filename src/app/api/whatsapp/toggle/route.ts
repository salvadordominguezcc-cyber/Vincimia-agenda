// Activa o apaga el bot de WhatsApp para un negocio.
// POST /api/whatsapp/toggle  { organization_id, enabled }
// Authorization: Bearer <excel_webhook_secret de la organización>
// Solo cambia el interruptor del negocio: no crea el número ni el
// token, que se configuran en Meta y en Cloudflare (ver FASE2_SETUP.md).

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
  const enabled = body.enabled === true;
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
  const { error } = await supabase
    .from("organizations")
    .update({ whatsapp_bot_enabled: enabled })
    .eq("id", organizationId);
  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }
  return Response.json({
    ok: true,
    enabled,
    message: enabled
      ? "Bot de WhatsApp activado para este negocio."
      : "Bot de WhatsApp apagado para este negocio.",
  });
}
