// Mensajes de Instagram (Meta) — solo servidor (rutas /api/*). Nunca
// se importa desde un componente del navegador: aquí vive el token.
// Espejo de src/lib/whatsapp.ts: mismo Graph API (v21.0), mismo
// patrón de "sin token, no se envía". El envío real es POST
// /me/messages con el token de Instagram (META_INSTAGRAM_TOKEN, el
// token de la página con el permiso instagram_messaging, vinculado a
// la cuenta profesional de Instagram del negocio).
// Sin ese token, Conectores dice Pendiente y por qué.
// Ventana de Meta: el texto libre solo llega si la persona escribió
// en las últimas 24 horas; fuera de esa ventana hace falta la
// etiqueta de agente humano (human agent tag), que todavía no está
// implementada — el envío falla con el error de Meta, sin simularse.

import {
  metaConfigured,
  metaPendingReason,
  metaToken,
  metaVerifyToken,
} from "./meta-channels";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export function instagramConfigured(): boolean {
  return metaConfigured("instagram");
}

export function instagramVerifyToken(): string | null {
  return metaVerifyToken();
}

export function instagramPendingReason(): string {
  return metaPendingReason("instagram");
}

interface GraphResponse {
  message_id?: string;
  error?: { message?: string; code?: number };
}

/** Mensaje de texto libre a una persona por Instagram. recipientId es
 *  el IGSID (id de la persona en Instagram). Devuelve el id del
 *  mensaje en Meta. Sin token, lanza el motivo pendiente. */
export async function sendInstagramText(
  recipientId: string,
  text: string
): Promise<string> {
  const token = metaToken("instagram");
  if (!token) throw new Error(metaPendingReason("instagram"));
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
  const json = (await res.json().catch(() => ({}))) as GraphResponse;
  if (!res.ok || !json.message_id) {
    throw new Error(
      json.error?.message ?? `Instagram: HTTP ${res.status}`
    );
  }
  return json.message_id;
}
