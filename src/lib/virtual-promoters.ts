// Promotores virtuales — lógica compartida (navegador y servidor).
// No importa nada de servidor: este archivo solo tiene funciones
// puras y los 3 promotores por defecto. El cerebro de IA vive en
// src/lib/virtual-promoters-server.ts y solo lo usa la ruta de API.
//
// Reglas de contenido (no se inventa nada):
// - Todo en español. Nada de texto ni voz en inglés.
// - Precios de bienvenida SOLO para clientes de primera vez:
//   limpieza $350, resina chica $250, reconstrucción $400,
//   endodoncia $2,200. Cualquier otro tratamiento dice
//   "pregunta por tu precio", nunca se inventa un precio.
// - Póliza Particular: sin costo de activación ($0); beneficios:
//   descuentos en tratamientos hasta 50 %, garantías, pagos en
//   abonos en tratamientos mayores y consultas sin costo durante
//   1 año. La valoración sin costo se activa SOLO al asistir y
//   registrarse (como Particular o con otra póliza).
// - Ningún nombre de marca de clínica va fijo en las personas ni en
//   los mensajes: se usa el nombre de la organización del almacén.

import type {
  Organization,
  Promoter,
  VirtualPromoterChannel,
} from "./types";
import { CHANNEL_LABEL } from "./types";

/** WhatsApp único del consultorio: ahí caen los 3 promotores.
 *  wa.me usa el número sin "+" ni espacios. */
export const WHATSAPP_CLINICA = {
  display: "+52 686 338 6047",
  /** Número para wa.me (código de país + número, sin "+"). */
  wa: "526863386047",
} as const;

/** Precios de bienvenida, solo para clientes de primera vez. */
export const WELCOME_PRICES: { name: string; price: number }[] = [
  { name: "Limpieza", price: 350 },
  { name: "Resina chica", price: 250 },
  { name: "Reconstrucción", price: 400 },
  { name: "Endodoncia", price: 2200 },
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
// 3 promotores virtuales por defecto (nombres y estilos de ejemplo:
// el dueño los cambia en Dashboard → Promotores). Un promotor por
// fanpage: dos en Facebook y uno en Instagram; los 3 pasan al mismo
// WhatsApp. El canal es editable desde el panel.
// ---------------------------------------------------------------------------

export interface VirtualPromoterDef {
  id: string;
  name: string;
  code: string;
  channel: VirtualPromoterChannel;
  persona: string;
  commission_rate: number;
}

export const DEFAULT_VIRTUAL_PROMOTERS: VirtualPromoterDef[] = [
  {
    id: "vprom-1",
    name: "Promotor virtual 1",
    code: "PROMO1",
    channel: "facebook",
    persona:
      "Eres el promotor virtual de la fanpage de Facebook del consultorio. Hablas solo en español, con tono cálido y directo. Saludos breves, preguntas qué necesita el paciente y le explicas las promociones de bienvenida y la póliza particular. Siempre invitas a seguir por WhatsApp para agendar su cita.",
    commission_rate: 10,
  },
  {
    id: "vprom-2",
    name: "Promotor virtual 2",
    code: "PROMO2",
    channel: "instagram",
    persona:
      "Eres el promotor virtual del Instagram del consultorio. Hablas solo en español, con tono alegre y mensajes breves. Vas al grano: promociones de bienvenida, póliza particular y el pase a WhatsApp para agendar la cita.",
    commission_rate: 10,
  },
  {
    id: "vprom-3",
    name: "Promotor virtual 3",
    code: "PROMO3",
    channel: "facebook",
    persona:
      "Eres el promotor virtual de la fanpage de Facebook del consultorio. Hablas solo en español, con tono paciente y explicativo. Explicas con calma cómo obtener las promociones con la póliza particular y resuelves las dudas del paciente antes de pasarlo a WhatsApp para agendar.",
    commission_rate: 10,
  },
];

/** Convierte una definición por defecto en un Promoter del almacén. */
export function defaultPromoterToStore(
  def: VirtualPromoterDef,
  organizationId: string
): Promoter {
  return {
    id: def.id,
    organization_id: organizationId,
    name: def.name,
    code: def.code,
    phone: null,
    commission_rate: def.commission_rate,
    active: true,
    created_at: new Date().toISOString(),
    is_virtual: true,
    persona: def.persona,
    channel: def.channel,
    fanpage_url: null,
  };
}

// ---------------------------------------------------------------------------
// Pase a WhatsApp (función reutilizable: la usa la ruta de chat y el
// simulador del panel). El paciente llega al WhatsApp único con su
// código de promotor ya escrito, para que la clínica sepa quién lo
// mandó y le respete las promociones mencionadas.
// ---------------------------------------------------------------------------

export interface Handoff {
  /** Link wa.me al WhatsApp único, con el mensaje ya escrito. */
  url: string;
  /** Texto prellenado del mensaje (incluye el código del promotor). */
  message: string;
}

export function buildHandoff(
  promoter: Promoter,
  opts?: { treatment?: string | null; patientName?: string | null }
): Handoff {
  const channel = promoter.channel ? CHANNEL_LABEL[promoter.channel] : "Facebook";
  const lines = [
    `Hola, vengo de ${channel} con ${promoter.name} (código ${promoter.code}).`,
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
  promoter: Promoter,
  org: Organization,
  opts?: { treatment?: string | null; patientName?: string | null; siteUrl?: string }
): string {
  const nombre = opts?.patientName ? `Hola ${opts.patientName}, te` : "Te";
  return (
    `${nombre} mando la información para tu cita en ${org.name}:\n` +
    `• Reserva en línea: ${bookingUrl(org, opts?.siteUrl)}\n` +
    `• Código de promotor: ${promoter.code} (menciónalo al reservar, así te respetan las promociones)\n` +
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
    .replace(/[\u0300-\u036f]/g, "");
  return /cita|agend|reserv|quiero ir|apartar|cuando puedo|disponib|me anoto|apuntame|apuntarme/.test(
    m
  );
}

// ---------------------------------------------------------------------------
// Respuestas locales (modo demo, "sin conexión a la IA").
// Se usan cuando no hay llaves de Gemini/Groq, o si la IA falla.
// Van marcadas como demo en la respuesta de la API: nunca se hacen
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
    .replace(/[\u0300-\u036f]/g, "");
}

export function demoReply(
  promoter: Promoter,
  message: string,
  orgName: string
): DemoReply {
  const m = norm(message);
  const nombre = promoter.name;

  if (/^(hola|buenos|buenas|que tal|saludos|hey)\b/.test(m.trim())) {
    return {
      reply:
        `¡Hola! Soy ${nombre}, promotor virtual de ${orgName}. ` +
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
        `Para blanqueamiento, implantes, extracción, coronas, prótesis y otros tratamientos, pregunta por tu precio. ` +
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
      `¡Hola! Soy ${nombre}, promotor virtual de ${orgName}. ` +
      `Te puedo explicar las promociones de bienvenida y cómo obtenerlas con la póliza particular, ` +
      `o ayudarte a agendar tu valoración sin costo. ¿Qué tratamiento te interesa?`,
    wantsBooking: false,
  };
}
