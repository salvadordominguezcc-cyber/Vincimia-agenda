// Bot unificado de Vincimia Agenda — SOLO SERVIDOR.
// Decisión de Salvador (2026-11-26): UN SOLO BOT, SIN promotores
// virtuales. Solo importa el canal (WhatsApp / Messenger / Instagram),
// no qué promotor mandó al paciente. Este es el cerebro de ese bot:
// Gemini primero, luego Groq, con respaldo local marcado como demo
// ("sin conexión a la IA"). Lo usan los webhooks de Messenger e
// Instagram (src/lib/meta-channels.ts). Nunca se importa desde un
// componente del navegador: aquí se leen las llaves.
//
// Reglas de contenido (no se inventa nada):
// - Todo en español. Nada de texto ni voz en inglés.
// - Precios de bienvenida SOLO para clientes de primera vez (Foto 1):
//   Limpieza Profilaxis $250, Limpieza Profunda $350, Resina (caries
//   chica) $250, Reconstrucción con resina $400, Brackets metálicos
//   $400 al mes (lunes). Blanqueamiento, implantes, extracción,
//   coronas, prótesis y endodoncia NO tienen precio: se dice
//   "pregunta por tu precio", nunca se inventa uno.
// - Póliza Particular: sin costo de activación ($0); beneficios:
//   descuentos en tratamientos hasta 50 %, garantías, pagos en
//   abonos en tratamientos mayores y consultas sin costo durante
//   1 año. La valoración sin costo se activa SOLO al asistir y
//   registrarse (como Particular o con otra póliza).

import type { Organization } from "./types";

/** WhatsApp único del consultorio: ahí caen los 3 canales.
 *  wa.me usa el número sin "+" ni espacios. */
export const WHATSAPP_CLINICA = {
  display: "+52 663 328 0701",
  /** Número para wa.me (código de país + número, sin "+"). */
  wa: "526633280701",
} as const;

/** Precios de bienvenida, solo para clientes de primera vez. */
export const WELCOME_PRICES: { name: string; price: number }[] = [
  { name: "Limpieza Profilaxis", price: 250 },
  { name: "Limpieza Profunda", price: 350 },
  { name: "Resina (caries chica)", price: 250 },
  { name: "Reconstrucción con resina", price: 400 },
  { name: "Brackets metálicos (al mes)", price: 400 },
];

export function welcomePricesText(): string {
  return WELCOME_PRICES.map((p) => `${p.name} $${p.price.toLocaleString("es-MX")}`).join(", ");
}

/** URL pública de reserva de la organización. */
export function bookingUrl(org: Organization, siteUrl?: string): string {
  const base =
    siteUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://vincimia-agenda.pages.dev";
  return `${base}/reserva/${org.slug}`;
}

// ---------------------------------------------------------------------------
// Pase a WhatsApp (el bot unificado pasa al paciente al WhatsApp único
// del consultorio, sin código de promotor: solo importa el canal).
// ---------------------------------------------------------------------------

export interface Handoff {
  /** Link wa.me al WhatsApp único, con el mensaje ya escrito. */
  url: string;
  /** Texto prellenado del mensaje. */
  message: string;
}

export function buildHandoff(
  channelLabel: string,
  opts?: { treatment?: string | null; patientName?: string | null }
): Handoff {
  const lines = [
    `Hola, vengo de ${channelLabel}.`,
    "Quiero agendar una cita.",
  ];
  if (opts?.treatment) lines.push(`Tratamiento: ${opts.treatment}.`);
  if (opts?.patientName) lines.push(`Mi nombre es ${opts.patientName}.`);
  const message = lines.join(" ");
  return {
    url: `https://wa.me/${WHATSAPP_CLINICA.wa}?text=${encodeURIComponent(message)}`,
    message,
  };
}

/**
 * Plantilla de información para la cita: lo que se le manda al
 * paciente por WhatsApp al confirmar. No inventa precios ni horarios:
 * los horarios se confirman al reservar en el link.
 */
export function buildInfoCita(
  org: Organization,
  opts?: { treatment?: string | null; patientName?: string | null; siteUrl?: string }
): string {
  const nombre = opts?.patientName ? `Hola ${opts.patientName}, te` : "Te";
  return (
    `${nombre} mando la información para tu cita en ${org.name}:\n` +
    `• Reserva en línea: ${bookingUrl(org, opts?.siteUrl)}\n` +
    `• Tratamiento: ${opts?.treatment ?? "por confirmar"}\n` +
    `• Precios de bienvenida, solo para clientes de primera vez: ${welcomePricesText()}. Otros tratamientos: pregunta por tu precio.\n` +
    `• Póliza particular: sin costo de activación. La valoración sin costo se activa al asistir y registrarte.\n` +
    `• Si el doctor pide anticipo, tu cita queda en pausa hasta confirmar los horarios; todavía no hay cobro en línea.`
  );
}

// ---------------------------------------------------------------------------
// Intención de agendar (detección simple por palabras, sin IA).
// ---------------------------------------------------------------------------

export function detectaIntencionCita(message: string): boolean {
  const m = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return /cita|agend|reserv|quiero ir|apartar|cuando puedo|disponib|me anoto|apuntame|apuntarme/.test(
    m
  );
}

// ---------------------------------------------------------------------------
// Respuestas locales (modo demo, "sin conexión a la IA").
// Se usan cuando no hay llaves de Gemini/Groq, o si la IA falla.
// Van marcadas como demo en la respuesta: nunca se hacen
// pasar por una conexión real.
// ---------------------------------------------------------------------------

