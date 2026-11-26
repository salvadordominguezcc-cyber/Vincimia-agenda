// WhatsApp Cloud API (Meta) — solo servidor (rutas /api/*). Nunca se
// importa desde un componente del navegador: aquí vive el token.
// Sin WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID configurados, nada de
// esto envía: la página Conectores dice Pendiente y por qué.
// Los mensajes los cobra Meta: los primeros 1,000 mensajes de servicio
// al mes por número son gratis; luego ~$0.16 MXN por mensaje de utilidad
// en México (tarifa vigente desde el 1 de octubre de 2026).

const GRAPH_API = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

/** Normaliza un teléfono mexicano a formato internacional sin "+":
 *  10 dígitos → 52 + número; si ya trae 52, se deja. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return `52${digits.slice(1)}`;
  return digits || null;
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
