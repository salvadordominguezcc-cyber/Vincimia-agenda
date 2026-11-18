// Autenticación con Supabase Auth (correo + contraseña) — Vincimia Agenda.
//
// DECISIÓN DEL MVP PILOTO (2026-11-18): cuando un usuario se registra o
// entra por primera vez y no tiene ninguna membresía, se le da acceso a la
// Org #1 existente (Clínica Dental Sonrisa, DEMO_ORG_ID), que es la
// organización piloto de las clínicas de Salvador. NO se crea una
// organización nueva por usuario en este paso: eso llega con la Fase 4
// (SaaS con registro y cobro), donde cada negocio crea la suya. Los datos
// demo no se borran.
//
// Por qué la membresía se crea en /api/auth/membership y no desde el
// navegador: el esquema (supabase/schema.sql) tiene RLS activado en
// `memberships` con política SELECT pero SIN política INSERT, así que un
// insert directo desde el navegador sería rechazado por RLS. La ruta de
// servidor valida el token del usuario y usa la service_role para insertar
// la membresía si no existe. Es idempotente: si ya tiene membresía, no
// hace nada.
//
// La sesión vive en el cliente de supabase-js (localStorage). El guard del
// dashboard (src/app/dashboard/layout.tsx) redirige a /login cuando
// Supabase está configurado y no hay sesión. La reserva pública
// (/reserva/[slug]) y la portada (/) siguen públicas.

import { DEMO_ORG_ID } from "./demo-data";
import { supabaseBrowser, supabaseConfigured } from "./supabase";

/** Org piloto a la que se da acceso a los usuarios nuevos en este MVP. */
export const PILOT_ORG_ID = DEMO_ORG_ID;

/** URL pública de la app (para los enlaces de confirmación y recuperación). */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || "https://vincimia-agenda.pages.dev"
  );
}

/**
 * Asegura que el usuario de la sesión tenga al menos una membresía.
 * Llama a /api/auth/membership con el token de acceso; si el servidor no
 * está configurado (sin service_role) devuelve false sin romper el login.
 */
export async function ensureMembership(): Promise<boolean> {
  try {
    const client = supabaseBrowser();
    if (!client) return false;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return false;
    const res = await fetch("/api/auth/membership", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** ¿Hay sesión activa? (false también cuando Supabase no está configurado). */
export async function hasSession(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const client = supabaseBrowser();
  if (!client) return false;
  const {
    data: { session },
  } = await client.auth.getSession();
  return Boolean(session);
}
