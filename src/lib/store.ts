// Almacén del MVP en modo demo: todo vive en localStorage del navegador.
// Cuando Supabase esté configurado, los datos reales viven en la nube
// (ver supabase/schema.sql y las rutas /api/*); este almacén sirve para
// probar el anti-empalme sin cuentas ni llaves. Nada se simula como nube:
// la etiqueta "Modo demo" está visible en todo el panel.
"use client";

import { findConflict, overlapsBreak } from "./anti-overlap";
import {
  DEMO_APPOINTMENTS,
  DEMO_CONTACTS,
  DEMO_DOCTORS,
  DEMO_ORG,
  DEMO_PROMOTERS,
  DEMO_SERVICES,
  todayISO,
} from "./demo-data";
import type {
  Appointment,
  Contact,
  Doctor,
  Organization,
  Promoter,
  PromoterConversation,
  Service,
  SourceType,
  StatusType,
} from "./types";
import type { FeedbackItem, ReviewRequest } from "./reviews";

const KEY = "vincimia-agenda-demo-v1";

export interface StoreData {
  org: Organization;
  services: Service[];
  promoters: Promoter[];
  contacts: Contact[];
  appointments: Appointment[];
  doctors: Doctor[];
  /** Reseñas del módulo de Reseñas (migración 007). Vacío al inicio:
   *  no hay calificaciones de ejemplo. */
  feedback: FeedbackItem[];
  /** Solicitudes de reseña encoladas/enviadas al completar citas. */
  reviewRequests: ReviewRequest[];
  /** Conversaciones viejas con el bot (antes embudo de promotores
   *  virtuales, eliminado 2026-11-26). Se conserva el campo para no
   *  romper almacenes viejos; ya no se crean filas nuevas. */
  conversations: PromoterConversation[];
  seededFor: string;
  /**
   * true cuando el usuario borró los datos de ejemplo en Ajustes.
   * Evita que loadStore() vuelva a sembrar las citas de ejemplo al
   * cambiar el día: sin este flag, borrar la agenda solo duraba un día.
   */
  demoCleared?: boolean;
}

/** Id único para citas y contactos nuevos (Date.now() solo puede
 *  repetirse si se crean dos en el mismo milisegundo). */
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(): StoreData {
  return {
    org: DEMO_ORG,
    services: DEMO_SERVICES,
    promoters: DEMO_PROMOTERS,
    contacts: DEMO_CONTACTS,
    appointments: DEMO_APPOINTMENTS,
    doctors: DEMO_DOCTORS,
    feedback: [],
    reviewRequests: [],
    conversations: [],
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
    // Migración suave: los almacenes viejos no tenían doctores ni
    // tiempo de descanso. Sin descanso guardado, no hay descanso.
    if (!parsed.doctors) parsed.doctors = DEMO_DOCTORS;
    if (parsed.org && parsed.org.break_start === undefined) {
      parsed.org.break_start = null;
      parsed.org.break_end = null;
    }
    if (parsed.org && parsed.org.google_review_url === undefined) {
      parsed.org.google_review_url = null;
    }
    if (!parsed.appointments) parsed.appointments = [];
    // Migración suave del módulo de Reseñas: los almacenes viejos no
    // tenían feedback ni solicitudes; arrancan vacíos, sin inventar nada.
    if (!parsed.feedback) parsed.feedback = [];
    if (!parsed.reviewRequests) parsed.reviewRequests = [];
    // Los almacenes viejos no tenían conversaciones; arrancan vacías.
    if (!parsed.conversations) parsed.conversations = [];
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
      s.doctors = parsed.doctors;
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
    doctors: [],
    feedback: [],
    reviewRequests: [],
    conversations: [],
    demoCleared: true,
  };
  saveStore(next);
  return next;
}

export function doctorName(data: StoreData, id: string | null): string {
  if (!id) return "Sin asignar";
  return data.doctors.find((d) => d.id === id)?.name ?? "Sin asignar";
}

export function doctorById(data: StoreData, id: string | null): Doctor | null {
  if (!id) return null;
  return data.doctors.find((d) => d.id === id) ?? null;
}

