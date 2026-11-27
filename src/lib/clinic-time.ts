// Hora de la clínica: Mexicali vive en America/Tijuana (UTC-8 en
// invierno, UTC-7 en verano, con las reglas de horario de verano de
// EUA). Antes todo el código usaba America/Mexico_City con -06:00
// fijo (sin horario de verano desde 2022): una cita de las 16:00 se
// guardaba como las 22:00 UTC y se mostraba como las 22:00 en la
// tarjeta de WhatsApp, en la plantilla y en Google Calendar.
// Todo lo que toca horas de citas en el servidor pasa por aquí:
// nunca se recorta la hora de la cadena guardada (slice) para
// mostrarla, porque esa cadena es un instante UTC, no hora de pared.
// Solo servidor (rutas /api/* y sus libs): usa Intl, sin dependencias.

/** Zona horaria de las clínicas (Mexicali). */
export const CLINIC_TIME_ZONE = "America/Tijuana";

const zoneFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Desfase de la clínica respecto a UTC, en minutos, para un
 *  instante dado (negativo al oeste: -480 en invierno, -420 en
 *  verano). Calculado con Intl, así respeta el horario de verano. */
export function clinicOffsetMinutes(instant: Date): number {
  const parts: Record<string, number> = {};
  for (const p of zoneFmt.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/** Desfase como cadena "+HH:MM" / "-HH:MM" para un instante dado. */
export function clinicOffsetString(instant: Date): string {
  const min = clinicOffsetMinutes(instant);
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/** ¿La cadena trae desfase horario (Z o ±HH:MM)? Si no, es hora de
 *  pared de la clínica, como la guardan el panel y la hoja. */
function hasOffset(iso: string): boolean {
  return /([+-]\d{2}:?\d{2}|Z)$/i.test(iso.trim());
}

/** Hora de pared → instante: interpreta "2026-11-27T16:00:00" como
 *  las 16:00 de Mexicali. Converge en dos pasos para no fallar en el
 *  cambio de horario de verano. */
export function clinicWallToInstant(wallISO: string): Date {
  const m = wallISO.match(WALL_RE);
  if (!m) return new Date(wallISO);
  const [, y, mo, d, h, mi, s] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  const off1 = clinicOffsetMinutes(new Date(guess));
  const instant = new Date(guess - off1 * 60000);
  const off2 = clinicOffsetMinutes(instant);
  return off2 === off1 ? instant : new Date(guess - off2 * 60000);
}

/** Cadena (instante o pared) → instante. */
function toInstant(iso: string): Date {
  const clean = iso.trim();
  return hasOffset(clean) ? new Date(clean) : clinicWallToInstant(clean);
}

/** Instante (o ISO con desfase) → "YYYY-MM-DDTHH:MM:SS" en hora de
 *  pared de la clínica. Si ya es hora de pared (sin desfase), se
 *  devuelve tal cual. */
export function clinicWallISO(iso: string): string {
  const clean = iso.trim();
  if (!hasOffset(clean)) return clean.slice(0, 19);
  const d = new Date(clean);
  const wall = new Date(d.getTime() + clinicOffsetMinutes(d) * 60000);
  return wall.toISOString().slice(0, 19);
}

/** "2026-11-27T16:00:00" (hora de pared) → "2026-11-27T16:00:00-08:00"
 *  (o -07:00 en verano): el formato que Supabase entiende como la
 *  hora de la clínica. */
export function attachClinicOffset(wallISO: string): string {
  const wall = wallISO.slice(0, 19);
  return `${wall}${clinicOffsetString(clinicWallToInstant(wall))}`;
}

/** Rango de un día en hora de la clínica, con su desfase: para
 *  filtrar citas por fecha en Supabase. */
export function clinicDayRange(dateISO: string): { start: string; end: string } {
  const day = dateISO.slice(0, 10);
  return {
    start: attachClinicOffset(`${day}T00:00:00`),
    end: attachClinicOffset(`${day}T23:59:59`),
  };
}

const dayLongFmt = new Intl.DateTimeFormat("es-MX", {
  timeZone: CLINIC_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const time24Fmt = new Intl.DateTimeFormat("es-MX", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const time12Fmt = new Intl.DateTimeFormat("es-MX", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** Fecha larga en hora de la clínica, ej. "viernes, 27 de noviembre". */
export function formatClinicDate(iso: string): string {
  return dayLongFmt.format(toInstant(iso));
}

/** Hora "HH:MM" (24 h) en hora de la clínica, ej. "16:00". */
export function formatClinicTime(iso: string): string {
  return time24Fmt.format(toInstant(iso));
}

/** Hora en 12 h en hora de la clínica, ej. "04:00 p. m.". */
export function formatClinicTime12(iso: string): string {
  return time12Fmt.format(toInstant(iso));
}

/** Fecha "YYYY-MM-DD" de la cita en hora de la clínica. */
export function clinicDateOf(iso: string): string {
  return clinicWallISO(iso).slice(0, 10);
}

/** Hora "HH:MM" de la cita en hora de la clínica. */
export function clinicTimeOf(iso: string): string {
  return clinicWallISO(iso).slice(11, 16);
}
