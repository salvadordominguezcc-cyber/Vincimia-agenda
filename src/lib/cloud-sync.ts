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
import type { Appointment, Contact, Doctor, Organization, Service } from "./types";
import { supabaseConfigured } from "./supabase";

/** Nombre sin acentos, en minúsculas: para juntar "Valoracion" del
 *  teléfono con "Valoración" de la nube sin duplicar el servicio. */
export function normalizeCatalogName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CatalogBundle {
  org: Partial<Organization> | null;
  services: Service[];
  doctors: Doctor[];
}

export async function fetchCatalog(
  orgId: string,
  secret: string
): Promise<CatalogBundle> {
  const json = await authedFetch(
    orgId,
    secret,
    `/api/catalog/list?organization_id=${encodeURIComponent(orgId)}`
  );
  return {
    org: (json.org as Partial<Organization>) ?? null,
    services: (json.services as Service[]) ?? [],
    doctors: (json.doctors as Doctor[]) ?? [],
  };
}

/** Catálogo público de un negocio por su enlace, para el link de
 *  reserva: no pide secreto y solo trae servicios y doctores activos.
 *  null si el negocio no existe o no hay conexión (el link sigue
 *  con lo del aparato en ese caso). */
export async function fetchPublicCatalog(slug: string): Promise<CatalogBundle | null> {
  const res = await fetch(`/api/catalog/public?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    org?: Partial<Organization>;
    services?: Service[];
    doctors?: Doctor[];
  } | null;
  if (!json?.ok) return null;
  return {
    org: json.org ?? null,
    services: json.services ?? [],
    doctors: json.doctors ?? [],
  };
}

/** Mezcla el catálogo de la nube con el del aparato. La nube manda:
 *  - Datos del negocio: nombre, enlace, tiempo entre citas, descanso
 *    y correo de Google vienen de la nube (lo demás local se conserva).
 *  - Servicios/doctores: si hay uno en la nube con el mismo nombre
 *    (con o sin acentos), ese reemplaza al local y las citas que
 *    apuntaban al local pasan a apuntar al de la nube. Los que solo
 *    viven en el aparato se conservan: nada se borra en silencio.
 *  Devuelve el almacén ya guardado, salvo que persist=false: el link
 *  público usa persist=false para no escribir en el localStorage del
 *  paciente lo que es de la clínica. */
export function mergeCatalogIntoStore(
  data: StoreData,
  catalog: CatalogBundle,
  persist = true
): StoreData {
  let next: StoreData = { ...data };
  if (catalog.org) {
    const o = catalog.org;
    next = {
      ...next,
      org: {
        ...next.org,
        name: o.name !== undefined ? String(o.name) : next.org.name,
        slug: o.slug !== undefined ? String(o.slug) : next.org.slug,
        buffer_minutes:
          o.buffer_minutes !== undefined && o.buffer_minutes !== null
            ? Number(o.buffer_minutes)
            : next.org.buffer_minutes,
        // null en la nube sí vale: significa "sin descanso" o "sin
        // correo", y manda sobre lo viejo del aparato.
        break_start: o.break_start !== undefined ? (o.break_start as string | null) : next.org.break_start,
        break_end: o.break_end !== undefined ? (o.break_end as string | null) : next.org.break_end,
        // Dirección y horario (migración 011): si la nube los trae,
        // mandan; si no vienen (columna aún no aplicada), se conserva
        // lo del aparato.
        address:
          o.address !== undefined ? ((o.address as string | null) ?? null) : next.org.address,
        hours_text:
          o.hours_text !== undefined ? ((o.hours_text as string | null) ?? null) : next.org.hours_text,
        connected_google_email:
          o.connected_google_email !== undefined
            ? (o.connected_google_email as string | null)
            : next.org.connected_google_email,
        google_calendar_sync:
          o.google_calendar_sync !== undefined
            ? Boolean(o.google_calendar_sync)
            : next.org.google_calendar_sync,
        whatsapp_bot_enabled:
          o.whatsapp_bot_enabled !== undefined
            ? Boolean(o.whatsapp_bot_enabled)
            : next.org.whatsapp_bot_enabled,
        vincimia_confirmations_enabled:
          o.vincimia_confirmations_enabled !== undefined
            ? Boolean(o.vincimia_confirmations_enabled)
            : next.org.vincimia_confirmations_enabled,
      },
    };
  }
  const serviceIdMap = new Map<string, string>();
  const mergedServices: Service[] = [...next.services];
  for (const cloud of catalog.services) {
    const idx = mergedServices.findIndex(
      (s) =>
        s.id === cloud.id ||
        normalizeCatalogName(s.name) === normalizeCatalogName(cloud.name)
    );
    if (idx >= 0) {
      if (mergedServices[idx].id !== cloud.id) serviceIdMap.set(mergedServices[idx].id, cloud.id);
      mergedServices[idx] = { ...cloud, organization_id: next.org.id };
    } else {
      mergedServices.push({ ...cloud, organization_id: next.org.id });
    }
  }
  const doctorIdMap = new Map<string, string>();
  const mergedDoctors: Doctor[] = [...(next.doctors ?? [])];
  for (const cloud of catalog.doctors) {
    const idx = mergedDoctors.findIndex(
      (d) =>
        d.id === cloud.id ||
        normalizeCatalogName(d.name) === normalizeCatalogName(cloud.name)
    );
    if (idx >= 0) {
      if (mergedDoctors[idx].id !== cloud.id) doctorIdMap.set(mergedDoctors[idx].id, cloud.id);
      mergedDoctors[idx] = { ...cloud, organization_id: next.org.id };
    } else {
      mergedDoctors.push({ ...cloud, organization_id: next.org.id });
    }
  }
  const appointments =
    serviceIdMap.size === 0 && doctorIdMap.size === 0
      ? next.appointments
      : next.appointments.map((a) => ({
          ...a,
          service_id: a.service_id && serviceIdMap.has(a.service_id) ? serviceIdMap.get(a.service_id) as string : a.service_id,
          doctor_id: a.doctor_id && doctorIdMap.has(a.doctor_id) ? doctorIdMap.get(a.doctor_id) as string : a.doctor_id,
        }));
  next = { ...next, services: mergedServices, doctors: mergedDoctors, appointments };
  if (persist) saveStore(next);
  return next;
}

/** Resultado de guardar una fila del catálogo en la nube. */
export interface CloudSaveResult {
  ok: boolean;
  message: string;
  row?: Record<string, unknown>;
}

function cloudDisabled(): CloudSaveResult {
  return { ok: false, message: "La nube no está configurada en este aparato (modo demo)." };
}

async function saveCatalogRow(
  data: StoreData,
  path: string,
  body: Record<string, unknown>
): Promise<CloudSaveResult> {
  if (!supabaseConfigured()) return cloudDisabled();
  try {
    const json = await authedFetch(data.org.id, data.org.excel_webhook_secret, path, {
      method: "POST",
      body: JSON.stringify({ organization_id: data.org.id, ...body }),
    });
    return { ok: true, message: "Guardado en la nube.", row: json as Record<string, unknown> };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** Guarda un servicio en la nube (agregar o editar). */
export async function saveServiceToCloud(data: StoreData, service: Service): Promise<CloudSaveResult> {
  return saveCatalogRow(data, "/api/catalog/services", { service });
}

/** Borra un servicio de la nube. */
export async function deleteServiceFromCloud(data: StoreData, serviceId: string): Promise<CloudSaveResult> {
  if (!supabaseConfigured()) return cloudDisabled();
  try {
    const res = await fetch("/api/catalog/services", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.org.excel_webhook_secret}`,
      },
      body: JSON.stringify({ organization_id: data.org.id, service_id: serviceId }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(json.message ?? `Error ${res.status}`));
    return { ok: true, message: "Borrado de la nube." };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** Guarda un doctor en la nube (agregar, editar, pausar o reactivar). */
export async function saveDoctorToCloud(data: StoreData, doctor: Doctor): Promise<CloudSaveResult> {
  return saveCatalogRow(data, "/api/catalog/doctors", { doctor });
}

/** Guarda los datos del negocio (Ajustes) en la nube. Si la nube
 *  devuelve pending_columns (migración 011 aún no aplicada), la
 *  dirección y el horario quedaron guardados en este aparato y el
 *  mensaje lo dice claro. */
export async function saveOrgToCloud(
  data: StoreData,
  patch: {
    name: string;
    slug: string;
    buffer_minutes: number;
    break_start: string | null;
    break_end: string | null;
    connected_google_email: string | null;
    address: string | null;
    hours_text: string | null;
  }
): Promise<CloudSaveResult> {
  if (!supabaseConfigured()) return cloudDisabled();
  try {
    const json = (await authedFetch(data.org.id, data.org.excel_webhook_secret, "/api/catalog/org", {
      method: "POST",
      body: JSON.stringify({ organization_id: data.org.id, ...patch }),
    })) as Record<string, unknown>;
    const pending = Array.isArray(json.pending_columns) ? (json.pending_columns as string[]) : [];
    return {
      ok: true,
      message:
        pending.length > 0
          ? "Guardado en la nube. La dirección y el horario quedaron en este aparato: falta aplicar la migración 011 en Supabase para que también se guarden en la nube."
          : "Guardado en la nube.",
      row: json as Record<string, unknown>,
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

export interface CatalogUploadResult {
  services: { created: number; updated: number; errors: string[]; mapping: { local_id: string; cloud_id: string }[] };
  doctors: { created: number; updated: number; errors: string[]; mapping: { local_id: string; cloud_id: string }[] };
}

/** Sube a la nube los servicios y doctores que solo viven en el
 *  aparato (los que no tienen id de la nube). Por nombre no duplica:
 *  si en la nube ya hay uno con ese nombre, se actualiza ese.
 *  Los promotores NO se suben: se controlan en su Excel. */
export async function uploadCatalogToCloud(data: StoreData): Promise<CatalogUploadResult> {
  const localServices = data.services.filter((s) => !isCloudId(s.id));
  const localDoctors = (data.doctors ?? []).filter((d) => {
    // Los doctores locales ya nacen con UUID: se suben los que la
    // nube no conoce; el servidor los casa por nombre si ya existen.
    return true;
  });
  const json = await authedFetch(data.org.id, data.org.excel_webhook_secret, "/api/catalog/upload", {
    method: "POST",
    body: JSON.stringify({
      organization_id: data.org.id,
      services: localServices,
      doctors: localDoctors,
    }),
  });
  return {
    services: (json.services as CatalogUploadResult["services"]) ?? { created: 0, updated: 0, errors: [], mapping: [] },
    doctors: (json.doctors as CatalogUploadResult["doctors"]) ?? { created: 0, updated: 0, errors: [], mapping: [] },
  };
}

/** Reescribe los ids locales con los ids de la nube (después de
 *  subir el catálogo) y arregla las citas que apuntaban a ellos. */
export function applyCatalogIds(
  data: StoreData,
  result: CatalogUploadResult
): StoreData {
  const serviceMap = new Map(result.services.mapping.map((m) => [m.local_id, m.cloud_id]));
  const doctorMap = new Map(result.doctors.mapping.map((m) => [m.local_id, m.cloud_id]));
  if (serviceMap.size === 0 && doctorMap.size === 0) return data;
  const next: StoreData = {
    ...data,
    services: data.services.map((s) =>
      serviceMap.has(s.id) ? { ...s, id: serviceMap.get(s.id) as string } : s
    ),
    doctors: (data.doctors ?? []).map((d) =>
      doctorMap.has(d.id) ? { ...d, id: doctorMap.get(d.id) as string } : d
    ),
    appointments: data.appointments.map((a) => ({
      ...a,
      service_id: a.service_id && serviceMap.has(a.service_id) ? serviceMap.get(a.service_id) as string : a.service_id,
      doctor_id: a.doctor_id && doctorMap.has(a.doctor_id) ? doctorMap.get(a.doctor_id) as string : a.doctor_id,
    })),
  };
  saveStore(next);
  return next;
}

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
 *  el calendario muestre los nombres. Los servicios y doctores se
 *  mezclan por nombre (nube manda), para no duplicar "Valoracion"
 *  local con "Valoración" de la nube. No borra ni duplica nada. */
export function mergeCloudIntoStore(data: StoreData, cloud: CloudBundle): StoreData {
  const knownAppts = new Set(data.appointments.map((a) => a.id));
  const newAppts = cloud.appointments.filter((a) => !knownAppts.has(a.id));
  const knownContacts = new Set(data.contacts.map((c) => c.id));
  const newContacts = cloud.contacts.filter((c) => !knownContacts.has(c.id));
  const withAppts: StoreData = {
    ...data,
    appointments: [...data.appointments, ...newAppts].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    ),
    contacts: [...data.contacts, ...newContacts],
  };
  // Servicios y doctores: los de la nube mandan (por nombre, no solo
  // por id) y las citas locales pasan a apuntar a los de la nube.
  return mergeCatalogIntoStore(withAppts, {
    org: null,
    services: cloud.services,
    doctors: cloud.doctors,
  });
}

/** Sube las citas locales a la nube y devuelve cuántas subieron,
 *  cuántas ya estaban y el mapa local_id → cloud_id. Sube todas
 *  las que solo viven en este aparato. */
export async function uploadLocalAppointments(
  data: StoreData
): Promise<{
  uploaded: number;
  skipped: number;
  errors: string[];
  mapping: { local_id: string; cloud_id: string; skipped: boolean }[];
}> {
  return uploadSelectedAppointments(data, localOnlyAppointments(data).map((a) => a.id));
}

/** Sube solo las citas locales marcadas (ids) a la nube. Las que no
 *  se marcan se quedan en el aparato, sin subir. Devuelve lo mismo
 *  que uploadLocalAppointments. */
export async function uploadSelectedAppointments(
  data: StoreData,
  selectedIds: string[]
): Promise<{
  uploaded: number;
  skipped: number;
  errors: string[];
  mapping: { local_id: string; cloud_id: string; skipped: boolean }[];
}> {
  const wanted = new Set(selectedIds);
  const local = localOnlyAppointments(data).filter((a) => wanted.has(a.id));
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
