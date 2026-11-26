// Webhook de Messenger (Meta) — recibe los mensajes de la fanpage
// de Facebook y contesta con el bot unificado. Esta
// es la URL que se pega en Meta:
// https://vincimia-agenda.pages.dev/api/webhook/messenger
//
// GET: verificación de Meta (hub.verify_token debe ser igual a
// META_VERIFY_TOKEN, la misma palabra secreta para los dos webhooks
// de Meta). POST: mensajes entrantes (object "page").
// - El mensaje se guarda en la bandeja (tablas de la migración 006),
//   si el negocio está registrado por su meta_page_id (migración 009).
// - Si el bot de Messenger está activado para ese negocio, el bot
//   unificado contesta (cerebro en src/lib/unified-bot.ts: Gemini,
//   luego Groq, luego demo marcada "sin conexión a la IA"). Cuando el
//   paciente quiere agendar, la respuesta lleva el link de WhatsApp
//   del consultorio.
// - Sin token, sin negocio registrado o sin bot activado, no se
//   contesta nada: se responde 200 para que Meta no reintente en
//   bucle. Nunca se simula un envío.

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
  if (!metaConfigured("facebook")) {
    // Meta reintenta solo: se responde 200 para no entrar en bucle,
    // pero no se contesta nada sin configuración.
    return Response.json({ ok: false, message: "Messenger no configurado." });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true });
  }
  // Solo object "page" es Messenger; cualquier otro se ignora.
  if (body.object !== "page") return Response.json({ ok: true });
  const entries = (body.entry as unknown[] | undefined) ?? [];
  for (const entry of entries) {
    const pageId = String((entry as { id?: unknown }).id ?? "");
    if (!pageId) continue;
    const events = parseMetaMessagingEvents(entry as Record<string, unknown>);
    for (const event of events) {
      await handleMetaIncoming("facebook", pageId, event).catch(
        () => undefined
      );
    }
  }
  return Response.json({ ok: true });
}
