// Gestión de usuarios — Vincimia Agenda, igual que en el POS de EL RODEO.
// Solo lado del servidor. La service_role NUNCA sale del servidor.
// Roles: owner / admin / member (ver memberships en supabase/schema.sql).
// El admin es salvadordominguezcc@gmail.com o user_metadata.role admin/owner.
// - GET ?username=<usuario>: RESOLUCIÓN pública y limitada, devuelve SOLO
//   el correo de ese usuario para que el login pueda entrar con usuario +
//   contraseña. Si no existe, responde el mismo error genérico, sin revelar
//   si existe. Límite: 20 intentos por minuto por IP.
// - GET sin ?username: lista de usuarios, solo admin.
// - POST: crear usuario { email?, password, role?, username? }. El correo
//   es opcional: basta correo o usuario. Sin correo real se genera
//   `<usuario>@vincimia.local` con user_metadata { role, username,
//   internal_email: true } y email_confirm para entrar de inmediato.
// - PATCH: cambiar rol, activar/desactivar, nombre de usuario y
//   restablecer contraseña { id, action: "reset_password", password }.
//   No se puede cambiar rol/bloqueo ni restablecer la contraseña de la
//   propia cuenta ni del admin principal; el nombre de usuario SÍ se puede
//   asignar o cambiar en cualquier cuenta, porque es solo un alias.
// - DELETE: eliminar usuario, sin borrar la propia cuenta ni la del admin.
export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  INTERNAL_EMAIL_DOMAIN,
  internalEmailFor,
  isInternalEmail,
  normalizeUsername,
  usernameValid,
} from "@/lib/username";

const ADMIN_EMAIL = "salvadordominguezcc@gmail.com";
type Role = "owner" | "admin" | "member";

function serviceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url.startsWith("https://") || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function callerIsAdmin(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url.startsWith("https://") || !anon) return null;
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const role = (data.user.user_metadata as Record<string, unknown> | null)?.role;
  const isAdmin = data.user.email.toLowerCase() === ADMIN_EMAIL || role === "admin" || role === "owner";
  return isAdmin ? data.user : null;
}

function forbidden() {
  return NextResponse.json({ code: "FORBIDDEN", message: "Solo el administrador puede gestionar usuarios." }, { status: 403 });
}
function serviceKeyMissing() {
  return NextResponse.json({ code: "SERVICE_ROLE_MISSING", message: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. Sin ella no se pueden administrar usuarios." }, { status: 503 });
}
function bad(message: string, status = 400) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status });
}
function supabaseError(message: string, status = 500) {
  return NextResponse.json({ code: "SUPABASE_ERROR", message }, { status });
}
function translateCreateError(message: string) {
  if (message.includes("User already registered")) return "Ya existe un usuario con ese correo.";
  if (message.toLowerCase().includes("password")) return "La contraseña no es válida: debe tener al menos 6 caracteres.";
  if (message.toLowerCase().includes("email")) return "El correo no es válido.";
  return "No se pudo crear el usuario: " + message;
}

async function findUserByUsername(admin: NonNullable<ReturnType<typeof serviceAdmin>>, username: string) {
  const wanted = normalizeUsername(username);
  if (!wanted) return null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const hit = (data.users || []).find(
      (u) => normalizeUsername((u.user_metadata as Record<string, unknown> | null)?.username) === wanted
    );
    if (hit) return hit;
    if ((data.users || []).length < 100) break;
  }
  return null;
}

const resolveAttempts = new Map<string, number[]>();
function resolveRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (resolveAttempts.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 20) { resolveAttempts.set(ip, list); return true; }
  list.push(now); resolveAttempts.set(ip, list); return false;
}

const LOGIN_GENERIC_ERROR = "Correo, nombre de usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.";

