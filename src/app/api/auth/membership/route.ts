// Alta de membresía piloto — Vincimia Agenda.
// POST /api/auth/membership con Authorization: Bearer <access_token>.
// Valida el token contra Supabase Auth y, si el usuario no tiene ninguna
// membresía, lo agrega como 'member' a la Org #1 piloto (Clínica Dental
// Sonrisa). Idempotente: si ya tiene membresía, responde ok sin insertar.
//
// Usa la service_role porque el esquema tiene RLS en `memberships` sin
// política INSERT: el navegador no puede insertar su propia membresía.
// NUNCA se expone la service_role al navegador; solo vive en esta ruta.

export const runtime = "edge";

import { createClient } from "@supabase/supabase-js";
import { PILOT_ORG_ID } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json(
      { ok: false, message: "Supabase no configurado." },
      { status: 503 }
    );
  }
  const server = supabaseServer();
  if (!server) {
    return Response.json(
      { ok: false, message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 }
    );
  }

  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return Response.json({ ok: false, message: "Falta el token." }, { status: 401 });
  }

  // 1) Validar el token: ¿de qué usuario es?
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return Response.json(
      { ok: false, message: "Token inválido o caducado." },
      { status: 401 }
    );
  }

  // 2) ¿Ya tiene alguna membresía? Si sí, no se toca nada.
  const { data: existing } = await server
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ ok: true, membership: "exists" });
  }

  // 3) Alta piloto en la Org #1.
  const { error: insertError } = await server.from("memberships").insert({
    organization_id: PILOT_ORG_ID,
    user_id: user.id,
    role: "member",
  });
  if (insertError) {
    return Response.json(
      { ok: false, message: insertError.message },
      { status: 500 }
    );
  }
  return Response.json({ ok: true, membership: "created" });
}
