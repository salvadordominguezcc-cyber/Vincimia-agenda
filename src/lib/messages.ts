// Textos que se le mandan al paciente — palabras normales, sin jerga.
// Este es el texto de confirmación que la clínica le manda al cliente
// (hoy se copia a mano a WhatsApp; en la Fase 2 lo mandará el bot de
// WhatsApp solo, con este mismo texto).
// Regla que pidió Salvador: si es la primera vez que viene el paciente,
// se le recomienda llegar 15 minutos antes para llenar su historial
// clínico. Si ya había venido, no hace falta ese aviso.

import {
  contactName,
  doctorName,
  isFirstVisit,
  serviceName,
  fmtTime,
  type StoreData,
} from "./store";
import { reviewRequestText } from "./reviews";
import type { Appointment } from "./types";

const dayFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Texto de confirmación de una cita, listo para mandar por WhatsApp. */
export function confirmationMessage(data: StoreData, appt: Appointment): string {
  const name = contactName(data, appt.contact_id);
  const service = serviceName(data, appt.service_id);
  const doctor = appt.doctor_id ? doctorName(data, appt.doctor_id) : null;
  const date = dayFmt.format(new Date(`${appt.start_time.slice(0, 10)}T12:00:00`));
  const time = fmtTime(appt.start_time);
  const first = isFirstVisit(data, appt);

  let text =
    `Hola ${name}, tu cita en ${data.org.name} está confirmada: ` +
    `${service}${doctor ? ` con ${doctor}` : ""} el ${date} a las ${time}.`;
  if (first) {
    text +=
      " Te recomendamos llegar 15 minutos antes para llenar tu historial clínico.";
  } else {
    text += " Te esperamos.";
  }
  return text;
}

/** Texto de solicitud de reseña al completar la cita, listo para mandar
 *  por WhatsApp (o copiar a mano en modo demo). Mismo texto que la nube. */
export function reviewRequestMessage(
  data: StoreData,
  appt: Appointment,
  reviewUrl: string
): string {
  return reviewRequestText(
    data.org.name,
    contactName(data, appt.contact_id),
    reviewUrl
  );
}

/**
 * Ventana de envío de cada canal, en palabras normales. Los 3 canales
 * de Meta solo dejan mandar texto libre si la persona escribió en las
 * últimas 24 horas; fuera de esa ventana hace falta plantilla
 * (WhatsApp) o etiqueta de agente humano (Messenger / Instagram),
 * que todavía no está implementada. Por eso /api/inbox/send puede
 * fallar con el error de Meta aunque el canal esté conectado.
 */
export function sendWindowNote(
  channel: "whatsapp" | "facebook" | "instagram"
): string {
  if (channel === "whatsapp") {
    return "Texto libre solo si el paciente escribió en las últimas 24 horas; fuera de esa ventana se usa la plantilla aprobada.";
  }
  if (channel === "facebook") {
    return "Messenger: texto libre solo si la persona escribió en las últimas 24 horas; fuera de esa ventana hace falta la etiqueta de agente humano.";
  }
  return "Instagram: texto libre solo si la persona escribió en las últimas 24 horas; fuera de esa ventana hace falta la etiqueta de agente humano.";
}
