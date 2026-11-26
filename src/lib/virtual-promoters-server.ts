// Cerebro de IA de los promotores virtuales — SOLO SERVIDOR.
// Lo importa únicamente la ruta /api/promotores/chat. Nunca se importa
// desde un componente del navegador: aquí se leen las llaves.
//
// Orden: Gemini (GEMINI_API_KEY) y luego Groq (GROQ_API_KEY). Sin
// ninguna de las dos, o si la IA falla, el llamador usa las respuestas
// locales de src/lib/virtual-promoters.ts y marca el modo como demo
// ("sin conexión a la IA"). Nunca se finge una conexión real.

import type { Promoter } from "./types";
import { welcomePricesText } from "./virtual-promoters";

export type AiModo = "ia-gemini" | "ia-groq" | "demo";

/** ¿Hay al menos una llave de IA configurada en el servidor? */
export function aiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim()
  );
}

function systemPrompt(promoter: Promoter, orgName: string): string {
  return [
    `Eres ${promoter.name}, promotor virtual del consultorio ${orgName}.`,
    `Tu personalidad: ${promoter.persona ?? "cálido y directo"}.`,
    "Hablas SOLO en español. Nada de texto en inglés.",
    "Tus respuestas son cortas (máximo 3 frases) y siempre terminan con una pregunta o con la invitación a seguir por WhatsApp para agendar.",
    `Precios de bienvenida, SOLO para clientes de primera vez: ${welcomePricesText()}.`,
    "Para cualquier otro tratamiento (blanqueamiento, implantes, extracción, coronas, prótesis, ortodoncia) NO inventes precio: di 'pregunta por tu precio'.",
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
  promoter: Promoter,
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
            parts: [{ text: systemPrompt(promoter, orgName) }],
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
  promoter: Promoter,
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
            { role: "system", content: systemPrompt(promoter, orgName) },
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
 * Responde como el promotor con IA. Devuelve null si no hay llaves o
 * si la IA falló: el llamador cae a la respuesta local (modo demo).
 */
export async function replyWithAI(
  promoter: Promoter,
  orgName: string,
  message: string
): Promise<{ reply: string; modo: Exclude<AiModo, "demo"> } | null> {
  const gemini = await tryGemini(promoter, orgName, message);
  if (gemini) return { reply: gemini, modo: "ia-gemini" };
  const groq = await tryGroq(promoter, orgName, message);
  if (groq) return { reply: groq, modo: "ia-groq" };
  return null;
}
