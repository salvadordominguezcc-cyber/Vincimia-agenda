// Prende o apaga las confirmaciones de Vincimia (formato Confirmafy)
// para un negocio. Mismo patrón de auth que /api/whatsapp/toggle.
// GET  /api/confirmations/toggle?organization_id=...  → { ok, enabled }
// POST /api/confirmations/toggle  { organization_id, enabled }
// Authorization: Bearer <excel_webhook_secret de la organización>
//
// ON (TRUE, valor por defecto): al confirmar una cita, Vincimia crea o
// actualiza el evento en Google Calendar con el formato Confirmafy
// (título "🟢 Nombre / teléfono / tratamiento", color del doctor,
// recordatorio 30 min) y manda la confirmación por WhatsApp.
// OFF (FALSE): al confirmar, la cita solo se guarda en Vincimia; no se
// crea ni actualiza el evento en Google y no se manda WhatsApp al
// paciente. Es el modo para mientras Confirmafy siga activo, para que
// no haya doble envío ni dos eventos por la misma cita. La cancelación
// sí sigue borrando en Google el evento que ya existía.
//
// Si la migración 010 aún no está aplicada en Supabase, el POST
// responde 503 explicando que falta aplicar la migración (no se finge
// que el cambio quedó guardado). El GET, en cambio, responde enabled
// true cuando la columna no existe: el comportamiento actual.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";

function authSecret(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

async function checkSecret(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  organizationId: string,
  secret: string
): Promise<boolean> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  return !!data;
}

export async function GET(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id") ?? "";
  const secret = authSecret(req);
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto." },
      { status: 400 }
    );
  }
  if (!(await checkSecret(supabase, organizationId, secret))) {
    return Response.json(
      { ok: false, message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const { data, error } = await supabase
    .from("organizations")
    .select("vincimia_confirmations_enabled")
    .eq("id", organizationId)
    .single();
  if (error || !data) {
    // Columna aún no aplicada (migración 010 pendiente): el
    // comportamiento en vivo es "prendido".
    return Response.json({ ok: true, enabled: true, migration_pending: true });
  }
  const enabled = (data as { vincimia_confirmations_enabled?: boolean | null })
    .vincimia_confirmations_enabled !== false;
  return Response.json({ ok: true, enabled });
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const enabled = body.enabled === true;
  const secret = authSecret(req);
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto." },
      { status: 400 }
    );
  }
  if (!(await checkSecret(supabase, organizationId, secret))) {
    return Response.json(
      { ok: false, message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const { error } = await supabase
    .from("organizations")
    .update({ vincimia_confirmations_enabled: enabled })
    .eq("id", organizationId);
  if (error) {
    return Response.json(
      {
        ok: false,
        message:
          "No se pudo guardar el interruptor. Si la migración 010 aún no está aplicada en Supabase, aplícala primero (Supabase → SQL Editor → supabase/migrations/010_confirmfy_toggle.sql).",
      },
      { status: 500 }
    );
  }
  return Response.json({
    ok: true,
    enabled,
    message: enabled
      ? "Confirmaciones de Vincimia activadas: al confirmar, se crea el evento en Google y se manda el WhatsApp."
      : "Confirmaciones de Vincimia apagadas: al confirmar, la cita solo se guarda en Vincimia; Confirmafy confirma.",
  });
}
