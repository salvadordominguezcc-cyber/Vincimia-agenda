// Sube el catálogo local a la nube de una vez: servicios y doctores
// que solo viven en el aparato. Los promotores NO se sincronizan:
// se controlan en su Excel (fuente de verdad).
// POST /api/catalog/upload
//   { organization_id, services: [...], doctors: [...] }
// Cada fila se guarda por nombre (servicios/doctores) o por código
// (promotores): si ya existe en la nube, se actualiza y no se duplica.
// Devuelve por cada grupo cuántos se crearon, cuántos se actualizaron
// y los errores, más el mapa local_id → cloud_id para que el panel
// reescriba sus ids (y las citas que apuntaban a ellos).
// Authorization: Bearer <excel_webhook_secret de la organización>

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import {
  authSecret,
  upsertDoctor,
  upsertService,
  verifyOrgSecret,
  type DoctorInput,
  type ServiceInput,
} from "@/lib/server-catalog";

const MAX_ITEMS = 200;

interface GroupResult {
  created: number;
  updated: number;
  errors: string[];
  mapping: { local_id: string; cloud_id: string }[];
}

async function uploadGroup<T>(
  items: T[],
  label: string,
  upsert: (item: T) => Promise<
    | { ok: true; row: Record<string, unknown>; created: boolean }
    | { ok: false; error: string }
  >
): Promise<GroupResult> {
  const result: GroupResult = { created: 0, updated: 0, errors: [], mapping: [] };
  for (const item of items.slice(0, MAX_ITEMS)) {
    const localId = String((item as Record<string, unknown>).id ?? "");
    try {
      const saved = await upsert(item);
      if (!saved.ok) {
        result.errors.push(`${label} ${localId}: ${saved.error}`);
        continue;
      }
      if (saved.created) result.created++;
      else result.updated++;
      const cloudId = String(saved.row.id ?? "");
      if (localId && cloudId && localId !== cloudId) {
        result.mapping.push({ local_id: localId, cloud_id: cloudId });
      }
    } catch (e) {
      result.errors.push(`${label} ${localId}: ${String(e)}`);
    }
  }
  return result;
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
  if (!organizationId || !(await verifyOrgSecret(supabase, organizationId, authSecret(req)))) {
    return Response.json(
      { ok: false, message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const services = Array.isArray(body.services) ? (body.services as ServiceInput[]) : [];
  const doctors = Array.isArray(body.doctors) ? (body.doctors as DoctorInput[]) : [];
  const [servicesResult, doctorsResult] = await Promise.all([
    uploadGroup(services, "Servicio", (s) => upsertService(supabase, organizationId, s)),
    uploadGroup(doctors, "Doctor", (d) => upsertDoctor(supabase, organizationId, d)),
  ]);
  return Response.json({
    ok: true,
    services: servicesResult,
    doctors: doctorsResult,
  });
}
