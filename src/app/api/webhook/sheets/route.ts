// Webhook de Google Sheets para promotores — Vincimia Agenda.
// Recibe una fila de la hoja (Apps Script, scripts/apps-script-sheets.gs),
// valida el secreto de la organización, corre el motor anti-empalmes
// contra la nube y responde { success, status } para que la hoja marque
// la fila en verde (confirmado) o en rojo (conflicto).
// Sin Supabase configurado responde 503: el webhook real necesita la nube.
// NUNCA usa la service_role en el navegador; solo vive en esta ruta.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";

const BLOCKING = ["pending", "confirmed", "completed"];

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  buffer: number
): boolean {
  const aEndBuf = new Date(aEnd.getTime() + buffer * 60_000);
  const bEndBuf = new Date(bEnd.getTime() + buffer * 60_000);
  return aStart < bEndBuf && bStart < aEndBuf;
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return Response.json(
      {
        success: false,
        status: "error",
        message:
          "Supabase no configurado. El webhook real necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor. En modo demo, prueba el anti-empalme en /dashboard/nueva.",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, status: "error", message: "JSON inválido." },
      { status: 400 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.replace(/^Bearer\s+/i, "").trim();
  const organizationId = String(body.organization_id ?? "");
  const clientName = String(body.client_name ?? "").trim();
  const startTime = String(body.start_time ?? "").trim();
  const promoterName = String(body.promoter_name ?? "Externo").trim();
  const clientPhone = String(body.client_phone ?? "");
  const serviceName = String(body.service_name ?? "Consulta General").trim();

  if (!organizationId || !clientName || !startTime || !secret) {
    return Response.json(
      {
        success: false,
        status: "error",
        message: "Faltan organization_id, client_name, start_time o el secreto Bearer.",
      },
      { status: 400 }
    );
  }

  // 1) Organización + secreto del webhook.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, buffer_minutes, break_start, break_end")
    .eq("id", organizationId)
    .eq("excel_webhook_secret", secret)
    .single();
  if (orgError || !org) {
    return Response.json(
      { success: false, status: "error", message: "Secreto inválido u organización no encontrada." },
      { status: 401 }
    );
  }
  const buffer = org.buffer_minutes ?? 15;

  // 1b) Tiempo de descanso de la clínica: en esa hora no hay citas.
  // (Se revisa después de conocer la duración del servicio, en el paso 4.)
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  // 2) Servicio (por nombre; si no existe, usa la duración por defecto 45).
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes, price")
    .eq("organization_id", organizationId)
    .eq("name", serviceName)
    .eq("active", true)
    .single();
  const duration = service?.duration_minutes ?? 45;
  const price = service?.price ?? 0;

  // 3) Promotor (por nombre; si no existe, se crea como externo).
  let promoterId: string | null = null;
  const { data: promoter } = await supabase
    .from("promoters")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", promoterName)
    .single();
  if (promoter) {
    promoterId = promoter.id;
  } else {
    const { data: created } = await supabase
      .from("promoters")
      .insert({
        organization_id: organizationId,
        name: promoterName,
        code: promoterName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "EXTERNO",
        commission_rate: 0,
      })
      .select("id")
      .single();
    promoterId = created?.id ?? null;
  }

  // 4) Anti-empalme contra las citas que bloquean (pending/confirmed/completed).
  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60_000);
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status")
    .eq("organization_id", organizationId)
    .in("status", BLOCKING);
  const clash = (existing ?? []).find((a) =>
    overlaps(start, end, new Date(a.start_time), new Date(a.end_time), buffer)
  );
  // El tiempo de descanso también bloquea: se registra como conflicto.
  const reqStartMin = start.getHours() * 60 + start.getMinutes();
  const inBreak =
    !!org.break_start &&
    !!org.break_end &&
    reqStartMin < toMin(org.break_end) &&
    toMin(org.break_start) < reqStartMin + duration;

  // 5) Contacto: se crea si no existe (por teléfono o nombre).
  let contactId: string | null = null;
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .or(`phone.eq.${clientPhone},full_name.ilike.${clientName}`)
    .limit(1)
    .single();
  if (contact) {
    contactId = contact.id;
  } else {
    const { data: created } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: clientName,
        phone: clientPhone || null,
      })
      .select("id")
      .single();
    contactId = created?.id ?? null;
  }

  // 6) Si choca (o cae en el tiempo de descanso): se guarda como
  // conflict (registro, sin bloquear ni comisionar).
  if (clash || inBreak) {
    const { data: saved } = await supabase
      .from("appointments")
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        service_id: service?.id ?? null,
        promoter_id: promoterId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: duration,
        price,
        status: "conflict",
        source: "excel_promoter",
        notes: inBreak
          ? `CONFLICTO (Sheets): cae en el tiempo de descanso de la clínica (${org.break_start}–${org.break_end}).`
          : `CONFLICTO (Sheets): choca con la cita ${clash!.id} ${clash!.start_time}–${clash!.end_time}.`,
      })
      .select("id")
      .single();
    return Response.json({
      success: false,
      status: "conflict",
      appointment_id: saved?.id ?? null,
      message: inBreak
        ? `Ese horario cae en el tiempo de descanso (${org.break_start}–${org.break_end}). La cita quedó registrada como conflicto.`
        : `Horario ocupado (${startTime}). La cita quedó registrada como conflicto.`,
    });
  }

  // 7) Libre: se guarda en pending.
  const { data: saved, error: insertError } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      service_id: service?.id ?? null,
      promoter_id: promoterId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      price,
      status: "pending",
      source: "excel_promoter",
    })
    .select("id")
    .single();
  if (insertError) {
    return Response.json(
      { success: false, status: "error", message: insertError.message },
      { status: 500 }
    );
  }
  return Response.json({
    success: true,
    status: "pending",
    appointment_id: saved?.id ?? null,
    message: "Cita creada en pendiente.",
  });
}
