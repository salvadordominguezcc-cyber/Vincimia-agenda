// Aviso al servidor cuando cambia el estado de una cita en el panel.
// El panel guarda sus datos en el aparato; el servidor solo puede
// avisar a Google Calendar y a WhatsApp cuando la cita existe en la
// nube (semilla, Sheets o citas del servidor). Si la cita solo existe
// en el aparato, el servidor responde 404 y no pasa nada: el panel
// sigue funcionando en local y el mensaje para copiar a mano sigue ahí.
// Se llama sin esperar respuesta (fire-and-forget) para no frenar la
// agenda si la nube o los canales tardan.

import type { StatusType } from "./types";

export function notifyAppointmentStatus(
  organizationId: string,
  secret: string,
  appointmentId: string,
  status: StatusType
): void {
  if (!organizationId || !secret || !appointmentId) return;
  if (status !== "confirmed" && status !== "cancelled" && status !== "completed") return;
  fetch("/api/appointments/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ organization_id: organizationId, appointment_id: appointmentId, status }),
  }).catch(() => undefined);
}

/** Guarda en la nube si la tarjeta de la cita ya se reenvió al grupo
 *  de WhatsApp de promotores. Fire-and-forget, como el cambio de
 *  estado: si la cita solo vive en el aparato, o la columna
 *  group_notified aún no está aplicada en Supabase (migración 012),
 *  el servidor responde con error y el valor se queda solo en este
 *  aparato. */
export function notifyGroupNoticed(
  organizationId: string,
  secret: string,
  appointmentId: string,
  notified: boolean
): void {
  if (!organizationId || !secret || !appointmentId) return;
  fetch("/api/appointments/group-notice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      organization_id: organizationId,
      appointment_id: appointmentId,
      group_notified: notified,
    }),
  }).catch(() => undefined);
}