export interface DemoReply {
  reply: string;
  wantsBooking: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function demoReply(message: string, orgName: string): DemoReply {
  const m = norm(message);

  if (/^(hola|buenos|buenas|que tal|saludos|hey)\b/.test(m.trim())) {
    return {
      reply:
        `¡Hola! Soy el bot de ${orgName}. ` +
        `¿En qué te puedo ayudar? Te puedo explicar nuestras promociones de bienvenida ` +
        `y cómo obtenerlas con la póliza particular.`,
      wantsBooking: false,
    };
  }
  if (/poliza|membres|afiliar/.test(m)) {
    return {
      reply:
        `Con la póliza particular no pagas costo de activación ($0). ` +
        `Te da descuentos en tratamientos hasta 50%, garantías, pagos en abonos ` +
        `en tratamientos mayores y consultas sin costo durante 1 año. ` +
        `Se activa viniendo al consultorio y registrándote, abriendo tu expediente con nosotros. ` +
        `La valoración sin costo se activa al asistir y registrarte. ` +
        `¿Quieres que te pase a WhatsApp para agendar tu valoración?`,
      wantsBooking: false,
    };
  }
  if (/valoraci|consulta gratis|sin costo|gratis/.test(m)) {
    return {
      reply:
        `La valoración es sin costo y se activa al asistir y registrarte en el consultorio, ` +
        `como póliza particular o con otra póliza. ` +
        `¿Te paso a WhatsApp para agendarla? Ahí te mando la información de tu cita.`,
      wantsBooking: false,
    };
  }
  if (/precio|costo|cuanto|cuesta|limpieza|resina|reconstrucci|endodoncia|blanqueamiento|implante|extracci|corona|protesis|ortodoncia|bracket/.test(m)) {
    return {
      reply:
        `Estos son los precios de bienvenida, solo para clientes de primera vez: ${welcomePricesText()}. ` +
        `Para blanqueamiento, implantes, extracción, coronas, prótesis y endodoncia, pregunta por tu precio. ` +
        `Con la póliza particular no pagas costo de activación y tienes descuentos hasta 50%. ` +
        `¿Quieres agendar? Te paso a WhatsApp.`,
      wantsBooking: false,
    };
  }
  if (/gracias/.test(m)) {
    return {
      reply:
        `¡De nada! Aquí estoy para lo que necesites. Cuando quieras agendar, ` +
        `te paso a WhatsApp y te mandamos la información de tu cita.`,
      wantsBooking: false,
    };
  }
  if (detectaIntencionCita(message)) {
    return {
      reply:
        `¡Perfecto! Para agendarte necesito tu nombre y qué tratamiento quieres. ` +
        `Te paso al WhatsApp del consultorio (${WHATSAPP_CLINICA.display}) para mandarte ` +
        `la información de tu cita y tu link de reserva.`,
      wantsBooking: true,
    };
  }
  return {
    reply:
      `¡Hola! Soy el bot de ${orgName}. ` +
      `Te puedo explicar las promociones de bienvenida y cómo obtenerlas con la póliza particular, ` +
      `o ayudarte a agendar tu valoración sin costo. ¿Qué tratamiento te interesa?`,
    wantsBooking: false,
  };
}

// ---------------------------------------------------------------------------
// Cerebro de IA (Gemini primero, luego Groq). Sin llaves o si la IA
// falla, el llamador usa las respuestas locales y marca modo demo.
// ---------------------------------------------------------------------------

export type AiModo = "ia-gemini" | "ia-groq" | "demo";

/** ¿Hay al menos una llave de IA configurada en el servidor? */
export function aiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim()
  );
}

function systemPrompt(orgName: string): string {
  return [
    `Eres el bot de ${orgName} (Dentiplus Mexicali - Clínica Dental).`,
    "Hablas SOLO en español. Nada de texto en inglés.",
    "Tus respuestas son cortas (máximo 3 frases) y siempre terminan con una pregunta o con la invitación a seguir por WhatsApp para agendar.",
    `Precios de bienvenida, SOLO para clientes de primera vez: ${welcomePricesText()}.`,
    "Para cualquier otro tratamiento (blanqueamiento, implantes, extracción, coronas, prótesis, endodoncia, ortodoncia) NO inventes precio: di 'pregunta por tu precio'.",
    "Póliza particular: sin costo de activación ($0); beneficios: descuentos en tratamientos hasta 50%, garantías, pagos en abonos en tratamientos mayores y consultas sin costo durante 1 año.",
    "La valoración sin costo se activa SOLO cuando el paciente asiste y se registra en el consultorio (como póliza particular o con otra póliza). Nunca prometas la valoración gratis sin ese registro.",
    "Si el paciente quiere agendar, pídele su nombre y el tratamiento, y dile que lo pasarás al WhatsApp del consultorio para mandarle la información de su cita.",
    "Nunca inventes horarios, doctores, direcciones ni precios.",
  ].join("\n");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 20000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryGemini(
  orgName: string,
  message: string
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt(orgName) }],
          },
          contents: [{ parts: [{ text: message }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 300 },
        }),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

async function tryGroq(
  orgName: string,
  message: string
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.6,
          max_tokens: 300,
          messages: [
            { role: "system", content: systemPrompt(orgName) },
            { role: "user", content: message },
          ],
        }),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Responde con IA. Devuelve null si no hay llaves o si la IA falló:
 * el llamador cae a la respuesta local (modo demo).
 */
export async function replyWithAI(
  orgName: string,
  message: string
): Promise<{ reply: string; modo: Exclude<AiModo, "demo"> } | null> {
  const gemini = await tryGemini(orgName, message);
  if (gemini) return { reply: gemini, modo: "ia-gemini" };
  const groq = await tryGroq(orgName, message);
  if (groq) return { reply: groq, modo: "ia-groq" };
  return null;
}
