// Empuje manual Agenda → hoja de promotores (escritura inversa).
// SOLO LLAMADA MANUAL / DE PRUEBA. No está conectado a ningún flujo
// automático: ninguna confirmación, ningún cambio de estado y ningún
// webhook lo llama todavía. El panel lo usará solo cuando el dueño lo
// pida, después de probar en una copia de la hoja.
//
// La ruta /api/sheets/push carga la cita de Supabase y la manda al
// receptor de Apps Script (scripts/apps-script-agenda-a-sheets.gs),
// que la escribe en la pestaña DENTIPLUS MEXICALI 1. Si el receptor
// no está configurado en Cloudflare (SHEETS_RECEIVER_URL /
// SHEETS_RECEIVER_SECRET), la ruta responde 503 y no se inventa nada.

export type SheetsPushResult =
  | { ok: true; receiver: unknown }
  | { ok: false; message: string };

/** Llamada manual a /api/sheets/push. Devuelve lo que respondió el receptor. */
export async function pushAppointmentToSheets(
  organizationId: string,
  secret: string,
  appointmentId: string,
  overrides?: { promotion?: string; policy?: string }
): Promise<SheetsPushResult> {
  try {
    const res = await fetch("/api/sheets/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        organization_id: organizationId,
        appointment_id: appointmentId,
        ...(overrides ?? {}),
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      message?: string;
      receiver?: unknown;
    };
    if (!json.ok) return { ok: false, message: json.message ?? "No se pudo empujar a la hoja." };
    return { ok: true, receiver: json.receiver ?? null };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** Igual que pushAppointmentToSheets, pero sin frenar al panel:
 *  se dispara y se olvida (fire-and-forget). Solo para uso manual. */
export function notifySheetsPush(
  organizationId: string,
  secret: string,
  appointmentId: string,
  overrides?: { promotion?: string; policy?: string }
): void {
  if (!organizationId || !secret || !appointmentId) return;
  pushAppointmentToSheets(organizationId, secret, appointmentId, overrides).catch(
    () => undefined
  );
}
