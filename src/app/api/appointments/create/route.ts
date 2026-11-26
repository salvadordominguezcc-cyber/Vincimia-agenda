// Reserva pública en la nube — Vincimia Agenda.
// POST /api/appointments/create
//   { slug, client_name, client_phone, service_name, date, time,
//     doctor_id?, doctor_name?, notes? }
// La usa el link público (/reserva/[slug]) para que la cita nazca
// YA en Supabase: así al confirmarla en el panel sí llega a Google
// Calendar y sí se manda la confirmación por WhatsApp (antes la cita
// solo vivía en el aparato y el servidor respondía 404).
//
// Es una ruta pública (el paciente no tiene cuenta ni secreto), así
// que lleva límite de intentos por IP (10 por minuto) y solo crea
// citas en pendiente (o en pausa si el doctor exige anticipo).
// Nunca borra ni cambia citas existentes. Sin Supabase responde 503
// y el link cae al modo local de antes, avisando que quedó solo en
// el aparato.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  checkCloudOverlap,
  defaultBookingNotes,
  findOrCreateContact,
  insertCloudAppointment,
  resolveDoctor,
  resolveOrgBySlug,
  resolveService,
} from "@/lib/server-booking";

// Límite simple por IP en memoria (por instancia edge): 10 reservas
// por minuto. No es un muro perfecto, pero frena el abuso obvio sin
// pedirle cuenta al paciente.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "sin-ip";
  if (rateLimited(ip)) {
    return Response.json(
      { ok: false, message: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." },
      { status: 429 }
    );
  }
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json(
      { ok: false, cloud: false, message: "Supabase no configurado en el servidor." },
      { status: 503 }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const clientName = String(body.client_name ?? "").trim();
  const clientPhone = String(body.client_phone ?? "").trim();
  const serviceName = String(body.service_name ?? "").trim();
  const date = String(body.date ?? "").trim();
  const time = String(body.time ?? "").trim();
  const doctorId = body.doctor_id ? String(body.doctor_id) : null;
  const doctorName = body.doctor_name ? String(body.doctor_name) : null;
  const notes = body.notes ? String(body.notes) : null;
  if (!slug || !clientName || !serviceName || !DATE_RE.test(date) || !TIME_RE.test(time)) {
    return Response.json(
      { ok: false, message: "Faltan el negocio, el nombre, el servicio, la fecha o la hora." },
      { status: 400 }
    );
  }
  const org = await resolveOrgBySlug(supabase, slug);
  if (!org) {
    return Response.json({ ok: false, message: "Negocio no encontrado." }, { status: 404 });
  }
  const service = await resolveService(supabase, org.id, serviceName);
  const doctor = await resolveDoctor(supabase, org.id, doctorId, doctorName);
  const startISO = `${date}T${time}:00`;
  const { clash, inBreak } = await checkCloudOverlap(
    supabase,
    org,
    startISO,
    service.duration_minutes,
    doctor?.id ?? null
  );
  if (clash || inBreak) {
    return Response.json(
      {
        ok: false,
        conflict: true,
        message: inBreak
          ? `Ese horario cae en el tiempo de descanso (${org.break_start}–${org.break_end}). Elige otro horario.`
          : "Ese horario se acaba de ocupar. Elige otro horario libre de la lista.",
      },
      { status: 409 }
    );
  }
  const contactId = await findOrCreateContact(supabase, org.id, clientName, clientPhone || null);
  const status = doctor?.requires_deposit ? "on_hold" : "pending";
  const saved = await insertCloudAppointment(supabase, {
    organizationId: org.id,
    contactId,
    serviceId: service.id,
    doctorId: doctor?.id ?? null,
    startISO,
    durationMinutes: service.duration_minutes,
    price: service.price,
    status,
    source: "vincimia_link",
    notes: defaultBookingNotes(notes),
  });
  if ("error" in saved) {
    return Response.json({ ok: false, message: saved.error }, { status: 500 });
  }
  return Response.json({
    ok: true,
    cloud: true,
    appointment_id: saved.id,
    status,
    message:
      status === "on_hold"
        ? "Cita registrada en la nube, en pausa hasta que la clínica confirme los horarios del doctor."
        : "Cita registrada en la nube, en pendiente.",
  });
}
