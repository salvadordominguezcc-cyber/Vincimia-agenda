// Ayudas de servidor para crear citas en la nube (Supabase).
// Las usan la reserva pública (/api/appointments/create) y la
// migración de citas locales (/api/appointments/migrate): mismo
// motor anti-empalmes, mismo alta de contactos y mismas reglas de
// póliza/promoción que el webhook de Sheets. Solo viven en rutas
// /api/* (service_role). Nada de esto se importa en el navegador.

// Citas por Agenda: normalmente pacientes por primera vez →
// VALORACIÓN con póliza PARTICULAR /SALVADOR (regla de Salvador,
// 2026-11-26). No hay columna de póliza en la tabla: viaja en las
// notas, de donde la lee el evento de Google Calendar.
export const DEFAULT_POLICY = "PARTICULAR /SALVADOR";
export const DEFAULT_PROMOTION = "VALORACIÓN";

import type { SupabaseClient } from "@supabase/supabase-js";
import { attachClinicOffset, clinicWallISO } from "./clinic-time";
import {
  detectPhoneCountry,
  normalizePhone,
  normalizeStoredPhone,
  type PhoneCountry,
} from "./phone";

export interface CloudOrg {
  id: string;
  name: string;
  slug: string;
  buffer_minutes: number;
  break_start: string | null;
  break_end: string | null;
}

export async function resolveOrgBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<CloudOrg | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id, name, slug, buffer_minutes, break_start, break_end")
    .eq("slug", slug)
    .single();
  return (data as CloudOrg | null) ?? null;
}

/** Duración que un cliente puede mandar (la de su servicio local):
 *  solo se acepta un entero entre 15 y 120 minutos. Cualquier otro
 *  valor se ignora y se usa la duración de la nube o 45 min. */
export function validClientDuration(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 15 || n > 120) return null;
  return n;
}

/** Nombre sin acentos y en minúsculas, para comparar servicios
 *  aunque uno diga "Valoracion" y el otro "Valoración". */
function normalizeServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function resolveService(
  supabase: SupabaseClient,
  organizationId: string,
  serviceName: string,
  clientDurationMinutes?: number | null
): Promise<{ id: string | null; duration_minutes: number; price: number }> {
  const fallbackDuration = validClientDuration(clientDurationMinutes) ?? 45;
  const { data } = await supabase
    .from("services")
    .select("id, duration_minutes, price")
    .eq("organization_id", organizationId)
    .eq("name", serviceName)
    .eq("active", true)
    .single();
  if (data) {
    return {
      id: (data as { id: string }).id,
      duration_minutes: (data as { duration_minutes: number }).duration_minutes ?? 45,
      price: Number((data as { price: number }).price ?? 0),
    };
  }
  // Sin coincidencia exacta: probar sin acentos y sin mayúsculas
  // ("Valoracion" = "Valoración"). Si tampoco hay, usar la duración
  // que mandó el cliente cuando sea válida; si no, 45 min como antes.
  // Nunca se rompe por un servicio que no existe en la nube.
  const { data: all } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("organization_id", organizationId)
    .eq("active", true);
  const hit = (all ?? []).find(
    (s) => normalizeServiceName((s as { name: string }).name) === normalizeServiceName(serviceName)
  );
  if (hit) {
    return {
      id: (hit as { id: string }).id,
      duration_minutes: (hit as { duration_minutes: number }).duration_minutes ?? 45,
      price: Number((hit as { price: number }).price ?? 0),
    };
  }
  return { id: null, duration_minutes: fallbackDuration, price: 0 };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Doctor por id (si es UUID y existe en la nube) o por nombre.
 *  Devuelve null = sin asignar (ocupa la agenda general). */
export async function resolveDoctor(
  supabase: SupabaseClient,
  organizationId: string,
  doctorId?: string | null,
  doctorName?: string | null
): Promise<{ id: string; requires_deposit: boolean } | null> {
  let query = supabase
    .from("doctors")
    .select("id, requires_deposit")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (doctorId && UUID_RE.test(doctorId)) {
    query = query.eq("id", doctorId);
  } else if (doctorName) {
    query = query.ilike("name", doctorName);
  } else {
    return null;
  }
  const { data } = await query.single();
  if (!data) return null;
  return {
    id: (data as { id: string }).id,
    requires_deposit: Boolean((data as { requires_deposit: boolean }).requires_deposit),
  };
}

/** Contacto por teléfono (dígitos completos) o nombre; si no existe,
 *  se crea. El teléfono se guarda en internacional sin "+"
 *  (52… México, 1… Estados Unidos) y se compara por los dígitos
 *  COMPLETOS: los últimos 10 de un número de EUA nunca deben
 *  coincidir con un contacto mexicano. Los teléfonos viejos guardados
 *  como 10 dígitos locales se leen como mexicanos, como antes. */
export async function findOrCreateContact(
  supabase: SupabaseClient,
  organizationId: string,
  fullName: string,
  phone: string | null,
  phoneCountry?: PhoneCountry
): Promise<string | null> {
  const normalized = normalizePhone(phone, phoneCountry ?? detectPhoneCountry(phone));
  if (normalized) {
    const { data: byPhone } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("organization_id", organizationId);
    const hit = (byPhone ?? []).find(
      (c) => normalizeStoredPhone((c as { phone?: string | null }).phone) === normalized
    );
    if (hit) return (hit as { id: string }).id;
  }
  const { data: byName } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("full_name", fullName)
    .limit(1)
    .single();
  if (byName) return (byName as { id: string }).id;
  const { data: created } = await supabase
    .from("contacts")
    .insert({
      organization_id: organizationId,
      full_name: fullName,
      phone: normalized,
    })
    .select("id")
    .single();
  return (created as { id?: string } | null)?.id ?? null;
}

const BLOCKING = ["pending", "confirmed", "completed"];

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  buffer: number
): boolean {
  const aEndBuf = new Date(aEnd.getTime() + buffer * 60_000);
  const bEndBuf = new Date(bEnd.getTime() + buffer * 60_000);
  return aStart < bEndBuf && bStart < aEndBuf;
}

