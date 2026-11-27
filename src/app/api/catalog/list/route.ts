// Baja el catálogo completo de un negocio para el panel:
// datos del negocio, servicios y doctores.
// GET /api/catalog/list?organization_id=...
// Authorization: Bearer <excel_webhook_secret de la organización>
// Solo lectura. La nube manda; el panel mezcla con lo del aparato
// (por nombre, para no duplicar "Valoracion" local con "Valoración"
// de la nube) y adopta los ids de la nube.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { authSecret, fetchOrgForCatalog, verifyOrgSecret } from "@/lib/server-catalog";
import { SPECIALTIES, doctorColorForSpecialty, type Doctor } from "@/lib/types";

export async function GET(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json({ ok: false, message: "Supabase no configurado." }, { status: 503 });
  }
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id") ?? "";
  if (!organizationId || !(await verifyOrgSecret(supabase, organizationId, authSecret(req)))) {
    return Response.json(
      { ok: false, message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const [org, services, doctors] = await Promise.all([
    fetchOrgForCatalog(supabase, "id", organizationId),
    supabase.from("services").select("*").eq("organization_id", organizationId),
    supabase.from("doctors").select("*").eq("organization_id", organizationId),
  ]);
  if (!org) {
    return Response.json({ ok: false, message: "Organización no encontrada." }, { status: 404 });
  }
  return Response.json({
    ok: true,
    org,
    services: services.data ?? [],
    // Los doctores de ejemplo en Supabase no traen horario (schedule
    // null) y el panel llama schedule.filter(...) al pintarlos: sin
    // esta forma segura, la pestaña Doctores se cae. El panel además
    // normaliza al mezclar, esto es defensa en la ruta.
    doctors: (doctors.data ?? []).map((d) => {
      const doctor = d as unknown as Doctor;
      const specialty = (SPECIALTIES as string[]).includes(doctor.specialty as string)
        ? doctor.specialty
        : "general";
      return {
        ...doctor,
        specialty,
        color:
          typeof doctor.color === "string" && doctor.color.trim() !== ""
            ? doctor.color
            : doctorColorForSpecialty(specialty),
        schedule: Array.isArray(doctor.schedule) ? doctor.schedule : [],
      };
    }),
  });
}
