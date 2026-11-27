// Empuje manual Agenda → hoja de promotores (escritura inversa).
// POST /api/sheets/push  { organization_id, appointment_id, promotion?, policy? }
// Authorization: Bearer <excel_webhook_secret de la organización>
// O, para una prueba sin cita en la nube:
// POST /api/sheets/push  { organization_id, patient_name, start_time,
//   service_name?, promotion?, policy?, promoter_name?, source? }
//
// Carga la cita de Supabase (si viene appointment_id) y la manda al
// receptor de Apps Script (scripts/apps-script-agenda-a-sheets.gs),
// que la escribe en la pestaña DENTIPLUS MEXICALI 1 de la hoja oficial
// AGENDA DE PROMOTORES 2026.xlsx. El receptor nunca sobrescribe una
// celda ocupada: si los dos pacientes del horario están llenos,
// responde success:false, status:"full" y no escribe nada.
//
// SOLO LLAMADA MANUAL / DE PRUEBA. Ningún flujo automático
// (confirmación, cambio de estado, webhook) llama a esta ruta todavía.
// El receptor se configura solo en el servidor, con variables de
// entorno — nunca se pega ninguna llave en el código:
//   SHEETS_RECEIVER_URL    = URL /exec de la aplicación web de Apps Script
//   SHEETS_RECEIVER_SECRET = el mismo secreto de CONFIG.SECRET en el script
// Sin esas dos variables, responde 503 y no se inventa ningún envío.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { clinicDateOf, clinicTimeOf } from "@/lib/clinic-time";
import { loadAppointmentFull, loadOrg, type ApptFull } from "@/lib/server-appointments";

interface ReceiverResult {
  success?: boolean;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  const receiverUrl = (process.env.SHEETS_RECEIVER_URL ?? "").trim();
  const receiverSecret = (process.env.SHEETS_RECEIVER_SECRET ?? "").trim();
  if (!receiverUrl || !receiverSecret) {
    return Response.json(
      {
        ok: false,
        message:
          "Receptor de Sheets no configurado: faltan SHEETS_RECEIVER_URL y SHEETS_RECEIVER_SECRET en el servidor (ver scripts/apps-script-agenda-a-sheets.gs).",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const appointmentId = String(body.appointment_id ?? "");
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto." },
      { status: 400 }
    );
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

  // Datos de la cita: de Supabase si viene appointment_id, si no del
  // cuerpo (prueba manual). start_time es ISO local, ej. "2026-11-30T10:00:00".
  let patientName = String(body.patient_name ?? "").trim();
  let startTime = String(body.start_time ?? "").trim();
  let serviceName = String(body.service_name ?? body.treatment ?? "").trim();
  let promoterName = String(body.promoter_name ?? "").trim();
  const source = String(body.source ?? "vincimia_link").trim();
  let apptStatus = "";

  if (appointmentId) {
    const org = await loadOrg(supabase, organizationId);
    if (!org) {
      return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
    }
    const appt = await loadAppointmentFull(supabase, organizationId, appointmentId);
    if (!appt) {
      return Response.json(
        { ok: false, message: "Esa cita no está en la nube (solo existe en el aparato)." },
        { status: 404 }
      );
    }
    patientName = appt.contactName;
    startTime = appt.start_time;
    serviceName = appt.serviceName;
    apptStatus = appt.status;
    const promoterId = (appt as ApptFull & { promoter_id?: string | null }).promoter_id;
    if (promoterId) {
      const { data: prom } = await supabase
        .from("promoters")
        .select("name")
        .eq("id", promoterId)
        .maybeSingle();
      promoterName = (prom as { name?: string } | null)?.name ?? promoterName;
    }
  }
  if (!patientName || !startTime) {
    return Response.json(
      { ok: false, message: "Faltan patient_name y start_time (o un appointment_id válido)." },
      { status: 400 }
    );
  }

  // La hoja no guarda precios: solo el texto de promoción/valoración
  // y la póliza. Sin póliza, PARTICULAR /SALVADOR (tipo de póliza + promotor).
  const promotion = String(body.promotion ?? serviceName ?? "VALORACIÓN").trim();
  const policy = String(body.policy ?? "PARTICULAR /SALVADOR").trim().toUpperCase();

  const payload = {
    secret: receiverSecret,
    organization_id: organizationId,
    appointment_id: appointmentId || null,
    patient_name: patientName,
    start_date: clinicDateOf(startTime),
    start_time: clinicTimeOf(startTime),
    service_name: serviceName,
    treatment: serviceName,
    promotion,
    policy,
    promoter_name: promoterName,
    source,
    status: apptStatus,
  };

  let receiver: ReceiverResult;
  try {
    const res = await fetch(receiverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    receiver = (await res.json()) as ReceiverResult;
  } catch (e) {
    return Response.json(
      { ok: false, message: `No se pudo contactar al receptor de Sheets: ${String(e)}` },
      { status: 502 }
    );
  }

  if (!receiver.success) {
    return Response.json(
      {
        ok: false,
        message: receiver.message ?? "El receptor no escribió la cita.",
        receiver,
      },
      { status: 200 }
    );
  }
  return Response.json({ ok: true, receiver, appointment: payload });
}