/** ¿Ese horario choca con una cita que bloquea, o cae en el descanso?
 *  Las horas llegan en hora local de la clínica ("2026-11-27T11:30:00"). */
export async function checkCloudOverlap(
  supabase: SupabaseClient,
  org: CloudOrg,
  startISO: string,
  durationMinutes: number,
  doctorId: string | null
): Promise<{ clash: boolean; inBreak: boolean }> {
  // Las horas llegan en hora local de la clínica ("2026-11-27T11:30:00",
  // sin desfase) y las de Supabase en UTC. Para compararlas, las dos se
  // pasan a "hora de pared": la de la nube se convierte a hora de
  // Mexicali y la nueva se lee tal cual.
  const toWall = (iso: string) => new Date(clinicWallISO(iso));
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  // Misma regla que findConflict en el panel: una cita con doctor solo
  // choca con las del mismo doctor o con las sin doctor (la agenda
  // general bloquea a todos); una cita sin doctor choca con todas.
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, doctor_id")
    .eq("organization_id", org.id)
    .in("status", BLOCKING);
  const clash = (existing ?? []).some((a) => {
    const otherDoctor = (a as { doctor_id: string | null }).doctor_id;
    if (doctorId && otherDoctor && otherDoctor !== doctorId) return false;
    return overlaps(
      start,
      end,
      toWall((a as { start_time: string }).start_time),
      toWall((a as { end_time: string }).end_time),
      org.buffer_minutes ?? 15
    );
  });
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const reqStartMin = toMin(startISO.slice(11, 16));
  const inBreak =
    !!org.break_start &&
    !!org.break_end &&
    reqStartMin < toMin(org.break_end) &&
    toMin(org.break_start) < reqStartMin + durationMinutes;
  return { clash, inBreak };
}

/** Inserta la cita en la nube. startISO en hora local de la clínica;
 *  se guarda con el desfase de Mexicali (America/Tijuana, -08:00 en
 *  invierno y -07:00 en verano) para que Supabase lo tome como la
 *  hora de la clínica. */
export async function insertCloudAppointment(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    contactId: string | null;
    serviceId: string | null;
    promoterId?: string | null;
    doctorId: string | null;
    startISO: string;
    durationMinutes: number;
    price: number;
    status: string;
    source: string;
    notes: string | null;
  }
): Promise<{ id: string } | { error: string }> {
  const start = new Date(input.startISO);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const toTz = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    const wall = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
    return attachClinicOffset(wall);
  };
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: input.organizationId,
      contact_id: input.contactId,
      service_id: input.serviceId,
      promoter_id: input.promoterId ?? null,
      doctor_id: input.doctorId,
      start_time: toTz(start),
      end_time: toTz(end),
      duration_minutes: input.durationMinutes,
      price: input.price,
      status: input.status,
      source: input.source,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo guardar la cita." };
  return { id: (data as { id: string }).id };
}

/** Nota estándar de una cita que llega por Agenda: promoción y póliza
 *  por defecto, para que la hoja de promotores y Google las lean igual. */
export function defaultBookingNotes(extra?: string | null): string {
  const base = `Póliza: ${DEFAULT_POLICY} · Promoción: ${DEFAULT_PROMOTION} · Reservó desde el link público.`;
  return extra ? `${base} ${extra}` : base;
}
