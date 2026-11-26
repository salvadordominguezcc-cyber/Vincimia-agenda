// Datos del negocio en la nube (Ajustes → Supabase).
// POST /api/catalog/org  { organization_id, name?, slug?, buffer_minutes?,
//   break_start?, break_end?, connected_google_email? }
// Guarda los cambios de Ajustes en la fila de organizations. El
// enlace (slug) es único: si ya lo usa otro negocio, responde 409
// con error "slug-taken" para que el panel lo diga en palabras normales.
// Authorization: Bearer <excel_webhook_secret de la organización>

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  authSecret,
  updateOrgSettings,
  verifyOrgSecret,
  type OrgSettingsInput,
} from "@/lib/server-catalog";

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
  if (!organizationId || !(await verifyOrgSecret(supabase, organizationId, authSecret(req)))) {
    return Response.json(
      { ok: false, message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const input: OrgSettingsInput = {
    name: body.name as string | undefined,
    slug: body.slug as string | undefined,
    buffer_minutes: body.buffer_minutes as number | undefined,
    break_start: body.break_start as string | null | undefined,
    break_end: body.break_end as string | null | undefined,
    connected_google_email: body.connected_google_email as string | null | undefined,
    address: body.address as string | null | undefined,
    hours_text: body.hours_text as string | null | undefined,
  };
  const result = await updateOrgSettings(supabase, organizationId, input);
  if (!result.ok) {
    if (result.error === "slug-taken") {
      return Response.json(
        { ok: false, message: "Ese enlace ya lo usa otro negocio, prueba con otro." },
        { status: 409 }
      );
    }
    if (result.error === "pending-migration-011") {
      return Response.json(
        {
          ok: false,
          message:
            "La dirección y el horario aún no se pueden guardar en la nube: falta aplicar la migración 011 en Supabase.",
        },
        { status: 400 }
      );
    }
    return Response.json({ ok: false, message: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, org: result.row, pending_columns: result.pending_columns ?? [] });
}