function isInternalUser(u: { email?: string | null; user_metadata?: Record<string, unknown> | null }): boolean {
  return (u.user_metadata as Record<string, unknown> | null)?.internal_email === true || isInternalEmail(u.email);
}
function roleOf(email: string | undefined | null, metadata: unknown): Role {
  if (email?.toLowerCase() === ADMIN_EMAIL) return "owner";
  const r = (metadata as Record<string, unknown> | null)?.role;
  return r === "admin" || r === "owner" ? (r as Role) : "member";
}

export async function GET(req: NextRequest) {
  const usernameParam = req.nextUrl.searchParams.get("username");
  if (usernameParam !== null) {
    const username = normalizeUsername(usernameParam);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    if (resolveRateLimited(ip) || !usernameValid(username)) {
      return NextResponse.json({ code: "LOGIN_FAILED", message: LOGIN_GENERIC_ERROR }, { status: 404 });
    }
    const admin = serviceAdmin();
    if (!admin) return NextResponse.json({ code: "LOGIN_FAILED", message: LOGIN_GENERIC_ERROR }, { status: 404 });
    try {
      const hit = await findUserByUsername(admin, username);
      if (!hit?.email) return NextResponse.json({ code: "LOGIN_FAILED", message: LOGIN_GENERIC_ERROR }, { status: 404 });
      return NextResponse.json({ email: hit.email });
    } catch {
      return NextResponse.json({ code: "LOGIN_FAILED", message: LOGIN_GENERIC_ERROR }, { status: 404 });
    }
  }
  const caller = await callerIsAdmin(req);
  if (!caller) return forbidden();
  const admin = serviceAdmin();
  if (!admin) return serviceKeyMissing();
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) return supabaseError("No se pudo listar los usuarios: " + error.message);
    const users = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      username: normalizeUsername((u.user_metadata as Record<string, unknown> | null)?.username) || null,
      internal_email: isInternalUser(u),
      role: roleOf(u.email, u.user_metadata),
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned_until: u.banned_until ?? null,
    }));
    return NextResponse.json({ users });
  } catch (e: unknown) {
    return supabaseError("No se pudo listar los usuarios: " + (e instanceof Error ? e.message : String(e)));
  }
}

