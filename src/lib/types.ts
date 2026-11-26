// Tipos de Vincimia Agenda — corresponden a supabase/schema.sql.
// Fuentes y estados tomados tal cual del Documento Maestro (pág. 1 y 3).

export type SourceType =
  | "google_calendar"
  | "excel_promoter"
  | "vincimia_link"
  | "whatsapp_bot";

export type StatusType =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "conflict"
  | "on_hold";

export interface DoctorScheduleDay {
  /** Día de la semana: 0 = domingo, 1 = lunes, …, 6 = sábado. */
  weekday: number;
  start: string; // "09:00"
  end: string; // "18:00"
  active: boolean;
}

export type DoctorSpecialty =
  | "general"
  | "ortodoncia_general"
  | "endodoncista"
  | "endodoncista_general"
  | "ortopediatra";

export const SPECIALTY_LABEL: Record<DoctorSpecialty, string> = {
  general: "Doctor general",
  ortodoncia_general: "Ortodoncia y general",
  endodoncista: "Endodoncista",
  endodoncista_general: "Endodoncista y general",
  ortopediatra: "Ortopediatra",
};

export const SPECIALTIES: DoctorSpecialty[] = [
  "general",
  "ortodoncia_general",
  "endodoncista",
  "endodoncista_general",
  "ortopediatra",
];

export interface Doctor {
  id: string;
  organization_id: string;
  name: string;
  specialty: DoctorSpecialty;
  /** Color del doctor en el calendario, ej. "#2563eb". */
  color: string;
  /** true = solo atiende con cita y anticipo: sus citas quedan en pausa
   *  hasta que la clínica confirme los horarios y el paciente acepte.
   *  Todavía no hay cobro en línea. */
  requires_deposit: boolean;
  schedule: DoctorScheduleDay[];
  active: boolean;
  created_at: string;
}

/** Colores para elegir al crear un doctor (paleta con buen contraste).
 *  Incluye los colores reales de la clínica (Google Calendar, 2026-11-26). */
export const DOCTOR_COLORS = [
  "#dc2626",
  "#facc15",
  "#fb923c",
  "#60a5fa",
  "#a78bfa",
  "#e879f9",
  "#4ade80",
  "#9ca3af",
  "#fda4af",
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#65a30d",
];

/** Color del doctor según la regla de la clínica (2026-11-26), el
 *  mismo en el calendario de Vincimia y en Google Calendar: rojo para
 *  doctor general (póliza Particular), morado para ortodoncia,
 *  turquesa para endodoncia. */
export function doctorColorForSpecialty(specialty: DoctorSpecialty): string {
  if (specialty === "endodoncista" || specialty === "endodoncista_general") {
    return "#0891b2";
  }
  if (specialty === "ortodoncia_general") return "#7c3aed";
  return "#dc2626";
}

/** Color propio de cada doctor real de la clínica, según su
 *  calendario oficial de Google (captura de Salvador, 2026-11-26).
 *  Se usa como color inicial al dar de alta al doctor por su nombre;
 *  después se puede cambiar a mano en Doctores. Si el nombre no es
 *  uno de los reales, cae al color de su especialidad. */
const REAL_DOCTOR_COLORS: { match: RegExp; color: string }[] = [
  { match: /jaqueline/, color: "#facc15" }, // Dra. Jaqueline Orto — amarillo
  { match: /jared/, color: "#fb923c" }, // Dr. Jared cirugías — naranja
  { match: /javier/, color: "#60a5fa" }, // Dr. Javier Orto — azul
  { match: /jimena/, color: "#a78bfa" }, // Dra. Jimena general — morado
  { match: /lilian/, color: "#e879f9" }, // Dra. Lilian general — rosa/magenta
  { match: /gerardo/, color: "#4ade80" }, // Dr. Gerardo Orto — verde
  { match: /beltr[aá]n/, color: "#9ca3af" }, // Dr. Beltrán Endo — gris
  { match: /liz/, color: "#fda4af" }, // Dra. Liz Ramos Odontopediatra — salmón
];

export function doctorColorForDoctor(name: string, specialty: DoctorSpecialty): string {
  const plain = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const found = REAL_DOCTOR_COLORS.find((r) => r.match.test(plain));
  return found ? found.color : doctorColorForSpecialty(specialty);
}

/** Emoji de estado para los bloques del calendario (igual que en el
 *  título de Google Calendar: 🟢 cita confirmada). */
