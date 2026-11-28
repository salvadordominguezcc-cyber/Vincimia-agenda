// Empuje manual Agenda → hoja de promotores (escritura inversa).
// Control MANUAL solamente: ningún flujo automático (confirmación,
// cambio de estado, webhook) llama a esto. El dueño elige qué citas
// se envían a la hoja y ve el resultado de cada una.
//
// La ruta /api/sheets/push responde por cita: ok:true con
// receiver.slot = 1 (Paciente 1) o 2 (Paciente 2), o ok:false con el
// motivo (receptor sin configurar = 503, horario lleno, conflicto,
// cita solo en el aparato, etc.). Aquí no se inventa ningún envío:
// se muestra tal cual lo que respondió el servidor.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  pushAppointmentToSheets,
  type SheetsPushResult,
} from "@/lib/sheets-push";

/** Resultado de un empuje, ya traducido a palabras normales. */
export type SheetPushOutcome =
  | { ok: true; slot?: number | null }
  | { ok: false; message: string };

/** Extrae el lugar (Paciente 1 o 2) de lo que respondió el receptor. */
export function describePushResult(
  result: SheetsPushResult
): SheetPushOutcome {
  if (!result.ok) return { ok: false, message: result.message };
  const slot = (result.receiver as { slot?: unknown } | null)?.slot;
  return { ok: true, slot: typeof slot === "number" ? slot : null };
}

/** Texto corto del resultado para mostrar junto a la cita. */
export function pushOutcomeText(outcome: SheetPushOutcome): string {
  if (!outcome.ok) return outcome.message;
  return outcome.slot
    ? `En la hoja · Paciente ${outcome.slot}`
    : "En la hoja";
}

/** Botón para enviar UNA cita a la hoja de promotores, con su
 *  resultado al lado. Solo para citas que viven en la nube. */
export function SheetsPushButton({
  organizationId,
  secret,
  appointmentId,
  disabled,
}: {
  organizationId: string;
  secret: string;
  appointmentId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SheetPushOutcome | null>(null);

  const send = async () => {
    setBusy(true);
    setOutcome(null);
    const result = await pushAppointmentToSheets(
      organizationId,
      secret,
      appointmentId
    );
    setOutcome(describePushResult(result));
    setBusy(false);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={send}
        disabled={disabled || busy}
      >
        {busy ? "Enviando…" : "Enviar a la hoja"}
      </Button>
      {outcome && (
        <span
          className={
            outcome.ok
              ? "text-xs font-medium text-green-700"
              : "text-xs font-medium text-red-700"
          }
        >
          {pushOutcomeText(outcome)}
        </span>
      )}
    </span>
  );
}
