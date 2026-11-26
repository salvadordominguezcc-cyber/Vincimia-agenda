// Módulo de Reseñas — tipos y ayudas puras (sin imports de servidor).
// Las usan la página pública /resena/[slug], el panel
// /dashboard/resenas y el almacén demo (localStorage). Los datos reales
// viven en Supabase (migración 007: feedback + review_requests);
// en modo demo viven en el almacén local, con la misma forma.
// Sin reseñas de ejemplo: todo arranca vacío.

export interface FeedbackItem {
  id: string;
  organization_id: string;
  /** null = llegó por el QR de recepción, sin cita. */
  appointment_id: string | null;
  /** 1–5 estrellas. */
  rating: number;
  client_name: string | null;
  client_contact: string | null;
  /** null = calificación de 4–5 estrellas (se fue a Google). */
  comment: string | null;
  is_read: boolean;
  created_at: string;
}

export type ReviewRequestStatus = "queued" | "sent" | "failed" | "no_phone";

export interface ReviewRequest {
  id: string;
  organization_id: string;
  appointment_id: string | null;
  contact_id: string | null;
  phone: string | null;
  review_url: string;
  status: ReviewRequestStatus;
  whatsapp_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export const REVIEW_STATUS_LABEL: Record<ReviewRequestStatus, string> = {
  queued: "En cola",
  sent: "Enviada",
  failed: "Falló",
  no_phone: "Sin teléfono",
};

/** Link público de calificación de una organización. */
export function reviewUrlFor(
  origin: string,
  slug: string,
  appointmentId?: string | null
): string {
  const base = `${origin.replace(/\/$/, "")}/resena/${slug}`;
  return appointmentId ? `${base}?cita=${appointmentId}` : base;
}

/** Texto que se le manda al paciente por WhatsApp al completar su cita.
 *  El mismo texto en la nube y en el modo demo (para copiar a mano). */
export function reviewRequestText(
  orgName: string,
  patientName: string,
  reviewUrl: string
): string {
  return (
    `Hola ${patientName}, gracias por tu visita a ${orgName}. ` +
    `¿Cómo calificarías tu experiencia hoy? Califica aquí: ${reviewUrl} ` +
    `Tu opinión nos ayuda a mejorar.`
  );
}

export interface ReviewMetrics {
  total: number;
  average: number | null;
  unread: number;
  counts: Record<number, number>;
}

export function reviewMetrics(feedback: FeedbackItem[]): ReviewMetrics {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const f of feedback) {
    if (f.rating >= 1 && f.rating <= 5) counts[f.rating] += 1;
    sum += f.rating;
  }
  return {
    total: feedback.length,
    average: feedback.length > 0 ? sum / feedback.length : null,
    unread: feedback.filter((f) => !f.is_read).length,
    counts,
  };
}

export function newFeedbackId(): string {
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newReviewRequestId(): string {
  return `rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
