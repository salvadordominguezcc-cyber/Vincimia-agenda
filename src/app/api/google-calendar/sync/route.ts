// Sincronización en dos vías con Google Calendar.
// POST /api/google-calendar/sync  { organization_id, appointment_id? }
// Authorization: Bearer <excel_webhook_secret de la organización>
// (mismo secreto que el webhook de Sheets; la ruta vive en el servidor).
//
// Empuja: las citas de la nube sin evento en Google se crean allá;
// las canceladas borran su evento. Trae: los eventos escritos a mano
// en Google (próximos 30 días) que no están en la nube se crean como
// citas de origen Google Calendar, pasando por el anti-empalme: si
// chocan con una cita que bloquea o caen en el descanso, quedan como
// conflicto (registro, sin bloquear ni comisionar). Nunca simula:
// sin token guardado responde 503 y explica por qué.

export const runtime = "edge";

import { findConflict, overlapsBreak } from "@/lib/anti-overlap";
import { clinicWallISO } from "@/lib/clinic-time";
import {
  listGoogleEvents,
  refreshGoogleAccessToken,
} from "@/lib/google";
import {
  loadAppointmentFull,
  loadOrg,
  pushAppointmentToGoogle,
} from "@/lib/server-appointments";
import { supabaseServer } from "@/lib/supabase";

const BLOCKING = ["pending", "confirmed", "completed"];

/** Instante de Google ("2026-11-19T10:00:00-08:00") → "2026-11-19T10:00:00"
 *  (hora de la clínica, como se guardan las citas en este proyecto). */
