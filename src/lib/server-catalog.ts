// Catálogo en la nube — servicios, doctores, promotores y datos del
// negocio (src/lib/server-catalog.ts).
//
// Por qué existe: el panel guardaba servicios y promotores solo en el
// aparato, y doctores/ajustes con el cliente anon (RLS, que falla en
// silencio). Por eso el servicio "Valoracion" (30 min) existía solo en
// el teléfono y la nube adivinaba 45 min al reservar por el link.
// Estas ayudas usan la service_role en el servidor con el mismo auth
// Bearer <excel_webhook_secret> que las rutas de citas, así cada cambio
// en el panel (agregar, editar, pausar, borrar) se guarda también en
// Supabase y el link, el anti-empalme y Google Calendar usan los
// mismos datos. No hace falta ninguna migración: las tablas services,
// doctors y organizations ya tienen estas columnas.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ServerCatalogClient = SupabaseClient;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPECIALTIES = [
  "general",
  "ortodoncia_general",
  "endodoncista",
  "endodoncista_general",
  "ortopediatra",
] as const;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Secreto del negocio: el mismo que usan las rutas de citas. */
export async function verifyOrgSecret(
  supabase: SupabaseClient,
  organizationId: string,
  secret: string
): Promise<boolean> {
  if (!organizationId || !secret) return false;
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  return !!data;
}

export function authSecret(req: Request): string {
  return (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

/** Nombre sin acentos, en minúsculas y sin espacios de más: para
 *  encontrar "Valoracion" aunque en la nube se llame "Valoración". */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cleanSchedule(value: unknown): { weekday: number; start: string; end: string; active: boolean }[] | null {
  if (!Array.isArray(value)) return null;
  const days: { weekday: number; start: string; end: string; active: boolean }[] = [];
  for (const d of value as Record<string, unknown>[]) {
    if (typeof d !== "object" || d === null) return null;
    const weekday = Number(d.weekday);
    const start = String(d.start ?? "");
    const end = String(d.end ?? "");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
    days.push({ weekday, start, end, active: Boolean(d.active) });
  }
  return days;
}

export interface ServiceInput {
  id?: string | null;
  name: string;
  duration_minutes?: number;
  price?: number;
  follow_up_days?: number;
  active?: boolean;
}

export interface DoctorInput {
  id?: string | null;
  name: string;
  specialty?: string;
  color?: string;
  requires_deposit?: boolean;
  schedule?: unknown;
  active?: boolean;
}

export interface OrgSettingsInput {
  name?: string;
  slug?: string;
  buffer_minutes?: number;
  break_start?: string | null;
  break_end?: string | null;
  connected_google_email?: string | null;
  /** Dirección y horario de atención (migración 011). Si esas
   *  columnas aún no existen en la nube, se guardan los demás
   *  datos y estas dos quedan pendientes (ver updateOrgSettings). */
  address?: string | null;
  hours_text?: string | null;
}

type UpsertResult =
  | { ok: true; row: Record<string, unknown>; created: boolean }
  | { ok: false; error: string };

/** Busca una fila por id (UUID que ya existe) o por nombre
 *  normalizado, para no duplicar "Valoracion" / "Valoración". */
async function findByIdOrName(
  supabase: SupabaseClient,
  table: "services" | "doctors",
  organizationId: string,
  id: string | null | undefined,
  name: string
): Promise<Record<string, unknown> | null> {
  if (id && UUID_RE.test(id)) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (data) return data as Record<string, unknown>;
  }
  const { data: rows } = await supabase
    .from(table)
    .select("*")
    .eq("organization_id", organizationId);
  const wanted = normalizeName(name);
  return (
    ((rows ?? []) as Record<string, unknown>[]).find(
      (r) => normalizeName(String(r.name ?? "")) === wanted
    ) ?? null
  );
}

export async function upsertService(
  supabase: SupabaseClient,
  organizationId: string,
  input: ServiceInput
): Promise<UpsertResult> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Falta el nombre del servicio." };
  const row = {
    organization_id: organizationId,
    name,
    duration_minutes: clampInt(input.duration_minutes, 5, 480, 45),
    price: Math.max(0, Number(input.price) || 0),
    follow_up_days: clampInt(input.follow_up_days, 0, 365, 30),
    active: input.active !== false,
  };
  const existing = await findByIdOrName(supabase, "services", organizationId, input.id, name);
  if (existing) {
    const { data, error } = await supabase
      .from("services")
      .update(row)
      .eq("id", String(existing.id))
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as Record<string, unknown>, created: false };
  }
  const { data, error } = await supabase
    .from("services")
    .insert({ ...row, ...(input.id && UUID_RE.test(input.id) ? { id: input.id } : {}) })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as Record<string, unknown>, created: true };
}

