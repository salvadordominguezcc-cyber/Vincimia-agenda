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
  | "conflict";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  buffer_minutes: number;
  whatsapp_bot_enabled: boolean;
  google_calendar_sync: boolean;
  connected_google_email: string | null;
  google_calendar_id: string;
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
  /** ISO local, ej. "2026-11-19T10:00:00" */
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  status: StatusType;
  source: SourceType;
  notes: string | null;
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
