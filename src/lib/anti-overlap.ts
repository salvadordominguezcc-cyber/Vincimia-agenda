// Motor anti-empalmes — la regla de negocio central del Documento Maestro.
// Una cita nueva (inicio + duración) choca con una existente si sus intervalos,
// ampliados con el buffer configurable, se traslapan.
// Solo bloquean las citas pending / confirmed / completed. Las citas en
// conflict o cancelled NO bloquean (son registro, no ocupación real).
// La misma función la usan la Agenda, Nueva cita, el link público y el
// webhook de Sheets, para que el criterio sea idéntico en las 3 fuentes.

import type { Appointment } from "./types";

export const BLOCKING_STATUSES: Appointment["status"][] = [
  "pending",
  "confirmed",
  "completed",
];

export function endWithBuffer(end: Date, bufferMinutes: number): Date {
  return new Date(end.getTime() + bufferMinutes * 60_000);
}

/** ¿Los intervalos [aStart, aEnd+buffer) y [bStart, bEnd+buffer) se traslapan? */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  bufferMinutes: number
): boolean {
  const aEndBuf = endWithBuffer(aEnd, bufferMinutes);
  const bEndBuf = endWithBuffer(bEnd, bufferMinutes);
  return aStart < bEndBuf && bStart < aEndBuf;
}

export function findConflict(
  startISO: string,
  durationMinutes: number,
  existing: Appointment[],
  bufferMinutes: number,
  excludeId?: string
): Appointment | null {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  for (const appt of existing) {
    if (excludeId && appt.id === excludeId) continue;
    if (!BLOCKING_STATUSES.includes(appt.status)) continue;
    if (
      intervalsOverlap(
        start,
        end,
        new Date(appt.start_time),
        new Date(appt.end_time),
        bufferMinutes
      )
    ) {
      return appt;
    }
  }
  return null;
}

/** Horas de inicio libres para un día, cada 30 min entre 09:00 y 14:00. */
export function freeSlots(
  dateISO: string,
  durationMinutes: number,
  existing: Appointment[],
  bufferMinutes: number
): string[] {
  const slots: string[] = [];
  for (let h = 9; h <= 14; h++) {
    for (const m of [0, 30]) {
      if (h === 14 && m === 30) continue;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const startISO = `${dateISO}T${hh}:${mm}:00`;
      if (!findConflict(startISO, durationMinutes, existing, bufferMinutes)) {
        slots.push(`${hh}:${mm}`);
      }
    }
  }
  return slots;
}
