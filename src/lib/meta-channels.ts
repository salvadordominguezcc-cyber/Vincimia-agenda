// Canales de Meta: Messenger (Facebook) e Instagram — SOLO SERVIDOR.
// Nunca se importa desde un componente del navegador: aquí viven los
// tokens. Espejo del patrón de WhatsApp Fase 2 (src/lib/whatsapp.ts):
// misma app de Meta, mismos principios, otro producto.
// - Messenger: API de Messenger, token META_PAGE_ACCESS_TOKEN (token
//   de la página de Facebook). El webhook recibe object "page".
// - Instagram: API de mensajes de Instagram, token META_INSTAGRAM_TOKEN
//   (token de la página con el permiso instagram_messaging, vinculado
//   a la cuenta profesional de Instagram). El webhook recibe object
//   "instagram". Los dos envían por POST /me/messages de Graph API.
// - La verificación de los dos webhooks usa la misma palabra secreta
//   META_VERIFY_TOKEN (se pega igual en Meta y en Cloudflare).
// Sin token, nada se envía: las rutas responden 503/200 explicando
// qué falta, y Conectores dice Pendiente y por qué. Los tokens NUNCA
// se guardan en la base de datos: viven en Cloudflare como variables
// de entorno (ver .env.example y PROMOTORES_VIRTUALES.md).
//
// Valor del canal en el código y en la base de datos:
// "facebook" = Messenger de la fanpage (mismo valor que
// VirtualPromoterChannel e InboxChannel, migraciones 006 y 008);
// "instagram" = Instagram. No se inventa un valor "messenger" nuevo
// para no romper los datos y las reglas CHECK que ya existen.
//
// El bot que contesta es el mismo cerebro de los promotores virtuales
// (Gemini primero, luego Groq, con respaldo demo marcado "sin
// conexión a la IA" — src/lib/virtual-promoters-server.ts). El pase a
// WhatsApp único (+52 686 338 6047) no cambia: cuando el paciente
// quiere agendar, el bot le pasa el link wa.me con su código.

import { supabaseServer } from "./supabase";
import type { Promoter } from "./types";
import {
  buildHandoff,
  demoReply,
  detectaIntencionCita,
} from "./virtual-promoters";
import { replyWithAI } from "./virtual-promoters-server";

const GRAPH_API = "https://graph.facebook.com/v21.0";

/** Canales de Meta con webhook propio. */
export type MetaChannel = "facebook" | "instagram";

export const META_CHANNEL_LABEL: Record<MetaChannel, string> = {
  facebook: "Messenger",
  instagram: "Instagram",
};

/** Token de la página (Messenger) o de Instagram, según el canal. */
export function metaToken(channel: MetaChannel): string | null {
  return channel === "facebook"
    ? (process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? null) || null
    : (process.env.META_INSTAGRAM_TOKEN?.trim() ?? null) || null;
}

export function metaConfigured(channel: MetaChannel): boolean {
  return Boolean(metaToken(channel));
}

/** Palabra secreta compartida para verificar los dos webhooks. */
export function metaVerifyToken(): string | null {
  return process.env.META_VERIFY_TOKEN?.trim() || null;
}

/** Por qué un canal está pendiente, en palabras normales. */
export function metaPendingReason(channel: MetaChannel): string {
  const tokenName =
    channel === "facebook" ? "META_PAGE_ACCESS_TOKEN" : "META_INSTAGRAM_TOKEN";
  return (
    `${META_CHANNEL_LABEL[channel]} no configurado: falta ${tokenName} ` +
    `y META_VERIFY_TOKEN en Cloudflare (ver PROMOTORES_VIRTUALES.md).`
  );
}

/** Estado real de los dos canales, sin exponer ningún token. */
export function metaStatus(): Record<
  MetaChannel,
  { configured: boolean; message: string }
> {
  return {
    facebook: {
      configured: metaConfigured("facebook"),
      message: metaConfigured("facebook")
        ? "Messenger configurado en el servidor. Falta autorizar la página en Meta y verificar el webhook."
        : metaPendingReason("facebook"),
    },
    instagram: {
      configured: metaConfigured("instagram"),
      message: metaConfigured("instagram")
        ? "Instagram configurado en el servidor. Falta autorizar la cuenta en Meta y verificar el webhook."
        : metaPendingReason("instagram"),
    },
  };
}

// ---------------------------------------------------------------------------
// Verificación del webhook (GET de Meta)
// ---------------------------------------------------------------------------

/** Responde al reto de verificación de Meta. 403 si el token no coincide. */
export function verifyMetaWebhook(req: Request): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = metaVerifyToken();
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge, { status: 200 });
  }
  return Response.json(
    { ok: false, message: "Token de verificación incorrecto." },
    { status: 403 }
  );
}

// ---------------------------------------------------------------------------
// Lectura de eventos entrantes (POST de Meta)
// ---------------------------------------------------------------------------

