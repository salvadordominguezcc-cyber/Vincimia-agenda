// Baja las citas de la nube para el panel.
// GET /api/appointments/list?organization_id=...
// Authorization: Bearer <excel_webhook_secret de la organización>
// Devuelve citas, clientes, servicios y doctores en el mismo formato
// que usa el panel (hora local de la clínica, "2026-11-27T11:30:00"),
// para que el Calendario las mezcle con las del aparato sin duplicar.
// Solo lectura: no cambia nada en la nube ni en el aparato.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { clinicWallISO } from "@/lib/clinic-time";

/** Instante UTC → "YYYY-MM-DDTHH:MM:00" en hora de la clínica
 *  (Mexicali): el formato que usa el panel. */
function toWallISO(iso: string): string {
  return clinicWallISO(iso);
}

export async function GET(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id") ?? "";
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id o el secreto Bearer." },
      { status: 400 }
    );
  }
  const { data: secretOk } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (!secretOk) {
    return Response.json({ ok: false, message: "Secreto inválido." }, { status: 401 });
  }
  const [appts, contacts, services, doctors] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .eq("organization_id", organizationId)
      .order("start_time", { ascending: true })
      .limit(500),
    supabase.from("contacts").select("*").eq("organization_id", organizationId),
    supabase.from("services").select("*").eq("organization_id", organizationId),
    supabase.from("doctors").select("*").eq("organization_id", organizationId),
  ]);
  const mapAppt = (a: Record<string, unknown>) => ({
    ...a,
    start_time: toWallISO(String(a.start_time)),
    end_time: toWallISO(String(a.end_time)),
    created_at: a.created_at ? toWallISO(String(a.created_at)) : a.created_at,
  });
  return Response.json({
    ok: true,
    appointments: ((appts.data ?? []) as Record<string, unknown>[]).map(mapAppt),
    contacts: contacts.data ?? [],
    services: services.data ?? [],
    doctors: doctors.data ?? [],
  });
}
