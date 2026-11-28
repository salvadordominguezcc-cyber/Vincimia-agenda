"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Aviso al grupo de promotores: ¿la tarjeta de esta cita ya se
 *  reenvió al grupo de WhatsApp? La tarjeta en WhatsApp no se puede
 *  actualizar sola, así que el estado vive aquí, en el panel: se
 *  marca a mano después de reenviarla al grupo. */

export function GroupNoticeBadge({ notified }: { notified: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-xs font-medium",
        notified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
      )}
    >
      Aviso al grupo: {notified ? "Enviado" : "Pendiente"}
    </span>
  );
}

export function GroupNoticeToggle({
  notified,
  onToggle,
}: {
  notified: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <GroupNoticeBadge notified={notified} />
      <Button size="sm" variant="outline" onClick={onToggle}>
        {notified ? "Marcar pendiente" : "Ya lo envié al grupo"}
      </Button>
    </span>
  );
}
