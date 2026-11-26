// Doctores en la nube (panel → Supabase).
// POST /api/catalog/doctors  { organization_id, doctor: {...} }
// Guarda (agregar o editar) un doctor: nombre, especialidad, color,
// si solo atiende con anticipo, horarios (medio turno o turno
// completo, por día) y si está activo. Si ya existe uno con el mismo
// nombre, se actualiza ese y no se duplica. "Quitar" en el panel es
// pausar (active=false): sus citas pasadas se conservan.
// Authorization: Bearer <excel_webhook_secret de la organización>

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  authSecret,
  upsertDoctor,
  verifyOrgSecret,
  type DoctorInput,
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
  const result = await upsertDoctor(supabase, organizationId, (body.doctor ?? {}) as DoctorInput);
  if (!result.ok) {
    return Response.json({ ok: false, message: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, doctor: result.row, created: result.created });
}
