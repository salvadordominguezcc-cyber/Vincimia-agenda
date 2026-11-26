// Envía una respuesta de la bandeja por el canal de la conversación.
// POST /api/inbox/send
//   { organization_id, channel, recipient, text, conversation_id? }
//   Authorization: Bearer <excel_webhook_secret de la organización>
// channel: "whatsapp" | "facebook" | "instagram".
// recipient: teléfono del paciente (WhatsApp) o PSID/IGSID de Meta
// (Messenger / Instagram). El texto es el que el equipo escribió en
// la bandeja. Nunca simula: sin token del canal responde 503 y
// explica por qué; sin destinatario responde 400. Cuando la nube
// está configurada y viene conversation_id, el mensaje enviado se
// guarda en inbox_messages (sender "equipo", is_draft false); si
// guardarlo falla, el envío ya hecho no se deshace ni se finge.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { loadOrg } from "@/lib/server-appointments";
import { normalizeStoredPhone, sendWhatsAppText } from "@/lib/whatsapp";
import { sendMessengerText } from "@/lib/messenger";
import { sendInstagramText } from "@/lib/instagram";
import type { InboxChannel } from "@/lib/inbox";

const CHANNELS: InboxChannel[] = ["whatsapp", "facebook", "instagram"];

const CHANNEL_LABEL: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  facebook: "Messenger",
  instagram: "Instagram",
};

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
  const channel = String(body.channel ?? "") as InboxChannel;
  const recipient = String(body.recipient ?? "").trim();
  const text = String(body.text ?? "").trim();
  const conversationId = String(body.conversation_id ?? "").trim() || null;
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !CHANNELS.includes(channel) || !recipient || !text || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id, channel, recipient, text o el secreto." },
      { status: 400 }
    );
  }
  const org = await loadOrg(supabase, organizationId);
  if (!org) {
    return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
  }
  const { data: secretOk } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (!secretOk) {
    return Response.json({ ok: false, message: "Secreto inválido." }, { status: 401 });
  }
  // El destinatario depende del canal: teléfono para WhatsApp, id de
  // Meta (PSID/IGSID) para Messenger e Instagram.
  const to =
    channel === "whatsapp" ? (normalizeStoredPhone(recipient) ?? recipient) : recipient;
  let messageId: string;
  try {
    if (channel === "whatsapp") {
      messageId = await sendWhatsAppText(to, text);
    } else if (channel === "facebook") {
      messageId = await sendMessengerText(to, text);
    } else {
      messageId = await sendInstagramText(to, text);
    }
  } catch (e) {
    return Response.json(
      {
        ok: false,
        message: `${CHANNEL_LABEL[channel]} no pudo enviar el mensaje: ${String(e)}`,
      },
      { status: 502 }
    );
  }
  // Guardar el envío en la bandeja de la nube (si la conversación
  // existe). No rompe el envío si la tabla no existe todavía.
  if (conversationId) {
    try {
      await supabase.from("inbox_messages").insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        sender: "equipo",
        text,
        meta_message_id: messageId,
        is_draft: false,
      });
      await supabase
        .from("conversations")
        .update({ last_message: text, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    } catch {
      // La bandeja local ya lo marca como enviado; la nube se
      // sincroniza cuando la migración 006 esté aplicada.
    }
  }
  return Response.json({
    ok: true,
    messageId,
    channel,
    message: `Mensaje enviado por ${CHANNEL_LABEL[channel]}.`,
  });
}
