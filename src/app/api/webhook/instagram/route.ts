// Webhook de Instagram (Meta) — recibe los mensajes directos de la
// cuenta profesional de Instagram y contesta con el promotor virtual
// de ese canal. Esta es la URL que se pega en Meta:
// https://vincimia-agenda.pages.dev/api/webhook/instagram
//
// GET: verificación de Meta (hub.verify_token debe ser igual a
// META_VERIFY_TOKEN, la misma palabra secreta para los dos webhooks
// de Meta). POST: mensajes entrantes (object "instagram").
// - El mensaje se guarda en la bandeja (tablas de la migración 006),
//   si el negocio está registrado por su meta_instagram_id
//   (migración 009).
// - Si el bot de Instagram está activado para ese negocio y tiene un
//   promotor virtual en ese canal, el bot contesta como ese promotor
//   (mismo cerebro que /api/promotores/chat: Gemini, luego Groq, luego
//   demo marcada "sin conexión a la IA"). Cuando el paciente quiere
//   agendar, la respuesta lleva el link de WhatsApp con su código.
// - Sin token, sin negocio registrado, sin bot activado o sin
//   promotor, no se contesta nada: se responde 200 para que Meta no
//   reintente en bucle. Nunca se simula un envío.

export const runtime = "edge";

import {
  handleMetaIncoming,
  metaConfigured,
  parseMetaMessagingEvents,
  verifyMetaWebhook,
} from "@/lib/meta-channels";

export async function GET(req: Request) {
  return verifyMetaWebhook(req);
}

export async function POST(req: Request) {
  if (!metaConfigured("instagram")) {
    // Meta reintenta solo: se responde 200 para no entrar en bucle,
    // pero no se contesta nada sin configuración.
    return Response.json({ ok: false, message: "Instagram no configurado." });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true });
  }
  // Solo object "instagram" es Instagram; cualquier otro se ignora.
  if (body.object !== "instagram") return Response.json({ ok: true });
  const entries = (body.entry as unknown[] | undefined) ?? [];
  for (const entry of entries) {
    const igId = String((entry as { id?: unknown }).id ?? "");
    if (!igId) continue;
    const events = parseMetaMessagingEvents(entry as Record<string, unknown>);
    for (const event of events) {
      await handleMetaIncoming("instagram", igId, event).catch(
        () => undefined
      );
    }
  }
  return Response.json({ ok: true });
}
