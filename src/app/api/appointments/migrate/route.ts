// Sube a la nube las citas que solo viven en el aparato.
// POST /api/appointments/migrate
//   { organization_id, appointments: [{ local_id, client_name,
//     client_phone, service_name, doctor_name?, doctor_id?,
//     start_time, end_time, duration_minutes, price, status,
//     source, notes? }] }
// Authorization: Bearer <excel_webhook_secret de la organización>
// Por cada cita: si ya existe una en la nube con el mismo cliente y
// la misma hora, se salta (sin duplicar) y se devuelve su id; si no,
// se crea con el mismo estado y origen. Devuelve el mapa
// local_id → cloud_id para que el panel reescriba sus ids locales:
// así el Confirmar del panel ya pega contra la nube y dispara
// Google Calendar + WhatsApp + aviso al dueño.
// No borra nada del aparato: el borrado local, si acaso, lo decide
// el usuario después, en Ajustes.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  checkCloudOverlap,
  defaultBookingNotes,
  findOrCreateContact,
  insertCloudAppointment,
  resolveDoctor,
  resolveService,
} from "@/lib/server-booking";

const VALID_STATUS = ["pending", "confirmed", "completed", "cancelled", "conflict", "on_hold"];
const VALID_SOURCE = ["google_calendar", "excel_promoter", "vincimia_link", "whatsapp_bot"];

interface LocalAppt {
  local_id: string;
  client_name: string;
  client_phone?: string | null;
  service_name: string;
  doctor_name?: string | null;
  doctor_id?: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  status: string;
  source: string;
  notes?: string | null;
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const items = Array.isArray(body.appointments) ? (body.appointments as LocalAppt[]) : [];
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto Bearer." },
      { status: 400 }
    );
  }
  if (items.length === 0) {
    return Response.json({ ok: true, uploaded: 0, skipped: 0, mapping: [] });
  }
  if (items.length > 200) {
    return Response.json(
      { ok: false, message: "Demasiadas citas a la vez (máximo 200)." },
      { status: 400 }
    );
  }
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, buffer_minutes, break_start, break_end")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (orgError || !org) {
    return Response.json({ ok: false, message: "Secreto inválido u organización no encontrada." }, { status: 401 });
  }

  const mapping: { local_id: string; cloud_id: string; skipped: boolean }[] = [];
  let uploaded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    const name = String(item.client_name ?? "").trim();
    const startISO = String(item.start_time ?? "").slice(0, 19);
    if (!name || !startISO) {
      errors.push(`Cita ${item.local_id}: sin nombre o sin hora.`);
      continue;
    }
    const status = VALID_STATUS.includes(item.status) ? item.status : "pending";
    const source = VALID_SOURCE.includes(item.source) ? item.source : "vincimia_link";
    try {
      const contactId = await findOrCreateContact(
        supabase,
        organizationId,
        name,
        item.client_phone ?? null
      );
      // ¿Ya está en la nube? Mismo contacto y misma hora de inicio.
      if (contactId) {
        const { data: existing } = await supabase
          .from("appointments")
          .select("id, start_time")
          .eq("organization_id", organizationId)
          .eq("contact_id", contactId)
          .gte("start_time", `${startISO.slice(0, 10)}T00:00:00-06:00`)
          .lt("start_time", `${startISO.slice(0, 10)}T23:59:59-06:00`)
          .limit(50);
        const same = (existing ?? []).find((e) => {
          const wall = new Date(
            new Date((e as { start_time: string }).start_time).getTime() - 6 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 19);
          return wall === startISO;
        });
        if (same) {
          mapping.push({ local_id: item.local_id, cloud_id: (same as { id: string }).id, skipped: true });
          skipped++;
          continue;
        }
      }
      const service = await resolveService(supabase, organizationId, String(item.service_name ?? ""));
      const doctor = await resolveDoctor(
        supabase,
        organizationId,
        item.doctor_id ?? null,
        item.doctor_name ?? null
      );
      // Si la cita bloquea y choca en la nube, se sube como conflicto
      // (registro, sin bloquear): no se pierde el intento.
      let finalStatus = status;
      if (["pending", "confirmed", "completed"].includes(status)) {
        const { clash, inBreak } = await checkCloudOverlap(
          supabase,
          org as { id: string; name: string; slug: string; buffer_minutes: number; break_start: string | null; break_end: string | null },
          startISO,
          Number(item.duration_minutes) || service.duration_minutes,
          doctor?.id ?? null
        );
        if (clash || inBreak) finalStatus = "conflict";
      }
      const notes = item.notes?.includes("Póliza:")
        ? (item.notes as string)
        : defaultBookingNotes(item.notes ?? null);
      const saved = await insertCloudAppointment(supabase, {
        organizationId,
        contactId,
        serviceId: service.id,
        doctorId: doctor?.id ?? null,
        startISO,
        durationMinutes: Number(item.duration_minutes) || service.duration_minutes,
        price: Number(item.price) || service.price,
        status: finalStatus,
        source,
        notes,
      });
      if ("error" in saved) {
        errors.push(`Cita ${item.local_id}: ${saved.error}`);
        continue;
      }
      mapping.push({ local_id: item.local_id, cloud_id: saved.id, skipped: false });
      uploaded++;
    } catch (e) {
      errors.push(`Cita ${item.local_id}: ${String(e)}`);
    }
  }

  return Response.json({ ok: true, uploaded, skipped, mapping, errors });
}
