// Borra una cita de la nube y, si tenía evento en Google Calendar,
// también borra ese evento. La usa el panel (Calendario → Eliminar).
// DELETE /api/appointments/delete  { organization_id, appointment_id }
// Authorization: Bearer <excel_webhook_secret de la organización>
//
// - La cita se borra de Supabase (tabla appointments).
// - Si tenía google_event_id y Google está conectado, se borra el
//   evento de Google Calendar. Si borrar en Google falla, la cita
//   igual se borra de Supabase y la respuesta lo dice (no se finge).
// - La copia local del aparato la quita el panel después de que el
//   servidor responde que sí; si el servidor falla, el panel conserva
//   la copia local y muestra el error en palabras normales.

export const runtime = "edge";

import { supabaseServer } from "@/lib/supabase";
import { deleteGoogleEvent, refreshGoogleAccessToken } from "@/lib/google";
import { loadOrg } from "@/lib/server-appointments";

export async function DELETE(req: Request) {
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
  const secret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!organizationId || !appointmentId || !secret) {
    return Response.json(
      { ok: false, message: "Faltan datos para borrar la cita." },
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
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, google_event_id")
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();
  if (!appt) {
    return Response.json(
      { ok: false, message: "Esa cita no está en la nube (solo existe en el aparato)." },
      { status: 404 }
    );
  }
  // Si tenía evento en Google, se borra primero para que no quede
  // colgado en el calendario de la clínica.
  let googleDeleted = false;
  let googleNote = "";
  const googleEventId = (appt as { google_event_id?: string | null }).google_event_id;
  if (googleEventId) {
    const org = await loadOrg(supabase, organizationId);
    if (org?.google_calendar_sync && org.google_refresh_token) {
      try {
        const accessToken = await refreshGoogleAccessToken(org.google_refresh_token);
        await deleteGoogleEvent(accessToken, org.google_calendar_id || "primary", googleEventId);
        googleDeleted = true;
      } catch (e) {
        googleNote = `No se pudo borrar su evento en Google Calendar (${String(e)}). La cita sí se borró de Vincimia.`;
      }
    } else {
      googleNote = "La cita se borró de Vincimia, pero no se pudo revisar su evento en Google Calendar porque Google no está conectado.";
    }
  }
  const { error: deleteError } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("organization_id", organizationId);
  if (deleteError) {
    return Response.json({ ok: false, message: deleteError.message }, { status: 500 });
  }
  return Response.json({
    ok: true,
    message: "Cita eliminada.",
    google_deleted: googleDeleted,
    google_note: googleNote || undefined,
  });
}