/** ¿El doctor atiende ese día a esa hora (la cita completa, no solo el inicio)? */
export function doctorWorksAt(
  doctor: Doctor,
  dateISO: string,
  time: string,
  durationMinutes: number
): { ok: boolean; reason?: string } {
  const weekday = new Date(`${dateISO}T12:00:00`).getDay();
  const day = doctor.schedule.find((d) => d.weekday === weekday);
  if (!day || !day.active) {
    return { ok: false, reason: "ese día no atiende" };
  }
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const start = toMin(time);
  const end = start + durationMinutes;
  if (start < toMin(day.start) || end > toMin(day.end)) {
    return {
      ok: false,
      reason: `ese día atiende de ${day.start} a ${day.end}`,
    };
  }
  return { ok: true };
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
  doctorId?: string | null;
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
  // Si hay doctor elegido, la cita debe caer dentro de su horario.
  const doctor = input.doctorId ? doctorById(data, input.doctorId) : null;
  if (input.doctorId && !doctor) {
    return { ok: false, error: "Ese doctor no existe." };
  }
  if (doctor && doctor.active) {
    const works = doctorWorksAt(doctor, input.date, input.time, service.duration_minutes);
    if (!works.ok) {
      return {
        ok: false,
        error: `${doctor.name} no atiende ${works.reason ?? "a esa hora"}. Elige otro horario o a otro doctor.`,
      };
    }
  }
  // Tiempo de descanso de la clínica: en esa hora no hay citas.
  if (
    overlapsBreak(
      `${input.date}T${input.time}:00`,
      service.duration_minutes,
      data.org.break_start,
      data.org.break_end
    )
  ) {
    return {
      ok: false,
      error: `Ese horario choca con el tiempo de descanso de la clínica (${data.org.break_start}–${data.org.break_end}). Elige otro horario.`,
    };
  }
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
    data.org.buffer_minutes,
    undefined,
    input.doctorId ?? null
  );
  if (conflict) return { ok: false, conflictWith: conflict };

  // Doctor con anticipo: la cita nace EN PAUSA, en cualquier canal
  // (en línea, por teléfono o por WhatsApp, todos pasan por aquí).
  // No se confirma ni bloquea el horario: la clínica primero revisa
  // los horarios del doctor, le propone unos al paciente y solo cuando
  // el paciente acepta se confirma (ver confirmAppointment).
  // Todavía no hay cobro en línea.
  const needsHold = !!doctor?.requires_deposit;

  let contact = data.contacts.find(
    (c) =>
      c.full_name.toLowerCase() === input.clientName.trim().toLowerCase() ||
      (input.clientPhone && c.phone === input.clientPhone)
  );
  if (!contact) {
    contact = {
      id: newId("ct"),
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
    id: newId("apt"),
    organization_id: data.org.id,
    contact_id: contact.id,
    service_id: service.id,
    promoter_id: input.promoterId,
    doctor_id: input.doctorId ?? null,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: service.duration_minutes,
    price: service.price,
    status: needsHold ? "on_hold" : "pending",
    source: input.source,
    notes: input.notes ?? null,
    proposed_times: null,
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
      id: newId("ct"),
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
    id: newId("apt-conflict"),
    organization_id: data.org.id,
    contact_id: contact.id,
    service_id: service.id,
    promoter_id: input.promoterId,
    doctor_id: input.doctorId ?? null,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: service.duration_minutes,
    price: service.price,
    status: "conflict",
    source: input.source,
    notes: `CONFLICTO: choca con ${contactName(data, conflictWith.contact_id)} ${fmtTime(conflictWith.start_time)}–${fmtTime(conflictWith.end_time)}.`,
    proposed_times: null,
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
      a.status !== "conflict" &&
      // Una cita en pausa no es una visita: solo pidió cita y está
      // esperando a que la clínica la confirme.
      a.status !== "on_hold"
  );
}

/**
 * La clínica le propone horarios al paciente (cita en pausa).
 * Guarda el texto tal cual en la cita, en palabras normales.
 */
export function proposeTimes(
  data: StoreData,
  id: string,
  proposedTimes: string
): StoreData {
  const next: StoreData = {
    ...data,
    appointments: data.appointments.map((a) =>
      a.id === id ? { ...a, proposed_times: proposedTimes.trim() || null } : a
    ),
  };
  saveStore(next);
  return next;
}

/**
 * Confirma una cita que estaba en pausa (el paciente ya aceptó los
 * horarios propuestos). Antes de confirmar vuelve a revisar que el
 * horario siga libre para ese doctor: como la cita en pausa no
 * bloqueaba, otro paciente pudo tomar ese hueco mientras tanto.
 * Si ya está ocupado, NO se confirma y se devuelve con quién choca,
 * para que la clínica proponga otro horario.
 */
export function confirmAppointment(
  data: StoreData,
  id: string
): { ok: boolean; data: StoreData; conflictWith?: Appointment; error?: string } {
  const appt = data.appointments.find((a) => a.id === id);
  if (!appt) return { ok: false, data, error: "Cita no encontrada." };
  if (appt.status !== "on_hold") {
    return { ok: true, data: setStatus(data, id, "confirmed") };
  }
  const conflict = findConflict(
    appt.start_time,
    appt.duration_minutes,
    data.appointments,
    data.org.buffer_minutes,
    appt.id,
    appt.doctor_id
  );
  if (conflict) {
    return {
      ok: false,
      data,
      conflictWith: conflict,
      error: `Ese horario ya lo tomó ${contactName(data, conflict.contact_id)}. Propón otro horario.`,
    };
  }
  return { ok: true, data: setStatus(data, id, "confirmed") };
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
