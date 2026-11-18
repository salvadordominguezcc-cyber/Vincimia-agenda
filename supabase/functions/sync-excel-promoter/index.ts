// Edge Function de Supabase: sync-excel-promoter — Vincimia Agenda.
// Es la versión "nube" del webhook de Sheets. La app Next.js ya tiene la
// misma lógica en src/app/api/webhook/sheets/route.ts; esta función es la
// alternativa si prefieres que el webhook viva en Supabase en lugar de en
// Cloudflare Pages. Usa UNA de las dos, no las dos a la vez.
// Despliegue: supabase functions deploy sync-excel-promoter
// (necesita el CLI de Supabase y las variables SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY en el proyecto).
// El secreto se valida contra organizations.excel_webhook_secret.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BLOCKING = ["pending", "confirmed", "completed"];

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date, buffer: number): boolean {
  const aEndBuf = new Date(aEnd.getTime() + buffer * 60_000);
  const bEndBuf = new Date(bEnd.getTime() + buffer * 60_000);
  return aStart < bEndBuf && bStart < aEndBuf;
}

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, status: "error", message: "JSON inválido." }, { status: 400 });
  }

  const secret = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const organizationId = String(body.organization_id ?? "");
  const clientName = String(body.client_name ?? "").trim();
  const startTime = String(body.start_time ?? "").trim();
  if (!organizationId || !clientName || !startTime || !secret) {
    return Response.json({ success: false, status: "error", message: "Faltan datos o el secreto Bearer." }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, buffer_minutes")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (!org) {
    return Response.json({ success: false, status: "error", message: "Secreto inválido u organización no encontrada." }, { status: 401 });
  }
  const buffer = org.buffer_minutes ?? 15;
  const serviceName = String(body.service_name ?? "Consulta General").trim();
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes, price")
    .eq("organization_id", organizationId)
    .eq("name", serviceName)
    .eq("active", true)
    .single();
  const duration = service?.duration_minutes ?? 45;
  const price = service?.price ?? 0;

  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60_000);
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status")
    .eq("organization_id", organizationId)
    .in("status", BLOCKING);
  const clash = (existing ?? []).find((a: { start_time: string; end_time: string }) =>
    overlaps(start, end, new Date(a.start_time), new Date(a.end_time), buffer)
  );

  const status = clash ? "conflict" : "pending";
  const { data: saved, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      service_id: service?.id ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      price,
      status,
      source: "excel_promoter",
      notes: clash
        ? `CONFLICTO (Sheets): choca con la cita ${clash.id}.`
        : "Creada desde Google Sheets (promotor).",
    })
    .select("id")
    .single();
  if (error) {
    return Response.json({ success: false, status: "error", message: error.message }, { status: 500 });
  }
  return Response.json({
    success: !clash,
    status,
    appointment_id: saved?.id ?? null,
    message: clash ? `Horario ocupado (${startTime}).` : "Cita creada en pendiente.",
  });
});