export async function POST(req: NextRequest) {
  const caller = await callerIsAdmin(req);
  if (!caller) return forbidden();
  const admin = serviceAdmin();
  if (!admin) return serviceKeyMissing();
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role: Role = body.role === "admin" || body.role === "owner" ? body.role : "member";
  const username = normalizeUsername(body.username);
  if (!email && !username) return bad("Escribe el correo o el nombre de usuario del nuevo usuario (al menos uno de los dos).");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Escribe un correo válido.");
  if (password.length < 6) return bad("La contraseña debe tener al menos 6 caracteres.");
  if (username && !usernameValid(username)) return bad("El nombre de usuario debe tener al menos 3 caracteres y solo puede usar letras, números, guion bajo (_) y punto (.), sin espacios.");
  const internalEmail = !email;
  const finalEmail = internalEmail ? internalEmailFor(username) : email;
  try {
    if (username) {
      const taken = await findUserByUsername(admin, username);
      if (taken) return bad("Ese nombre de usuario ya está en uso. Elige otro.");
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
      user_metadata: internalEmail ? { role, username, internal_email: true } : username ? { role, username } : { role },
    });
    if (error) {
      if (error.message.includes("User already registered") && internalEmail) return supabaseError("Ese nombre de usuario ya está en uso. Elige otro.", 400);
      return supabaseError(translateCreateError(error.message), 400);
    }
    return NextResponse.json({ ok: true, id: data.user?.id ?? null, internal_email: internalEmail });
  } catch (e: unknown) {
    return supabaseError("No se pudo crear el usuario: " + (e instanceof Error ? e.message : String(e)));
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await callerIsAdmin(req);
  if (!caller) return forbidden();
  const admin = serviceAdmin();
  if (!admin) return serviceKeyMissing();
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return bad("Falta el id del usuario.");
  if (body.action === "reset_password") {
    const password = String(body.password || "");
    if (password.length < 6) return bad("La nueva contraseña debe tener al menos 6 caracteres.");
    if (id === caller.id) return bad("Tu propia contraseña no se puede restablecer desde aquí: cámbiala desde Supabase (Authentication → Users).");
    try {
      const { data: target, error: getErr } = await admin.auth.admin.getUserById(id);
      if (getErr || !target.user) return bad("Usuario no encontrado.", 404);
      if (target.user.email?.toLowerCase() === ADMIN_EMAIL) return bad("La contraseña de la cuenta admin principal no se puede restablecer desde aquí: cámbiala desde Supabase (Authentication → Users).");
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return supabaseError("No se pudo restablecer la contraseña: " + error.message);
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      return supabaseError("No se pudo restablecer la contraseña: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  const hasRole = typeof body.role === "string";
  const hasBanned = typeof body.banned === "boolean";
  const hasUsername = typeof body.username === "string";
  if (!hasRole && !hasBanned && !hasUsername) return bad("No hay nada que cambiar.");
  const isSelf = id === caller.id;
  if ((hasRole || hasBanned) && isSelf) return bad("No puedes cambiar tu propia cuenta desde aquí.");
  try {
    const { data: target, error: getErr } = await admin.auth.admin.getUserById(id);
    if (getErr || !target.user) return bad("Usuario no encontrado.", 404);
    const isAdminPrincipal = target.user.email?.toLowerCase() === ADMIN_EMAIL;
    if ((hasRole || hasBanned) && isAdminPrincipal) return bad("La cuenta admin principal no se puede modificar desde aquí.");
    const targetInternal = isInternalUser(target.user);
    const meta: Record<string, unknown> = { ...(target.user.user_metadata || {}) };
    let newInternalEmail: string | null = null;
    if (hasUsername) {
      const username = normalizeUsername(body.username);
      if (username && !usernameValid(username)) return bad("El nombre de usuario debe tener al menos 3 caracteres y solo puede usar letras, números, guion bajo (_) y punto (.), sin espacios.");
      if (!username && targetInternal) return bad("Esta cuenta no tiene correo real: necesita un nombre de usuario para entrar. Ponle un usuario en lugar de quitarlo.");
      if (username) {
        const taken = await findUserByUsername(admin, username);
        if (taken && taken.id !== id) return bad("Ese nombre de usuario ya está en uso. Elige otro.");
        if (targetInternal) newInternalEmail = internalEmailFor(username);
      }
      meta.username = username || null;
    }
    if (hasRole) meta.role = body.role === "admin" || body.role === "owner" ? body.role : "member";
    if (hasUsername || hasRole) {
      const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: meta, ...(newInternalEmail ? { email: newInternalEmail } : {}) });
      if (error) return supabaseError("No se pudo actualizar el usuario: " + error.message);
    }
    if (hasBanned) {
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: body.banned ? "87600h" : "none" });
      if (error) return supabaseError("No se pudo " + (body.banned ? "desactivar" : "activar") + " al usuario: " + error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return supabaseError("No se pudo actualizar el usuario: " + (e instanceof Error ? e.message : String(e)));
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await callerIsAdmin(req);
  if (!caller) return forbidden();
  const admin = serviceAdmin();
  if (!admin) return serviceKeyMissing();
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || req.nextUrl.searchParams.get("id") || "");
  if (!id) return bad("Falta el id del usuario.");
  if (id === caller.id) return bad("No puedes eliminar tu propia cuenta.");
  try {
    const { data: target } = await admin.auth.admin.getUserById(id);
    if (target.user?.email?.toLowerCase() === ADMIN_EMAIL) return bad("La cuenta admin principal no se puede eliminar.");
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return supabaseError("No se pudo eliminar el usuario: " + error.message);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return supabaseError("No se pudo eliminar el usuario: " + (e instanceof Error ? e.message : String(e)));
  }
}