function toWallISO(dateTime: string): string {
  return clinicWallISO(dateTime);
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json(
      { ok: false, message: "Supabase no configurado en el servidor." },
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
  const appointmentId = body.appointment_id ? String(body.appointment_id) : null;
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto Bearer." },
      { status: 400 }
    );
  }
  const org = await loadOrg(supabase, organizationId);
  if (!org) {
    return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
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
  if (!org.google_calendar_sync || !org.google_refresh_token) {
    return Response.json(
      {
        ok: false,
        message:
          "Google Calendar no conectado. Conecta la cuenta secundaria en Conectores (ver FASE2_SETUP.md).",
      },
      { status: 503 }
    );
  }

  // Una sola cita: solo empujarla.
  if (appointmentId) {
    const appt = await loadAppointmentFull(supabase, organizationId, appointmentId);
    if (!appt) {
      return Response.json(
        { ok: false, message: "Esa cita no está en la nube (solo existe en el aparato)." },
        { status: 404 }
      );
    }
    const result = await pushAppointmentToGoogle(supabase, org, appt);
    return Response.json({ ok: result.done, google: result });
  }

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken(org.google_refresh_token);
  } catch (e) {
    return Response.json(
      { ok: false, message: `No se pudo renovar la sesión de Google: ${String(e)}` },
      { status: 503 }
    );
  }
  const calendarId = org.google_calendar_id || "primary";
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: cloudAppts } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, google_event_id")
    .eq("organization_id", organizationId)
    .gte("start_time", timeMin)
    .lte("start_time", timeMax);
  const cloud = (cloudAppts ?? []) as {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    google_event_id: string | null;
  }[];

  // --- Empujar: citas de la nube sin evento, y borrar eventos de canceladas.
  let pushed = 0;
  let deleted = 0;
  const pushErrors: string[] = [];
  for (const row of cloud) {
    const full = await loadAppointmentFull(supabase, organizationId, row.id);
    if (!full) continue;
    if (BLOCKING.includes(row.status) && !row.google_event_id) {
      const r = await pushAppointmentToGoogle(supabase, org, full);
      if (r.done) pushed++;
      else pushErrors.push(r.reason);
    } else if (row.status === "cancelled" && row.google_event_id) {
      const r = await pushAppointmentToGoogle(supabase, org, full);
      if (r.done) deleted++;
      else pushErrors.push(r.reason);
    }
  }

  // --- Traer: eventos de Google que no están en la nube.
  let imported = 0;
  let conflicts = 0;
  const importErrors: string[] = [];
  let events;
  try {
    events = await listGoogleEvents(accessToken, calendarId, timeMin, timeMax);
  } catch (e) {
    return Response.json(
      { ok: false, message: `No se pudieron leer los eventos de Google: ${String(e)}`, pushed, deleted },
      { status: 502 }
    );
  }
  const knownEventIds = new Set(cloud.map((c) => c.google_event_id).filter(Boolean));
  for (const ev of events) {
    if (!ev.id || knownEventIds.has(ev.id)) continue;
    const startRaw = ev.start?.dateTime;
    const endRaw = ev.end?.dateTime;
    if (!startRaw || !endRaw) continue; // eventos de todo el día se ignoran
    const startISO = toWallISO(startRaw);
    const endISO = toWallISO(endRaw);
    const duration = Math.max(
      15,
      Math.round((new Date(endRaw).getTime() - new Date(startRaw).getTime()) / 60_000)
    );
    // El título suele ser "🟢 Nombre / teléfono / tratamiento" (formato
    // de la clínica) o "Cita — Nombre — Servicio" (formato viejo). El
    // emoji del inicio marca el estado: 🟢 confirmada, 🟡 pendiente.
    const summary = (ev.summary ?? "Cita de Google Calendar").trim();
    const noEmoji = summary.replace(/^[🟢🟡🔴⏸️]\s*/, "");
    let clientName = summary;
    let clientPhone: string | null = null;
    let serviceName = "Consulta General";
    let importedStatus: "pending" | "confirmed" = "pending";
    if (summary.startsWith("🟢")) importedStatus = "confirmed";
    const slashParts = noEmoji.split("/").map((s) => s.trim());
    if (slashParts.length >= 3) {
      clientName = slashParts[0];
      clientPhone = slashParts[1].replace(/\D/g, "") || null;
      serviceName = slashParts.slice(2).join(" / ");
    } else {
      const parts = summary.split("—").map((s) => s.trim());
      if (parts.length >= 2) {
        clientName = parts[1];
        serviceName = parts.length >= 3 ? parts[2] : "Consulta General";
      }
    }

    const { data: service } = await supabase
      .from("services")
      .select("id, duration_minutes, price")
      .eq("organization_id", organizationId)
      .eq("name", serviceName)
      .eq("active", true)
      .single();
    const price = (service as { price?: number } | null)?.price ?? 0;

    let contactId: string | null = null;
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("full_name", clientName)
      .limit(1)
      .single();
    if (contact) {
      contactId = (contact as { id: string }).id;
    } else {
      const { data: created } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          full_name: clientName,
          phone: clientPhone,
        })
        .select("id")
        .single();
      contactId = (created as { id?: string } | null)?.id ?? null;
    }

    const blocking = cloud
      .filter((c) => BLOCKING.includes(c.status))
      .map((c) => ({
        ...c,
        doctor_id: null,
        duration_minutes: Math.round(
          (new Date(c.end_time).getTime() - new Date(c.start_time).getTime()) / 60_000
        ),
      }));
    const clash = findConflict(startISO, duration, blocking as never, org.buffer_minutes);
    const inBreak = overlapsBreak(startISO, duration, org.break_start, org.break_end);
    // El emoji del título dice si ya estaba confirmada en Google.
    const status = clash || inBreak ? "conflict" : importedStatus;
    if (status === "conflict") conflicts++;
    const { error: insertError } = await supabase.from("appointments").insert({
      organization_id: organizationId,
      contact_id: contactId,
      service_id: (service as { id?: string } | null)?.id ?? null,
      start_time: startISO,
      end_time: endISO,
      duration_minutes: duration,
      price,
      status,
      source: "google_calendar",
      notes: clash
        ? `CONFLICTO (Google): choca con otra cita. Evento ${ev.id}.`
        : inBreak
          ? `CONFLICTO (Google): cae en el tiempo de descanso (${org.break_start}–${org.break_end}).`
          : `Importado de Google Calendar. Evento ${ev.id}.`,
      google_event_id: ev.id,
    });
    if (insertError) {
      importErrors.push(insertError.message);
    } else {
      imported++;
      knownEventIds.add(ev.id);
    }
  }

  await supabase
    .from("organizations")
    .update({ last_calendar_sync: new Date().toISOString() })
    .eq("id", organizationId);

  return Response.json({
    ok: true,
    pushed,
    deleted,
    imported,
    conflicts,
    pushErrors,
    importErrors,
    message: `Sincronizado: ${pushed} citas subidas a Google, ${imported} eventos traídos de Google, ${conflicts} en conflicto.`,
  });
}
