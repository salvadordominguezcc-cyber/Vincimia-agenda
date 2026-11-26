// Servicios en la nube (panel → Supabase).
// POST   /api/catalog/services  { organization_id, service: {...} }
//        Guarda (agregar o editar) un servicio. Si ya existe uno con
//        el mismo nombre (con o sin acentos), se actualiza ese y no se
//        duplica: así "Valoracion" del teléfono y "Valoración" de la
//        nube terminan siendo el mismo servicio, con la duración real.
// DELETE /api/catalog/services  { organization_id, service_id }
//        Borra el servicio. Las citas que lo usaban quedan sin
//        servicio asignado (no se borran).
// Authorization: Bearer <excel_webhook_secret de la organización>

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  authSecret,
  deleteService,
  upsertService,
  verifyOrgSecret,
  type ServiceInput,
} from "@/lib/server-catalog";

async function authorized(req: Request, organizationId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { supabase: null, error: "Supabase no configurado." };
  if (!organizationId || !(await verifyOrgSecret(supabase, organizationId, authSecret(req)))) {
    return { supabase: null, error: "Secreto inválido u organización no encontrada." };
  }
  return { supabase, error: null };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const { supabase, error } = await authorized(req, organizationId);
  if (!supabase || error) {
    return Response.json(
      { ok: false, message: error ?? "Supabase no configurado." },
      { status: error === "Supabase no configurado." ? 503 : 401 }
    );
  }
  const result = await upsertService(supabase, organizationId, (body.service ?? {}) as ServiceInput);
  if (!result.ok) {
    return Response.json({ ok: false, message: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, service: result.row, created: result.created });
}

export async function DELETE(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const organizationId = String(body.organization_id ?? "");
  const serviceId = String(body.service_id ?? "");
  if (!serviceId) {
    return Response.json({ ok: false, message: "Falta el servicio." }, { status: 400 });
  }
  const { supabase, error } = await authorized(req, organizationId);
  if (!supabase || error) {
    return Response.json(
      { ok: false, message: error ?? "Supabase no configurado." },
      { status: error === "Supabase no configurado." ? 503 : 401 }
    );
  }
  const result = await deleteService(supabase, organizationId, serviceId);
  if (!result.ok) {
    return Response.json({ ok: false, message: result.error }, { status: 500 });
  }
  return Response.json({ ok: true, message: "Servicio borrado." });
}
