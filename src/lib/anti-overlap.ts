// Motor anti-empalmes — la regla de negocio central del Documento Maestro.
// Una cita nueva (inicio + duración) choca con una existente si sus intervalos,
// ampliados con el buffer configurable, se traslapan.
// Solo bloquean las citas pending / confirmed / completed. Las citas en
// conflict o cancelled NO bloquean (son registro, no ocupación real), y
// las citas en pausa (on_hold, doctor con anticipo) TAMPOCO bloquean:
// quedan en espera hasta que la clínica las confirme.
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
  excludeId?: string,
  doctorId?: string | null
): Appointment | null {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  for (const appt of existing) {
    if (excludeId && appt.id === excludeId) continue;
    if (!BLOCKING_STATUSES.includes(appt.status)) continue;
    // Agendas paralelas: una cita solo empalma con las del mismo doctor.
    // Una cita sin doctor asignado ocupa la agenda general y empalma con
    // todas; una cita con doctor no choca con la de otro doctor.
    if (doctorId) {
      if (appt.doctor_id && appt.doctor_id !== doctorId) continue;
    }
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

/** ¿La cita (inicio + duración) choca con el tiempo de descanso de la
 *  clínica? El descanso es el mismo todos los días. */
export function overlapsBreak(
  startISO: string,
  durationMinutes: number,
  breakStart: string | null,
  breakEnd: string | null
): boolean {
  if (!breakStart || !breakEnd) return false;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const start = toMin(startISO.slice(11, 16));
  const end = start + durationMinutes;
  return start < toMin(breakEnd) && toMin(breakStart) < end;
}

/** Última hora de INICIO de cita en la mañana (12:00) y en la tarde
 *  (17:00): para alcanzar a terminar y cerrar a tiempo. Una cita de
 *  30 min que empieza a las 12:00 termina 12:30 (antes de la comida
 *  de las 13:00) y una que empieza a las 17:00 termina 17:30 (antes
 *  del cierre de las 18:00). Mismo tope que la hoja de promotores,
 *  que no tiene huecos después de las 12:00 ni de las 17:00.
 *  El tope es sobre la hora de inicio: una cita larga que empieza
 *  a las 12:00 y se metería en la comida sigue bloqueada por el
 *  chequeo de descanso (overlapsBreak), no por este tope. */
export const LAST_START_MORNING = "12:00";
export const LAST_START_AFTERNOON = "17:00";

/** ¿Esa hora de inicio (HH:MM) pasa la última cita del día? La
 *  mañana es antes del descanso y la tarde después; sin descanso
 *  configurado se usa 13:00–14:00. Un inicio dentro del descanso
 *  devuelve false aquí: lo bloquea el chequeo de descanso. */
export function startAfterLastAllowed(
  hhmm: string,
  breakStart: string | null,
  breakEnd: string | null
): boolean {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const start = toMin(hhmm);
  const bs = breakStart ? toMin(breakStart) : 13 * 60;
  const be = breakEnd ? toMin(breakEnd) : 14 * 60;
  if (start < bs) return start > toMin(LAST_START_MORNING);
  if (start >= be) return start > toMin(LAST_START_AFTERNOON);
  return false;
}

/** Horas de inicio libres para un día, cada 30 min entre 09:00 y 14:00.
 *  Si se pasa un horario de doctor, solo se ofrecen horas dentro de su
 *  horario de ese día (y hasta las 20:00 como máximo). En ningún caso se
 *  ofrecen horas que choquen con el tiempo de descanso de la clínica. */
export function freeSlots(
  dateISO: string,
  durationMinutes: number,
  existing: Appointment[],
  bufferMinutes: number,
  doctorSchedule?: { weekday: number; start: string; end: string; active: boolean }[] | null,
  doctorId?: string | null,
  breakWindow?: { start: string | null; end: string | null } | null
): string[] {
  const slots: string[] = [];
  const weekday = new Date(`${dateISO}T12:00:00`).getDay();
  let fromH = 9;
  let toH = 14;
  const blockedByBreak = (hhmm: string) =>
    !!breakWindow &&
    overlapsBreak(`${dateISO}T${hhmm}:00`, durationMinutes, breakWindow.start, breakWindow.end);
  // Última cita del día: en la mañana no se ofrece nada que empiece
  // después de las 12:00, en la tarde nada después de las 17:00.
  const pastLastStart = (hhmm: string) =>
    startAfterLastAllowed(hhmm, breakWindow?.start ?? null, breakWindow?.end ?? null);
  if (doctorSchedule) {
    const day = doctorSchedule.find((d) => d.weekday === weekday && d.active);
    if (!day) return [];
    fromH = Number(day.start.slice(0, 2));
    toH = Math.min(20, Number(day.end.slice(0, 2)));
    // Si el horario termina a las :30, permitir la última media hora.
    const endMin = Number(day.end.slice(3, 5));
    for (let h = fromH; h <= toH; h++) {
      for (const m of [0, 30]) {
        if (h === toH && m > endMin - durationMinutes && endMin !== 0) {
          // La cita debe terminar antes de que cierre el horario.
          if (h * 60 + m + durationMinutes > toH * 60 + endMin) continue;
        }
        if (h === toH && endMin === 0 && m === 30) continue;
        if (h * 60 + m + durationMinutes > toH * 60 + endMin) continue;
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        const startISO = `${dateISO}T${hh}:${mm}:00`;
        if (pastLastStart(`${hh}:${mm}`)) continue;
        if (blockedByBreak(`${hh}:${mm}`)) continue;
        if (
          !findConflict(startISO, durationMinutes, existing, bufferMinutes, undefined, doctorId)
        ) {
          slots.push(`${hh}:${mm}`);
        }
      }
    }
    return slots;
  }
  for (let h = fromH; h <= toH; h++) {
    for (const m of [0, 30]) {
      if (h === 14 && m === 30) continue;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const startISO = `${dateISO}T${hh}:${mm}:00`;
      if (pastLastStart(`${hh}:${mm}`)) continue;
      if (blockedByBreak(`${hh}:${mm}`)) continue;
      if (
        !findConflict(startISO, durationMinutes, existing, bufferMinutes, undefined, doctorId)
      ) {
        slots.push(`${hh}:${mm}`);
      }
    }
  }
  return slots;
}
