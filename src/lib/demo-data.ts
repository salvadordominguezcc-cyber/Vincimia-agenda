// Datos de ejemplo de Vincimia Agenda — Org #1, una clínica dental.
// SOLO PARA PROBAR EL MVP EN MODO DEMO (localStorage, nada se guarda en la nube).
// Las citas se generan para HOY, para que la Agenda siempre tenga qué mostrar.
// Caso de conflicto incluido tal cual en el Documento Maestro (pág. 5):
// Laura Méndez 10:00 (45 min, hasta 10:45 + 15 min de buffer = 11:00) y
// Luis Soto 10:15 (30 min) se traslapan → Luis queda en estado "conflict".

import type {
  Appointment,
  Contact,
  Doctor,
  DoctorScheduleDay,
  Organization,
  Promoter,
  Service,
} from "./types";

export const DEMO_ORG_ID = "11111111-1111-1111-1111-111111111111";

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function at(time: string): string {
  return `${todayISO()}T${time}:00`;
}

function end(start: string, minutes: number): string {
  // Fin en hora local (sin pasar por UTC, para no mover la hora).
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${todayISO()}T${hh}:${mm}:00`;
}

export const DEMO_ORG: Organization = {
  id: DEMO_ORG_ID,
  name: "Clínica Dental Sonrisa",
  slug: "clinica-sonrisa",
  buffer_minutes: 15,
  break_start: "14:00",
  break_end: "15:00",
  whatsapp_bot_enabled: false,
  google_calendar_sync: false,
  connected_google_email: null,
  google_calendar_id: "primary",
  // Sin link inventado: el dueño lo pone en Dashboard → Reseñas.
  google_review_url: null,
  excel_webhook_secret: "demo-secreto-sheets-cambiar-en-supabase",
  created_at: new Date().toISOString(),
};

// Horario de ejemplo: lunes a viernes 9:00–18:00 y sábado 9:00–14:00.
function weekdaySchedule(
  days: number[],
  start: string,
  end: string
): DoctorScheduleDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    start,
    end,
    active: days.includes(weekday),
  }));
}

// Doctores de ejemplo — las 5 especialidades que dio Salvador.
// Colores distintos para que cada doctor se vea de un color en el calendario.
export const DEMO_DOCTORS: Doctor[] = [
  {
    id: "a1111111-1111-1111-1111-111111111111",
    organization_id: DEMO_ORG_ID,
    name: "Dra. Ana López",
    specialty: "general",
    color: "#2563eb",
    requires_deposit: false,
    schedule: weekdaySchedule([1, 2, 3, 4, 5, 6], "09:00", "18:00"),
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "a2222222-2222-2222-2222-222222222222",
    organization_id: DEMO_ORG_ID,
    name: "Dr. Carlos Ruiz",
    specialty: "ortodoncia_general",
    color: "#7c3aed",
    requires_deposit: false,
    schedule: weekdaySchedule([1, 2, 3, 4, 5], "10:00", "19:00"),
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "a3333333-3333-3333-3333-333333333333",
    organization_id: DEMO_ORG_ID,
    name: "Dra. María Torres",
    specialty: "endodoncista",
    color: "#059669",
    requires_deposit: true,
    schedule: weekdaySchedule([1, 3, 5], "09:00", "17:00"),
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "a4444444-4444-4444-4444-444444444444",
    organization_id: DEMO_ORG_ID,
    name: "Dr. Jorge Sánchez",
    specialty: "endodoncista_general",
    color: "#ea580c",
    requires_deposit: false,
    schedule: weekdaySchedule([2, 4, 6], "09:00", "15:00"),
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "a5555555-5555-5555-5555-555555555555",
    organization_id: DEMO_ORG_ID,
    name: "Dra. Lucía Fernández",
    specialty: "ortopediatra",
    color: "#db2777",
    requires_deposit: false,
    schedule: weekdaySchedule([1, 2, 3, 4, 5], "09:00", "15:00"),
    active: true,
    created_at: new Date().toISOString(),
  },
];

export const DEMO_SERVICES: Service[] = [
  { id: "svc-consulta", organization_id: DEMO_ORG_ID, name: "Consulta General", duration_minutes: 45, price: 500, follow_up_days: 30, active: true, created_at: new Date().toISOString() },
  { id: "svc-limpieza", organization_id: DEMO_ORG_ID, name: "Valoración + Limpieza", duration_minutes: 60, price: 800, follow_up_days: 180, active: true, created_at: new Date().toISOString() },
  { id: "svc-revision", organization_id: DEMO_ORG_ID, name: "Revisión Inicial", duration_minutes: 30, price: 350, follow_up_days: 30, active: true, created_at: new Date().toISOString() },
  { id: "svc-ortodoncia", organization_id: DEMO_ORG_ID, name: "Control de Ortodoncia", duration_minutes: 30, price: 600, follow_up_days: 30, active: true, created_at: new Date().toISOString() },
];

export const DEMO_PROMOTERS: Promoter[] = [
  { id: "prom-carlos", organization_id: DEMO_ORG_ID, name: "Carlos M.", code: "CARLOS", phone: "+52 686 111 2233", commission_rate: 10, active: true, created_at: new Date().toISOString() },
  { id: "prom-ana", organization_id: DEMO_ORG_ID, name: "Ana R.", code: "ANA", phone: "+52 686 444 5566", commission_rate: 10, active: true, created_at: new Date().toISOString() },
  // Solo promotores humanos: los promotores virtuales se eliminaron
  // el 2026-11-26 (decisión: un solo bot unificado, sin virtuales).
];

export const DEMO_CONTACTS: Contact[] = [
  { id: "ct-roberto", organization_id: DEMO_ORG_ID, full_name: "Roberto Gómez", phone: "+52 686 123 4567", email: null, last_visit: at("09:00"), created_at: new Date().toISOString() },
  { id: "ct-laura", organization_id: DEMO_ORG_ID, full_name: "Laura Méndez", phone: "+52 686 987 6543", email: null, last_visit: null, created_at: new Date().toISOString() },
  { id: "ct-luis", organization_id: DEMO_ORG_ID, full_name: "Luis Soto", phone: "+52 686 555 0199", email: null, last_visit: null, created_at: new Date().toISOString() },
  { id: "ct-sofia", organization_id: DEMO_ORG_ID, full_name: "Sofía Castro", phone: "+52 686 777 8899", email: null, last_visit: null, created_at: new Date().toISOString() },
  { id: "ct-mariana", organization_id: DEMO_ORG_ID, full_name: "Mariana Torres", phone: "+52 686 222 3344", email: null, last_visit: null, created_at: new Date().toISOString() },
];

export const DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-1", organization_id: DEMO_ORG_ID, contact_id: "ct-roberto",
    service_id: "svc-consulta", promoter_id: null, doctor_id: "a1111111-1111-1111-1111-111111111111",
    start_time: at("09:00"), end_time: end("09:00", 45), duration_minutes: 45,
    price: 500, status: "completed", source: "google_calendar",
    notes: "Cita creada a mano en Google Calendar.", proposed_times: null, whatsapp_confirmed: false,
    google_event_id: null, created_at: new Date().toISOString(),
  },
  {
    id: "apt-2", organization_id: DEMO_ORG_ID, contact_id: "ct-laura",
    service_id: "svc-limpieza", promoter_id: "prom-carlos", doctor_id: "a1111111-1111-1111-1111-111111111111",
    start_time: at("10:00"), end_time: end("10:00", 60), duration_minutes: 60,
    price: 800, status: "confirmed", source: "excel_promoter",
    notes: "Promotor: Carlos M.", proposed_times: null, whatsapp_confirmed: false,
    google_event_id: null, created_at: new Date().toISOString(),
  },
  {
    id: "apt-3", organization_id: DEMO_ORG_ID, contact_id: "ct-luis",
    service_id: "svc-revision", promoter_id: "prom-ana", doctor_id: "a1111111-1111-1111-1111-111111111111",
    start_time: at("10:15"), end_time: end("10:15", 30), duration_minutes: 30,
    price: 350, status: "conflict", source: "excel_promoter",
    notes: "CONFLICTO: choca con Laura Méndez 10:00–11:00 + 15 min de buffer (hasta 11:15). No se le cobra comisión.", proposed_times: null,
    whatsapp_confirmed: false, google_event_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "apt-4", organization_id: DEMO_ORG_ID, contact_id: "ct-sofia",
    service_id: "svc-consulta", promoter_id: null, doctor_id: "a2222222-2222-2222-2222-222222222222",
    start_time: at("11:30"), end_time: end("11:30", 45), duration_minutes: 45,
    price: 500, status: "pending", source: "vincimia_link",
    notes: "Reservó desde el link público.", proposed_times: null, whatsapp_confirmed: false,
    google_event_id: null, created_at: new Date().toISOString(),
  },
  {
    id: "apt-5", organization_id: DEMO_ORG_ID, contact_id: "ct-mariana",
    service_id: "svc-ortodoncia", promoter_id: "prom-carlos", doctor_id: "a2222222-2222-2222-2222-222222222222",
    start_time: at("12:30"), end_time: end("12:30", 30), duration_minutes: 30,
    price: 600, status: "pending", source: "excel_promoter",
    notes: "Promotor: Carlos M.", proposed_times: null, whatsapp_confirmed: false,
    google_event_id: null, created_at: new Date().toISOString(),
  },
];
