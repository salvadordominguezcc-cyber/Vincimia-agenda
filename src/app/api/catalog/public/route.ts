// Catálogo público para el link de reserva: lo que el paciente
// necesita ver para agendar (servicios y doctores activos, datos del
// negocio). GET /api/catalog/public?slug=...
// Público, sin secreto: solo devuelve nombre, duración, precio,
// especialidad, color y horarios. NO devuelve teléfonos de promotores,
// correos, tokens ni secretos.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) {
    return Response.json({ ok: false, message: "Falta el enlace del negocio." }, { status: 400 });
  }
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, buffer_minutes, break_start, break_end")
    .eq("slug", slug)
    .single();
  if (!org) {
    return Response.json({ ok: false, message: "Negocio no encontrado." }, { status: 404 });
  }
  const [services, doctors] = await Promise.all([
    supabase
      .from("services")
      .select("id, organization_id, name, duration_minutes, price, follow_up_days, active, created_at")
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("doctors")
      .select("id, organization_id, name, specialty, color, requires_deposit, schedule, active, created_at")
      .eq("organization_id", org.id)
      .eq("active", true),
  ]);
  return Response.json({
    ok: true,
    org,
    services: services.data ?? [],
    doctors: doctors.data ?? [],
  });
}
