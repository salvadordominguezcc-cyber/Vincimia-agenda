// Estado real de WhatsApp — Vincimia Agenda.
// GET /api/whatsapp/status?organization_id=<uuid>
// Nunca devuelve llaves ni tokens: solo dice si el bot está
// configurado en el servidor y si el negocio lo tiene activado.

export const runtime = "edge";

import { whatsappConfigured } from "@/lib/whatsapp";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  const configured = whatsappConfigured();
  if (!organizationId) {
    return Response.json({
      configured,
      connected: false,
      status: "pending",
      message: configured
        ? "WhatsApp configurado en el servidor. Falta organization_id para ver el negocio."
        : "WhatsApp no configurado: faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Cloudflare (ver FASE2_SETUP.md).",
    });
  }
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({
      configured,
      connected: false,
      status: "pending",
      message: "Supabase no configurado en el servidor.",
    });
  }
  const { data: org } = await supabase
    .from("organizations")
    .select("whatsapp_bot_enabled, whatsapp_business_number")
    .eq("id", organizationId)
    .single();
  const enabled = Boolean((org as { whatsapp_bot_enabled?: boolean } | null)?.whatsapp_bot_enabled);
  const connected = configured && enabled;
  return Response.json({
    configured,
    connected,
    status: connected ? "connected" : "pending",
    business_number:
      (org as { whatsapp_business_number?: string | null } | null)?.whatsapp_business_number ?? null,
    message: !configured
      ? "WhatsApp no configurado: faltan el token y el número de WhatsApp Business en Cloudflare (ver FASE2_SETUP.md)."
      : !enabled
        ? "El número está configurado en el servidor, pero el bot está apagado para este negocio. Actívalo en Conectores."
        : "Bot de WhatsApp activo: las confirmaciones se mandan solas al confirmar la cita.",
  });
}
