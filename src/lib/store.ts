// Almacén del MVP en modo demo: todo vive en localStorage del navegador.
// Cuando Supabase esté configurado, los datos reales viven en la nube
// (ver supabase/schema.sql y las rutas /api/*); este almacén sirve para
// probar el anti-empalme sin cuentas ni llaves. Nada se simula como nube:
// la etiqueta "Modo demo" está visible en todo el panel.
"use client";

import { findConflict } from "./anti-overlap";
import {
  DEMO_APPOINTMENTS,
  DEMO_CONTACTS,
  DEMO_ORG,
  DEMO_PROMOTERS,
  DEMO_SERVICES,
  todayISO,
} from "./demo-data";
import type {
  Appointment,
  Contact,
  Organization,
  Promoter,
  Service,
  SourceType,
  StatusType,
} from "./types";

const KEY = "vincimia-agenda-demo-v1";

export interface StoreData {
  org: Organization;
  services: Service[];
  promoters: Promoter[];
  contacts: Contact[];
  appointments: Appointment[];
  seededFor: string;
  /**
   * true cuando el usuario borró los datos de ejemplo en Ajustes.
   * Evita que loadStore() vuelva a sembrar las citas de ejemplo al
   * cambiar el día: sin este flag, borrar la agenda solo duraba un día.
   */
  demoCleared?: boolean;
}

function seed(): StoreData {
  return {
    org: DEMO_ORG,
    services: DEMO_SERVICES,
    promoters: DEMO_PROMOTERS,
    contacts: DEMO_CONTACTS,
    appointments: DEMO_APPOINTMENTS,
    seededFor: todayISO(),
    demoCleared: false,
  };
}

export function loadStore(): StoreData {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as StoreData;
    // Cada día se regeneran las citas de ejemplo para que la Agenda
    // de hoy siempre tenga datos con los que probar el anti-empalme.
    // Salvo que el usuario ya haya borrado los datos de ejemplo en
    // Ajustes: en ese caso no se vuelve a sembrar nada.
    if (parsed.seededFor !== todayISO()) {
      if (parsed.demoCleared) {
        const kept: StoreData = { ...parsed, seededFor: todayISO() };
        localStorage.setItem(KEY, JSON.stringify(kept));
        return kept;
      }
      const s = seed();
      s.services = parsed.services;
      s.promoters = parsed.promoters;
      s.contacts = parsed.contacts;
      s.org = parsed.org;
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return parsed;
  } catch {
    return seed();
  }
}

export function saveStore(data: StoreData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function resetDemo() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  window.location.reload();
}

/**
 * Borra los datos de ejemplo (citas, clientes, servicios y promotores)
 * y marca el almacén para que no se vuelvan a sembrar al cambiar el día.
 * La organización NO se toca: queda con los datos que el usuario haya
 * puesto en Ajustes, lista para cargar los datos reales.
 */
export function clearDemoData(data: StoreData): StoreData {
  const next: StoreData = {
    ...data,
    services: [],
    promoters: [],
    contacts: [],
    appointments: [],
    demoCleared: true,
  };
  saveStore(next);
  return next;
}

export function contactName(data: StoreData, id: string | null): string {
  return data.contacts.find((c) => c.id === id)?.full_name ?? "Sin contacto";
}

export function contactPhone(data: StoreData, id: string | null): string {
  return data.contacts.find((c) => c.id === id)?.phone ?? "";
}

export function serviceName(data: StoreData, id: string | null): string {
  return data.services.find((s) => s.id === id)?.name ?? "Servicio";
}

export function promoterName(data: StoreData, id: string | null): string {
  return data.promoters.find((p) => p.id === id)?.name ?? "—";
}

export function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export interface NewAppointmentInput {
  clientName: string;
  clientPhone: string;
  serviceId: string;
  date: string;
  time: string;
  promoterId: string | null;
  source: SourceType;
  notes?: string;
}

export interface CreateResult {
  ok: boolean;
  appointment?: Appointment;
  conflictWith?: Appointment;
  error?: string;
}

/** Crea una cita aplicando el motor anti-empalmes. Si choca, no se guarda
 *  como cita normal: el llamador decide si la registra como "conflict". */