export async function deleteService(
  supabase: SupabaseClient,
  organizationId: string,
  serviceId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("organization_id", organizationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertDoctor(
  supabase: SupabaseClient,
  organizationId: string,
  input: DoctorInput
): Promise<UpsertResult> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Falta el nombre del doctor." };
  const specialty = (SPECIALTIES as readonly string[]).includes(String(input.specialty))
    ? String(input.specialty)
    : "general";
  const color =
    typeof input.color === "string" && /^#[0-9a-fA-F]{6}$/.test(input.color)
      ? input.color
      : "#dc2626";
  const schedule = cleanSchedule(input.schedule);
  if (input.schedule !== undefined && schedule === null) {
    return { ok: false, error: "El horario del doctor no es válido." };
  }
  const row = {
    organization_id: organizationId,
    name,
    specialty,
    color,
    requires_deposit: Boolean(input.requires_deposit),
    schedule: schedule ?? [],
    active: input.active !== false,
  };
  const existing = await findByIdOrName(supabase, "doctors", organizationId, input.id, name);
  if (existing) {
    const { data, error } = await supabase
      .from("doctors")
      .update(row)
      .eq("id", String(existing.id))
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as Record<string, unknown>, created: false };
  }
  const { data, error } = await supabase
    .from("doctors")
    .insert({ ...row, ...(input.id && UUID_RE.test(input.id) ? { id: input.id } : {}) })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as Record<string, unknown>, created: true };
}

/** Actualiza los datos del negocio (Ajustes). Devuelve
 *  { ok:false, error:"slug-taken" } si el enlace ya lo usa otro
 *  negocio, para que el panel lo diga en palabras normales.
 *  Resistencia a la migración 011: si las columnas address /
 *  hours_text aún no existen en la nube (error 42703), se guardan
 *  los demás datos y se devuelve pending_columns con esas dos, para
 *  que el panel avise que quedaron en este aparato hasta aplicar
 *  la migración. Nunca se pierde el resto del guardado por eso. */
export async function updateOrgSettings(
  supabase: SupabaseClient,
  organizationId: string,
  input: OrgSettingsInput
): Promise<
  | { ok: true; row: Record<string, unknown>; pending_columns?: string[] }
  | { ok: false; error: string }
> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) return { ok: false, error: "Falta el nombre del negocio." };
    patch.name = name;
  }
  if (input.slug !== undefined) {
    const slug = String(input.slug).trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return { ok: false, error: "El enlace solo puede tener letras minúsculas, números y guiones." };
    }
    patch.slug = slug;
  }
  if (input.buffer_minutes !== undefined) {
    patch.buffer_minutes = clampInt(input.buffer_minutes, 0, 120, 15);
  }
  if (input.break_start !== undefined || input.break_end !== undefined) {
    const start = input.break_start ? String(input.break_start).trim() : null;
    const end = input.break_end ? String(input.break_end).trim() : null;
    if ((start && !end) || (!start && end)) {
      return { ok: false, error: "Para el tiempo de descanso pon la hora de inicio y la de fin, o deja las dos vacías." };
    }
    if (start && !TIME_RE.test(start)) return { ok: false, error: "La hora de inicio del descanso no es válida." };
    if (end && !TIME_RE.test(end)) return { ok: false, error: "La hora de fin del descanso no es válida." };
    if (start && end && end <= start) {
      return { ok: false, error: "La hora de fin del descanso debe ser después de la de inicio." };
    }
    patch.break_start = start;
    patch.break_end = end;
  }
  if (input.connected_google_email !== undefined) {
    const email = String(input.connected_google_email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Ese correo de Google Calendar no se ve válido." };
    }
    patch.connected_google_email = email || null;
  }
  if (input.address !== undefined) {
    patch.address = String(input.address ?? "").trim() || null;
  }
  if (input.hours_text !== undefined) {
    patch.hours_text = String(input.hours_text ?? "").trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No hay nada que guardar." };
  }
  const fullSelect =
    "id, name, slug, buffer_minutes, break_start, break_end, connected_google_email, google_calendar_sync, whatsapp_bot_enabled, vincimia_confirmations_enabled, address, hours_text";
  const legacySelect =
    "id, name, slug, buffer_minutes, break_start, break_end, connected_google_email, google_calendar_sync, whatsapp_bot_enabled, vincimia_confirmations_enabled";
  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", organizationId)
    .select(fullSelect)
    .single();
  if (!error) {
    return { ok: true, row: data as Record<string, unknown> };
  }
  if ((error as { code?: string }).code === "23505") {
    return { ok: false, error: "slug-taken" };
  }
  // Columna de la migración 011 aún no aplicada: reintentar sin
  // address/hours_text para no perder el resto del guardado.
  const missingColumn =
    (error as { code?: string }).code === "42703" ||
    /address|hours_text/.test(String((error as { message?: string }).message ?? ""));
  if (missingColumn && ("address" in patch || "hours_text" in patch)) {
    const { address: _a, hours_text: _h, ...legacyPatch } = patch;
    if (Object.keys(legacyPatch).length === 0) {
      return { ok: false, error: "pending-migration-011" };
    }
    const retry = await supabase
      .from("organizations")
      .update(legacyPatch)
      .eq("id", organizationId)
      .select(legacySelect)
      .single();
    if (retry.error) {
      if ((retry.error as { code?: string }).code === "23505") {
        return { ok: false, error: "slug-taken" };
      }
      return { ok: false, error: retry.error.message };
    }
    return {
      ok: true,
      row: retry.data as Record<string, unknown>,
      pending_columns: ["address", "hours_text"],
    };
  }
  return { ok: false, error: error.message };
}

/** Lee la fila del negocio para el catálogo (panel o link). Prueba
 *  con las columnas de la migración 011 y, si aún no existen en la
 *  nube, reintenta con la lista anterior: la sincronización del
 *  catálogo nunca debe romperse por una columna nueva. */
export async function fetchOrgForCatalog(
  supabase: SupabaseClient,
  field: "id" | "slug",
  value: string
): Promise<Record<string, unknown> | null> {
  const fullSelect =
    "id, name, slug, buffer_minutes, break_start, break_end, connected_google_email, google_calendar_sync, whatsapp_bot_enabled, vincimia_confirmations_enabled, address, hours_text";
  const legacySelect =
    "id, name, slug, buffer_minutes, break_start, break_end, connected_google_email, google_calendar_sync, whatsapp_bot_enabled, vincimia_confirmations_enabled";
  const first = await supabase
    .from("organizations")
    .select(fullSelect)
    .eq(field, value)
    .single();
  if (first.data) return first.data as Record<string, unknown>;
  if (!first.error) return null;
  const missingColumn =
    (first.error as { code?: string }).code === "42703" ||
    /address|hours_text/.test(String((first.error as { message?: string }).message ?? ""));
  if (!missingColumn) return null;
  const retry = await supabase
    .from("organizations")
    .select(legacySelect)
    .eq(field, value)
    .single();
  return (retry.data as Record<string, unknown> | null) ?? null;
}
