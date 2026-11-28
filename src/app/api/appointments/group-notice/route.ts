// Marca si la tarjeta de una cita ya se reenvió al grupo de WhatsApp
// de promotores. La usa el panel cuando Salvador marca la cita como
// enviada (o la vuelve a pendiente si se equivocó).
// POST /api/appointments/group-notice
//   { organization_id, appointment_id, group_notified }
// Authorization: Bearer <excel_webhook_secret de la organización>
// Solo guarda la marca: no toca Google Calendar, WhatsApp ni la hoja.
// Si la columna group_notified aún no existe en Supabase (migración
// 012 sin aplicar), responde ok:false y el panel se queda con el valor
// solo en el aparato, sin romper nada.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";

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
  const appointmentId = String(body.appointment_id ?? "");
  const notified = body.group_notified === true;
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !appointmentId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan organization_id, appointment_id o el secreto Bearer." },
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
  const { data, error } = await supabase
    .from("appointments")
    .update({ group_notified: notified })
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) {
    return Response.json(
      {
        ok: false,
        message:
          "No se pudo guardar el aviso en la nube (¿falta aplicar la migración 012 en Supabase?). La marca se quedó solo en este aparato.",
      },
      { status: 500 }
    );
  }
  if (!data || data.length === 0) {
    return Response.json({ ok: false, message: "Cita no encontrada en la nube." }, { status: 404 });
  }
  return Response.json({ ok: true, group_notified: notified });
}