export const STATUS_EMOJI: Record<StatusType, string> = {
  pending: "🟡",
  confirmed: "🟢",
  completed: "✅",
  cancelled: "❌",
  conflict: "⚠️",
  on_hold: "⏸️",
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  buffer_minutes: number;
  /** Tiempo de descanso de la clínica, ej. "14:00"–"15:00". null = sin
   *  descanso. En esa hora no se muestran ni se permiten citas. */
  break_start: string | null;
  break_end: string | null;
  whatsapp_bot_enabled: boolean;
  /** Interruptor de las confirmaciones de Vincimia (formato Confirmafy):
   *  evento en Google Calendar + WhatsApp al confirmar. TRUE = activas
   *  (comportamiento actual); FALSE = Confirmafy confirma y Vincimia no
   *  manda nada, para no empalmarse. Migración 010; undefined (columna
   *  aún no aplicada) se trata como TRUE. Se cambia en Conectores. */
  vincimia_confirmations_enabled?: boolean;
  /** Bot de Messenger (Facebook) e Instagram por negocio, igual que
   *  whatsapp_bot_enabled. Se activan en Conectores cuando cada canal
   *  ya está autorizado en Meta (migración 009). */
  messenger_bot_enabled?: boolean;
  instagram_bot_enabled?: boolean;
  /** Id de la página de Facebook y de la cuenta profesional de
   *  Instagram del negocio. El webhook de cada canal usa este id para
   *  saber a qué negocio llegó el mensaje (migración 009). */
  meta_page_id?: string | null;
  meta_instagram_id?: string | null;
  google_calendar_sync: boolean;
  connected_google_email: string | null;
  google_calendar_id: string;
  /** Link "Escribir reseña" de la ficha de Google Business de la
   *  clínica. null = el dueño aún no lo configuró (Dashboard → Reseñas).
   *  Sin él, las calificaciones de 4–5 estrellas no pueden llegar a
   *  Google Maps y solo queda el formulario privado. */
  google_review_url: string | null;
  excel_webhook_secret: string;
  created_at: string;
}

export interface Promoter {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  phone: string | null;
  /** Porcentaje de comisión (ej. 10 = 10 % del precio de la cita). */
  commission_rate: number;
  active: boolean;
  created_at: string;
}

/** Estado de una conversación con el bot unificado. */
export type ConversationStatus =
  | "conversando"
  | "en_whatsapp"
  | "cita_confirmada"
  | "cita_completada"
  | "sin_respuesta";

export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  conversando: "Conversando",
  en_whatsapp: "Pasó a WhatsApp",
  cita_confirmada: "Cita confirmada",
  cita_completada: "Cita completada",
  sin_respuesta: "Sin respuesta",
};

/**
 * Conversación con el bot unificado (antes: embudo del promotor
 * virtual, migración 008 eliminada 2026-11-26). Se conserva el tipo
 * para los datos viejos guardados en el navegador; ya no se crean
 * filas nuevas. La cita real vive en appointments con promoter_id.
 */
export interface PromoterConversation {
  id: string;
  organization_id: string;
  promoter_id: string;
  channel: "facebook" | "instagram" | "whatsapp";
  patient_name: string | null;
  patient_phone: string | null;
  treatment: string | null;
  status: ConversationStatus;
  appointment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  organization_id: string;
  name: string;
  duration_minutes: number;
  price: number;
  follow_up_days: number;
  active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  last_visit: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  organization_id: string;
  contact_id: string | null;
  service_id: string | null;
  promoter_id: string | null;
  /** Doctor que atiende la cita; null = sin asignar (ocupa la agenda general). */
  doctor_id: string | null;
  /** ISO local, ej. "2026-11-19T10:00:00" */
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  status: StatusType;
  source: SourceType;
  notes: string | null;
  /** Horarios que la clínica le propone al paciente cuando la cita está
   *  en pausa (doctor con anticipo). Texto libre, ej. "Miércoles 10:00
   *  o jueves 11:30". Solo se usa con citas en pausa. */
  proposed_times: string | null;
  whatsapp_confirmed: boolean;
  google_event_id: string | null;
  created_at: string;
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  google_calendar: "Google Calendar",
  excel_promoter: "Excel / Promotor",
  vincimia_link: "Link público",
  whatsapp_bot: "WhatsApp (Fase 2)",
};

export const STATUS_LABEL: Record<StatusType, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  conflict: "Conflicto",
  on_hold: "En pausa",
};

export function money(amount: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