export function createAppointment(
  data: StoreData,
  input: NewAppointmentInput
): CreateResult {
  const service = data.services.find((s) => s.id === input.serviceId);
  if (!service) return { ok: false, error: "Servicio no encontrado." };
  if (!input.clientName.trim())
    return { ok: false, error: "Falta el nombre del cliente." };
  const startISO = `${input.date}T${input.time}:00`;
  const start = new Date(startISO);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const endISO = `${input.date}T${String(end.getHours()).padStart(2, "0")}:${String(
    end.getMinutes()
  ).padStart(2, "0")}:00`;
  const conflict = findConflict(
    startISO,
    service.duration_minutes,
    data.appointments,
    data.org.buffer_minutes
  );
  if (conflict) return { ok: false, conflictWith: conflict };

  let contact = data.contacts.find(
    (c) =>
      c.full_name.toLowerCase() === input.clientName.trim().toLowerCase() ||
      (input.clientPhone && c.phone === input.clientPhone)
  );
  if (!contact) {
    contact = {
      id: `ct-${Date.now()}`,
      organization_id: data.org.id,
      full_name: input.clientName.trim(),
      phone: input.clientPhone || null,
      email: null,
      last_visit: null,
      created_at: new Date().toISOString(),
    };
    data.contacts = [...data.contacts, contact];
  }
  const appointment: Appointment = {
    id: `apt-${Date.now()}`,
    organization_id: data.org.id,
    contact_id: contact.id,
    service_id: service.id,
    promoter_id: input.promoterId,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: service.duration_minutes,
    price: service.price,
    status: "pending",
    source: input.source,
    notes: input.notes ?? null,
    whatsapp_confirmed: false,
    google_event_id: null,
    created_at: new Date().toISOString(),
  };
  data.appointments = [...data.appointments, appointment].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );
  saveStore(data);
  return { ok: true, appointment };
}

/** Guarda el intento que chocó como cita en estado "conflict" (registro
 *  visible en Agenda, sin bloquear a otras citas y sin generar comisión). */
export function saveAsConflict(
  data: StoreData,
  input: NewAppointmentInput,
  conflictWith: Appointment
): Appointment {
  const service = data.services.find((s) => s.id === input.serviceId)!;
  const startISO = `${input.date}T${input.time}:00`;
  const start = new Date(startISO);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const endISO = `${input.date}T${String(end.getHours()).padStart(2, "0")}:${String(
    end.getMinutes()
  ).padStart(2, "0")}:00`;
  let contact = data.contacts.find(
    (c) => c.full_name.toLowerCase() === input.clientName.trim().toLowerCase()
  );
  if (!contact) {
    contact = {
      id: `ct-${Date.now()}`,
      organization_id: data.org.id,
      full_name: input.clientName.trim(),
      phone: input.clientPhone || null,
      email: null,
      last_visit: null,
      created_at: new Date().toISOString(),
    };
    data.contacts = [...data.contacts, contact];
  }
  const appointment: Appointment = {
    id: `apt-conflict-${Date.now()}`,
    organization_id: data.org.id,
    contact_id: contact.id,
    service_id: service.id,
    promoter_id: input.promoterId,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: service.duration_minutes,
    price: service.price,
    status: "conflict",
    source: input.source,
    notes: `CONFLICTO: choca con ${contactName(data, conflictWith.contact_id)} ${fmtTime(conflictWith.start_time)}–${fmtTime(conflictWith.end_time)}.`,
    whatsapp_confirmed: false,
    google_event_id: null,
    created_at: new Date().toISOString(),
  };
  data.appointments = [...data.appointments, appointment].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );
  saveStore(data);
  return appointment;
}

/**
 * ¿Es la primera vez que viene este cliente?
 * Se calcula del historial del mismo contacto: es primera vez si no
 * tiene ninguna cita anterior (con hora de inicio anterior a esta) que
 * no esté cancelada ni en conflicto. No se inventa el dato: si el
 * cliente ya tuvo una cita antes, aunque fuera otro día, es que ya
 * había venido.
 */
export function isFirstVisit(data: StoreData, appt: Appointment): boolean {
  if (!appt.contact_id) return true;
  return !data.appointments.some(
    (a) =>
      a.id !== appt.id &&
      a.contact_id === appt.contact_id &&
      a.start_time < appt.start_time &&
      a.status !== "cancelled" &&
      a.status !== "conflict"
  );
}

export function setStatus(
  data: StoreData,
  id: string,
  status: StatusType
): StoreData {
  const next: StoreData = {
    ...data,
    appointments: data.appointments.map((a) =>
      a.id === id ? { ...a, status } : a
    ),
  };
  saveStore(next);
  return next;
}
