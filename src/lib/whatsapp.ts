// WhatsApp Cloud API (Meta) — solo servidor (rutas /api/*). Nunca se
// importa desde un componente del navegador: aquí vive el token.
// Sin WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID configurados, nada de
// esto envía: la página Conectores dice Pendiente y por qué.
// Los mensajes los cobra Meta: los primeros 1,000 mensajes de servicio
// al mes por número son gratis; luego ~$0.16 MXN por mensaje de utilidad
// en México (tarifa vigente desde el 1 de octubre de 2026).

import {
  detectPhoneCountry,
  normalizePhone,
  normalizeStoredPhone,
  type PhoneCountry,
} from "./phone";

// La normalización con país vive en ./phone (sin secretos, se puede
// importar desde el navegador); aquí se reexporta para que las rutas
// que ya importaban desde este archivo sigan funcionando igual.
export {
  detectPhoneCountry,
  normalizePhone,
  normalizeStoredPhone,
  type PhoneCountry,
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

export function whatsappVerifyToken(): string | null {
  return process.env.WHATSAPP_VERIFY_TOKEN ?? null;
}

interface GraphResponse {
  messages?: { id: string }[];
  error?: { message?: string; code?: number };
}

async function graphPost(body: Record<string, unknown>): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID as string;
  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as GraphResponse;
  if (!res.ok || !json.messages?.[0]?.id) {
    throw new Error(
      json.error?.message ?? `WhatsApp Cloud API: HTTP ${res.status}`
    );
  }
  return json.messages[0].id;
}

/** Mensaje de texto libre. Solo llega si el paciente escribió en las
 *  últimas 24 horas (ventana de servicio de WhatsApp); fuera de esa
 *  ventana hay que usar una plantilla aprobada. */
export async function sendWhatsAppText(to: string, body: string): Promise<string> {
  return graphPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

/** Plantilla aprobada en Meta (WHATSAPP_TEMPLATE_NAME). Sirve también
 *  fuera de la ventana de 24 horas. Los parámetros van en el cuerpo,
 *  en orden: nombre, servicio, fecha, hora. */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[]
): Promise<string> {
  return graphPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "es_MX" },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  });
}

/** Envía la confirmación: plantilla si está configurada, texto libre
 *  si no. Devuelve el id del mensaje de Meta. */
export async function sendWhatsAppConfirmation(
  to: string,
  text: string,
  templateParams: string[]
): Promise<{ messageId: string; via: "template" | "text" }> {
  const template = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
  if (template) {
    const id = await sendWhatsAppTemplate(to, template, templateParams);
    return { messageId: id, via: "template" };
  }
  const id = await sendWhatsAppText(to, text);
  return { messageId: id, via: "text" };
}

/** Nombre de la plantilla del link de reserva con botón
 *  "Agendar cita" (categoría Utilidad, idioma es_MX, 1 hueco: nombre
 *  del paciente). El botón de URL se configura en Meta al crear la
 *  plantilla (URL fija del link de reserva); la llamada es la misma
 *  que cualquier plantilla, no hace falta ningún componente de botón. */
export function linkReservaTemplateName(): string {
  return process.env.WHATSAPP_LINK_TEMPLATE_NAME?.trim() || "link_reserva";
}

/** Manda el link de reserva como botón dentro de la plantilla
 *  link_reserva. Llega siempre, también fuera de la ventana de
 *  24 horas. Si la plantilla todavía no existe o no está aprobada
 *  en Meta, manda el texto libre con el link (fallback) para que el
 *  paciente igual reciba cómo agendar. Devuelve el id del mensaje
 *  de Meta y por qué vía llegó. */
export async function sendBookingLink(
  to: string,
  opts: { firstName?: string | null; fallbackText: string }
): Promise<{ messageId: string; via: "template" | "text" }> {
  const firstName = opts.firstName?.trim() || "amigo";
  try {
    const id = await sendWhatsAppTemplate(
      to,
      linkReservaTemplateName(),
      [firstName]
    );
    return { messageId: id, via: "template" };
  } catch {
    const id = await sendWhatsAppText(to, opts.fallbackText);
    return { messageId: id, via: "text" };
  }
}

/** Envía la solicitud de reseña al completar una cita.
 *  Plantilla opcional WHATSAPP_REVIEW_TEMPLATE_NAME (categoría Utility,
 *  idioma es_MX, 3 huecos en orden: nombre del paciente, nombre del
 *  negocio, link de calificación). Sin plantilla, texto libre — que solo
 *  llega si el paciente escribió en las últimas 24 horas. */
export async function sendWhatsAppReview(
  to: string,
  text: string,
  templateParams: string[]
): Promise<{ messageId: string; via: "template" | "text" }> {
  const template = process.env.WHATSAPP_REVIEW_TEMPLATE_NAME?.trim();
  if (template) {
    const id = await sendWhatsAppTemplate(to, template, templateParams);
    return { messageId: id, via: "template" };
  }
  const id = await sendWhatsAppText(to, text);
  return { messageId: id, via: "text" };
}
