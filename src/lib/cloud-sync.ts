// Sincronización panel ↔ nube (navegador).
// El panel guarda sus datos en el aparato (localStorage); la nube
// (Supabase) es donde viven las citas que sí llegan a Google Calendar
// y a WhatsApp. Estas ayudas conectan los dos lados sin borrar nada:
// - Bajar: trae las citas de la nube y las mezcla con las del aparato.
// - Subir: manda las citas locales a la nube y reescribe sus ids con
//   los ids de la nube, para que el Confirmar ya dispare los canales.
// Una cita está en la nube cuando su id es un UUID; las locales usan
// ids "apt-...". Nada se borra en silencio: la subida solo agrega en
// la nube y reescribe ids locales.

import {
  saveStore,
  type StoreData,
} from "./store";
import type { Appointment, Contact, Doctor, Service } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Esta cita ya vive en la nube? (id UUID, no "apt-..."). */
export function isCloudId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Citas del aparato que todavía no están en la nube. */
export function localOnlyAppointments(data: StoreData): Appointment[] {
  return data.appointments.filter((a) => !isCloudId(a.id));
}

export interface CloudBundle {
  appointments: Appointment[];
  contacts: Contact[];
  services: Service[];
  doctors: Doctor[];
}

async function authedFetch(
  orgId: string,
  secret: string,
  path: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.message ?? `Error ${res.status}`));
  }
  return json;
}

/** Baja las citas de la nube (servidor, con el secreto del negocio). */
export async function fetchCloudAppointments(
  orgId: string,
  secret: string
): Promise<CloudBundle> {
  const json = await authedFetch(
    orgId,
    secret,
    `/api/appointments/list?organization_id=${encodeURIComponent(orgId)}`
  );
  return {
    appointments: (json.appointments as Appointment[]) ?? [],
    contacts: (json.contacts as Contact[]) ?? [],
    services: (json.services as Service[]) ?? [],
    doctors: (json.doctors as Doctor[]) ?? [],
  };
}

/** Mezcla las citas de la nube con las del aparato: agrega las que
 *  faltan (por id) y completa clientes, servicios y doctores para que
 *  el calendario muestre los nombres. No borra ni duplica nada. */
export function mergeCloudIntoStore(data: StoreData, cloud: CloudBundle): StoreData {
  const knownAppts = new Set(data.appointments.map((a) => a.id));
  const newAppts = cloud.appointments.filter((a) => !knownAppts.has(a.id));
  const knownContacts = new Set(data.contacts.map((c) => c.id));
  const newContacts = cloud.contacts.filter((c) => !knownContacts.has(c.id));
  const knownServices = new Set(data.services.map((s) => s.id));
  const newServices = cloud.services.filter((s) => !knownServices.has(s.id));
  const knownDoctors = new Set((data.doctors ?? []).map((d) => d.id));
  const newDoctors = cloud.doctors.filter((d) => !knownDoctors.has(d.id));
  const next: StoreData = {
    ...data,
    appointments: [...data.appointments, ...newAppts].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    ),
    contacts: [...data.contacts, ...newContacts],
    services: [...data.services, ...newServices],
    doctors: [...(data.doctors ?? []), ...newDoctors],
  };
  saveStore(next);
  return next;
}

/** Sube las citas locales a la nube y devuelve cuántas subieron,
 *  cuántas ya estaban y el mapa local_id → cloud_id. */
export async function uploadLocalAppointments(
  data: StoreData
): Promise<{
  uploaded: number;
  skipped: number;
  errors: string[];
  mapping: { local_id: string; cloud_id: string; skipped: boolean }[];
}> {
  const local = localOnlyAppointments(data);
  const payload = local.map((a) => {
    const contact = data.contacts.find((c) => c.id === a.contact_id);
    const service = data.services.find((s) => s.id === a.service_id);
    const doctor = (data.doctors ?? []).find((d) => d.id === a.doctor_id);
    return {
      local_id: a.id,
      client_name: contact?.full_name ?? "Sin contacto",
      client_phone: contact?.phone ?? null,
      service_name: service?.name ?? "Consulta General",
      doctor_name: doctor?.name ?? null,
      doctor_id: a.doctor_id,
      start_time: a.start_time,
      end_time: a.end_time,
      duration_minutes: a.duration_minutes,
      price: a.price,
      status: a.status,
      source: a.source,
      notes: a.notes,
    };
  });
  const json = await authedFetch(data.org.id, data.org.excel_webhook_secret, "/api/appointments/migrate", {
    method: "POST",
    body: JSON.stringify({ organization_id: data.org.id, appointments: payload }),
  });
  return {
    uploaded: Number(json.uploaded ?? 0),
    skipped: Number(json.skipped ?? 0),
    errors: (json.errors as string[]) ?? [],
    mapping: (json.mapping as { local_id: string; cloud_id: string; skipped: boolean }[]) ?? [],
  };
}

/** Reescribe los ids locales con los ids de la nube (después de subir)
 *  y guarda. A partir de ahí, Confirmar/Cancelar/Check-in en el panel
 *  ya pegan contra la nube y disparan Google + WhatsApp. */
export function applyCloudIds(
  data: StoreData,
  mapping: { local_id: string; cloud_id: string }[]
): StoreData {
  const byLocal = new Map(mapping.map((m) => [m.local_id, m.cloud_id]));
  const next: StoreData = {
    ...data,
    appointments: data.appointments.map((a) =>
      byLocal.has(a.id) ? { ...a, id: byLocal.get(a.id) as string } : a
    ),
  };
  saveStore(next);
  return next;
}

/** Atajo para Ajustes/Calendario: baja la nube y la mezcla con el
 *  aparato. Devuelve cuántas citas nuevas llegaron. */
export async function syncDown(data: StoreData): Promise<number> {
  const cloud = await fetchCloudAppointments(data.org.id, data.org.excel_webhook_secret);
  const before = data.appointments.length;
  const next = mergeCloudIntoStore(data, cloud);
  return next.appointments.length - before;
}