export interface MetaIncomingEvent {
  /** PSID (Messenger) o IGSID (Instagram) de quien escribe. */
  senderId: string;
  /** Texto del mensaje, o el payload del botón (postback). */
  text: string;
  /** Id del mensaje en Meta (para guardarlo en inbox_messages). */
  mid: string | null;
}

interface MessagingEntry {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
  postback?: { payload?: string };
}

/** Saca los mensajes de texto de una entrada de webhook de Messenger
 *  o Instagram (entry.messaging). Ignora los ecos de nuestros propios
 *  mensajes y los adjuntos sin texto. Un postback (botón "Empezar")
 *  se trata como un "Hola". */
export function parseMetaMessagingEvents(
  entry: Record<string, unknown>
): MetaIncomingEvent[] {
  const out: MetaIncomingEvent[] = [];
  const messaging = ((entry as { messaging?: unknown[] }).messaging ??
    []) as MessagingEntry[];
  for (const ev of messaging) {
    const senderId = ev.sender?.id;
    if (!senderId) continue;
    if (ev.message?.is_echo) continue;
    const text =
      ev.message?.text?.trim() ||
      (ev.postback?.payload === "GET_STARTED"
        ? "Hola"
        : ev.postback?.payload?.trim()) ||
      "";
    if (!text) continue;
    out.push({ senderId, text, mid: ev.message?.mid ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Envío por Graph API (POST /me/messages)
// ---------------------------------------------------------------------------

interface GraphSendResponse {
  message_id?: string;
  error?: { message?: string; code?: number };
}

async function graphSend(
  channel: MetaChannel,
  recipientId: string,
  text: string
): Promise<string> {
  const token = metaToken(channel);
  if (!token) throw new Error(metaPendingReason(channel));
  const res = await fetch(`${GRAPH_API}/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as GraphSendResponse;
  if (!res.ok || !json.message_id) {
    throw new Error(
      json.error?.message ??
        `${META_CHANNEL_LABEL[channel]}: HTTP ${res.status}`
    );
  }
  return json.message_id;
}

// ---------------------------------------------------------------------------
// Respuesta automática con el promotor virtual del canal
// ---------------------------------------------------------------------------

interface OrgMetaRow {
  id: string;
  name: string;
  slug: string;
  messenger_bot_enabled?: boolean;
  instagram_bot_enabled?: boolean;
}

export interface MetaHandleResult {
  ok: boolean;
  /** El mensaje quedó guardado en la bandeja (si las tablas existen). */
  recorded: boolean;
  /** El bot contestó por el canal. */
  replied: boolean;
  /** "ia-gemini" | "ia-groq" | "demo" cuando se contestó. */
  modo?: "ia-gemini" | "ia-groq" | "demo";
  reason: string;
}

/** Busca la organización por el id de su página (Messenger) o de su
 *  cuenta de Instagram. Sin la migración 009 las columnas no existen
 *  y la consulta falla: se devuelve null sin romper el webhook. */
async function findOrgByMetaId(
  channel: MetaChannel,
  pageId: string
): Promise<OrgMetaRow | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;
  try {
    const column =
      channel === "facebook" ? "meta_page_id" : "meta_instagram_id";
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, messenger_bot_enabled, instagram_bot_enabled")
      .eq(column, pageId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as OrgMetaRow;
  } catch {
    return null;
  }
}

/** Promotor virtual activo del negocio para ese canal (el primero).
 *  Sin la migración 008 las columnas no existen: se devuelve null. */
async function findVirtualPromoter(
  organizationId: string,
  channel: MetaChannel
): Promise<Promoter | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("promoters")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_virtual", true)
      .eq("channel", channel)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as Promoter;
  } catch {
    return null;
  }
}

/** Guarda el mensaje que llegó en la bandeja (tablas de la migración
 *  006). Si las tablas no existen todavía, no se guarda nada y no se
 *  rompe nada: el webhook sigue contestando. */
async function recordInboxMessage(
  orgId: string,
  channel: MetaChannel,
  senderId: string,
  text: string,
  mid: string | null
): Promise<boolean> {
  const supabase = supabaseServer();
  if (!supabase) return false;
  try {
    const label = META_CHANNEL_LABEL[channel];
    const shortId = senderId.slice(-4);
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", orgId)
      .eq("channel", channel)
      .eq("meta_sender_id", senderId)
      .limit(1)
      .maybeSingle();
    let conversationId = (existing as { id?: string } | null)?.id ?? null;
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          organization_id: orgId,
          contact_name: `${label} ••${shortId}`,
          contact_phone: null,
          channel,
          status: "abierta",
          last_message: text,
          meta_sender_id: senderId,
        })
        .select("id")
        .single();
      if (error || !created) return false;
      conversationId = (created as { id: string }).id;
    } else {
      await supabase
        .from("conversations")
        .update({ last_message: text, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
    const { error } = await supabase.from("inbox_messages").insert({
      organization_id: orgId,
      conversation_id: conversationId,
      sender: "paciente",
      text,
      meta_message_id: mid,
      is_draft: false,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Registra la charla en el embudo del promotor virtual (tabla de la
 *  migración 008). Si la tabla no existe, no pasa nada. */
async function recordPromoterConversation(
  orgId: string,
  promoter: Promoter,
  channel: MetaChannel,
  senderId: string,
  treatment: string | null,
  wantsBooking: boolean
): Promise<void> {
  const supabase = supabaseServer();
  if (!supabase) return;
  try {
    const { data: existing } = await supabase
      .from("promoter_conversations")
      .select("id")
      .eq("promoter_id", promoter.id)
      .eq("meta_sender_id", senderId)
      .limit(1)
      .maybeSingle();
    const row = {
      organization_id: orgId,
      promoter_id: promoter.id,
      channel,
      patient_phone: null,
      treatment,
      status: wantsBooking ? "en_whatsapp" : "conversando",
      meta_sender_id: senderId,
      updated_at: new Date().toISOString(),
    };
    if ((existing as { id?: string } | null)?.id) {
      await supabase
        .from("promoter_conversations")
        .update(row)
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase.from("promoter_conversations").insert(row);
    }
  } catch {
    // Sin la migración 008/009, la charla no se registra: no se rompe nada.
  }
}

/**
 * Atiende un mensaje que llegó por Messenger o Instagram.
 * 1. Resuelve el negocio por el id de la página/cuenta (migración 009).
 * 2. Guarda el mensaje en la bandeja (migración 006), si las tablas existen.
 * 3. Si el bot del canal está activado para ese negocio y tiene un
 *    promotor virtual en ese canal, contesta con el mismo cerebro de
 *    /api/promotores/chat (Gemini, luego Groq, luego demo marcada).
 *    Cuando el paciente quiere agendar, la respuesta lleva el link de
 *    WhatsApp con su código de promotor.
 * Sin token, sin negocio, sin bot activado o sin promotor, no se
 * contesta nada: se responde 200 para que Meta no reintente en bucle.
 */
export async function handleMetaIncoming(
  channel: MetaChannel,
  pageId: string,
  event: MetaIncomingEvent
): Promise<MetaHandleResult> {
  if (!metaConfigured(channel)) {
    return {
      ok: false,
      recorded: false,
      replied: false,
      reason: metaPendingReason(channel),
    };
  }
  const org = await findOrgByMetaId(channel, pageId);
  if (!org) {
    return {
      ok: false,
      recorded: false,
      replied: false,
      reason:
        `No hay un negocio con esa ${channel === "facebook" ? "página de Facebook" : "cuenta de Instagram"} ` +
        `registrada (migración 009: meta_page_id / meta_instagram_id).`,
    };
  }
  const recorded = await recordInboxMessage(
    org.id,
    channel,
    event.senderId,
    event.text,
    event.mid
  );
  const botEnabled =
    channel === "facebook"
      ? org.messenger_bot_enabled === true
      : org.instagram_bot_enabled === true;
  if (!botEnabled) {
    return {
      ok: true,
      recorded,
      replied: false,
      reason: `El bot de ${META_CHANNEL_LABEL[channel]} está apagado para este negocio. El mensaje quedó en la bandeja.`,
    };
  }
  const promoter = await findVirtualPromoter(org.id, channel);
  if (!promoter) {
    return {
      ok: true,
      recorded,
      replied: false,
      reason: `Este negocio no tiene un promotor virtual activo en ${META_CHANNEL_LABEL[channel]}. El mensaje quedó en la bandeja.`,
    };
  }
  const ai = await replyWithAI(promoter, org.name, event.text);
  const demo = demoReply(promoter, event.text, org.name);
  const reply = ai?.reply ?? demo.reply;
  const modo = ai?.modo ?? "demo";
  const wantsBooking =
    detectaIntencionCita(event.text) || demo.wantsBooking;
  const treatment =
    /limpieza/i.test(event.text)
      ? "Limpieza"
      : /resina/i.test(event.text)
        ? "Resina"
        : /reconstrucci/i.test(event.text)
          ? "Reconstrucción"
          : /endodoncia/i.test(event.text)
            ? "Endodoncia"
            : null;
  // Cuando quiere agendar, la respuesta lleva el pase a WhatsApp con
  // su código (mismo pase que /api/promotores/chat).
  const textToSend = wantsBooking
    ? `${reply}\n\nPara agendar, escríbenos por WhatsApp: ${buildHandoff(promoter, { treatment }).url}`
    : reply;
  try {
    await graphSend(channel, event.senderId, textToSend);
  } catch (e) {
    return {
      ok: false,
      recorded,
      replied: false,
      reason: `${META_CHANNEL_LABEL[channel]} no pudo enviar el mensaje: ${String(e)}`,
    };
  }
  // La plantilla de información para la cita se manda por WhatsApp
  // cuando el paciente llega ahí (buildInfoCita en
  // src/lib/virtual-promoters.ts); aquí solo se guarda el embudo.
  await recordPromoterConversation(
    org.id,
    promoter,
    channel,
    event.senderId,
    treatment,
    wantsBooking
  );
  return {
    ok: true,
    recorded,
    replied: true,
    modo,
    reason: `Contestado por ${promoter.name} (${modo}).`,
  };
}
