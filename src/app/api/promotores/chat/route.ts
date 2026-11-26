// Chat de promotores virtuales — Vincimia Agenda.
// POST /api/promotores/chat
//   { promoter_code, channel, message, patient_name?, patient_phone?,
//     promoter?: { name, persona, channel } }
// Responde COMO el promotor virtual (su persona), en español.
// Sin llaves de IA (GEMINI_API_KEY / GROQ_API_KEY) responde con las
// respuestas locales y lo marca como modo "demo" ("sin conexión a la
// IA"): nunca finge una conexión real. Sin llamadas a Meta ni a
// WhatsApp: el pase a WhatsApp es un link wa.me que el paciente abre.
//
// De dónde sale el promotor (en orden):
//   1. El objeto `promoter` del cuerpo (el simulador del panel lo
//      manda con los datos editados en localStorage).
//   2. La tabla `promoters` de Supabase (is_virtual = true), si el
//      servidor está configurado.
//   3. Los 3 promotores por defecto de src/lib/virtual-promoters.ts.
// Cuando el paciente quiere agendar, la respuesta incluye el pase a
// WhatsApp (wa.me al número único del consultorio) y la plantilla de
// información para la cita.

import { supabaseServer } from "@/lib/supabase";
import type { Promoter, VirtualPromoterChannel } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/types";
import {
  DEFAULT_VIRTUAL_PROMOTERS,
  buildHandoff,
  buildInfoCita,
  defaultPromoterToStore,
  demoReply,
  detectaIntencionCita,
} from "@/lib/virtual-promoters";
import { aiConfigured, replyWithAI } from "@/lib/virtual-promoters-server";

const ORG_NAME_FALLBACK = "el consultorio";
const ORG_SLUG_FALLBACK = "clinica-sonrisa";

interface ChatBody {
  promoter_code?: string;
  channel?: VirtualPromoterChannel;
  message?: string;
  patient_name?: string | null;
  patient_phone?: string | null;
  /** Nombre y slug de la organización (los manda el panel desde su
   *  almacén): así los mensajes usan el nombre real del negocio y el
   *  link de reserva correcto, sin inventar marca. */
  org_name?: string | null;
  org_slug?: string | null;
  promoter?: {
    name?: string;
    persona?: string | null;
    channel?: VirtualPromoterChannel;
  };
}

/** Saca el tratamiento mencionado en el mensaje, si hay uno. */
const TREATMENTS: { re: RegExp; label: string }[] = [
  { re: /limpieza/i, label: "Limpieza" },
  { re: /resina/i, label: "Resina" },
  { re: /reconstrucci/i, label: "Reconstrucción" },
  { re: /endodoncia/i, label: "Endodoncia" },
  { re: /blanqueamiento/i, label: "Blanqueamiento" },
  { re: /implante/i, label: "Implante" },
  { re: /extracci|muela del juicio/i, label: "Extracción" },
  { re: /corona/i, label: "Corona" },
  { re: /protesis|prótesis/i, label: "Prótesis" },
  { re: /ortodoncia|bracket/i, label: "Ortodoncia" },
];

function detectTreatment(message: string): string | null {
  return TREATMENTS.find((t) => t.re.test(message))?.label ?? null;
}

function defaultByCode(code: string): Promoter | null {
  const def = DEFAULT_VIRTUAL_PROMOTERS.find(
    (d) => d.code.toUpperCase() === code.toUpperCase()
  );
  if (!def) return null;
  // Sin organización en el servidor, el nombre y el slug salen del
  // almacén demo del navegador; aquí solo se necesita la persona.
  return defaultPromoterToStore(def, "00000000-0000-0000-0000-000000000000");
}

async function resolvePromoter(
  code: string,
  override?: ChatBody["promoter"]
): Promise<Promoter | null> {
  if (override?.name) {
    const base = defaultByCode(code);
    return {
      ...(base ?? {
        id: `vprom-${code.toLowerCase()}`,
        organization_id: "00000000-0000-0000-0000-000000000000",
        name: override.name,
        code: code.toUpperCase(),
        phone: null,
        commission_rate: 10,
        active: true,
        created_at: new Date().toISOString(),
      }),
      name: override.name,
      persona: override.persona ?? base?.persona ?? null,
      channel: override.channel ?? base?.channel ?? "facebook",
      is_virtual: true,
    };
  }
  const supabase = supabaseServer();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("promoters")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("is_virtual", true)
        .limit(1)
        .maybeSingle();
      if (data) return data as Promoter;
    } catch {
      // Sin Supabase o sin la columna (migración 008 sin aplicar):
      // se cae a los promotores por defecto, sin romper la ruta.
    }
  }
  return defaultByCode(code);
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json(
      { ok: false, error: "El cuerpo debe ser JSON." },
      { status: 400 }
    );
  }
  const code = (body.promoter_code ?? "").trim().toUpperCase();
  const message = (body.message ?? "").trim();
  if (!code) {
    return Response.json(
      { ok: false, error: "Falta promoter_code." },
      { status: 400 }
    );
  }
  if (!message) {
    return Response.json(
      { ok: false, error: "Falta message." },
      { status: 400 }
    );
  }
  const promoter = await resolvePromoter(code, body.promoter);
  if (!promoter) {
    return Response.json(
      {
        ok: false,
        error: `No existe un promotor virtual con el código ${code}.`,
      },
      { status: 404 }
    );
  }
  if (!promoter.active) {
    return Response.json(
      { ok: false, error: `El promotor ${promoter.name} está inactivo.` },
      { status: 403 }
    );
  }
  const channel: VirtualPromoterChannel =
    body.channel ?? promoter.channel ?? "facebook";

  // Nombre de la organización para los mensajes: viene del cuerpo si
  // el panel lo manda; si no, el nombre genérico (sin inventar marca).
  const orgName = (body.org_name ?? "").trim() || ORG_NAME_FALLBACK;
  const orgSlug = (body.org_slug ?? "").trim() || ORG_SLUG_FALLBACK;
  const org = {
    id: promoter.organization_id,
    name: orgName,
    slug: orgSlug,
    buffer_minutes: 15,
    break_start: null,
    break_end: null,
    whatsapp_bot_enabled: false,
    google_calendar_sync: false,
    connected_google_email: null,
    google_calendar_id: "",
    google_review_url: null,
    excel_webhook_secret: "",
    created_at: new Date().toISOString(),
  };

  const quiereAgendar = detectaIntencionCita(message);
  const ai = await replyWithAI(promoter, orgName, message);
  const demo = demoReply(promoter, message, orgName);
  const reply = ai?.reply ?? demo.reply;
  const modo = ai?.modo ?? "demo";
  const wantsBooking = quiereAgendar || demo.wantsBooking;

  const treatment = detectTreatment(message);

  return Response.json({
    ok: true,
    reply,
    modo,
    /** true solo cuando hay una llave de IA configurada en el servidor. */
    ia_conectada: aiConfigured(),
    promoter: {
      code: promoter.code,
      name: promoter.name,
      channel,
      channel_label: CHANNEL_LABEL[channel],
    },
    quiere_agendar: wantsBooking,
    /** Tratamiento mencionado en el mensaje, si se detectó uno. */
    treatment,
    /** Pase a WhatsApp: solo cuando el paciente quiere agendar. */
    handoff: wantsBooking
      ? buildHandoff(promoter, {
          treatment,
          patientName: body.patient_name ?? null,
        })
      : null,
    /** Plantilla de información para la cita (siempre disponible). */
    info_cita: buildInfoCita(promoter, org, {
      treatment,
      patientName: body.patient_name ?? null,
    }),
  });
}
