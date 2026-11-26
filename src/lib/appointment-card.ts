// Tarjeta "TU CITA" de la reserva pública — Vincimia Agenda.
// Lo que ve el paciente después de reservar por el link: sus datos
// ordenados, con un botón para guardarlos como imagen en su teléfono
// y otro para compartirlos por WhatsApp.
//
// Sin dependencias nuevas: la imagen se dibuja a mano en un <canvas>
// con los colores oficiales de Dentiplus (rosa, morado, turquesa
// sobre azul claro), igual que el ejemplo aprobado por Salvador
// (workspace/imagine_media/media-generation-ejemplo-mensaje-cita-
// registrad-0-75729eb3-3b37-4a1d-86d8-397add2addd5.webp).

/** WhatsApp único del consultorio en esta fase piloto (mismo número
 *  que usa el bot unificado). Cuando el negocio tenga su propio campo
 *  de WhatsApp en Ajustes, la tarjeta debe leerlo de ahí. */
export const CLINIC_WHATSAPP_DISPLAY = "+52 663 328 0701";

export interface AppointmentCardData {
  clinicName: string;
  patientName: string;
  phone: string;
  /** Fecha ISO "2026-11-27". */
  date: string;
  /** Hora "11:30" (24 h). */
  time: string;
  serviceName: string;
  doctorName: string | null;
  price: number;
  /** "Pendiente por confirmar" o "En pausa". */
  status: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** ¿Esta reserva trae una promoción? Valoración (con o sin acento)
 *  o un tratamiento con precio de promoción (los precios de
 *  bienvenida de Foto 1). Solo entonces el aviso de recepción
 *  menciona las promociones. */
export function hasPromotion(card: AppointmentCardData): boolean {
  return normalize(card.serviceName).includes("valoracion") || card.price > 0;
}

export function receptionNote(card: AppointmentCardData): string {
  return hasPromotion(card)
    ? "Presenta esta información en recepción para que te respeten tu cita y tus promociones."
    : "Presenta esta información en recepción para que te respeten tu cita.";
}

/** "2026-11-27" -> "Viernes 27 de noviembre de 2026". Se arma con
 *  año/mes/día sueltos para que la zona horaria no mueva el día. */
export function formatFechaLarga(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const text = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "11:30" -> "11:30 am", "14:00" -> "2:00 pm". */
export function formatHora12(time24: string): string {
  const [h, min] = time24.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return time24;
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export function formatPrecio(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

/** Filas de la tarjeta, en orden, con sus valores ya formateados. */
export function cardRows(card: AppointmentCardData): { label: string; value: string; accent?: boolean }[] {
  return [
    { label: "Clínica", value: card.clinicName },
    { label: "Paciente", value: card.patientName },
    { label: "Teléfono", value: card.phone },
    { label: "Fecha", value: formatFechaLarga(card.date) },
    { label: "Hora", value: formatHora12(card.time) },
    { label: "Tratamiento", value: card.serviceName },
    { label: "Doctor", value: card.doctorName ?? "Sin preferencia" },
    { label: "Precio", value: formatPrecio(card.price) },
    { label: "Estado", value: card.status, accent: true },
  ];
}

/** Texto plano de la tarjeta, para WhatsApp y para compartir. */
export function buildCardText(card: AppointmentCardData): string {
  const lines = ["⭐ TU CITA — " + card.clinicName];
  for (const row of cardRows(card)) {
    lines.push(`${row.label}: ${row.value}`);
  }
  lines.push("");
  lines.push(receptionNote(card));
  lines.push(`Te confirmamos tu cita por WhatsApp al ${CLINIC_WHATSAPP_DISPLAY}.`);
  return lines.join("\n");
}

export function buildWhatsAppShareUrl(card: AppointmentCardData): string {
  return `https://wa.me/?text=${encodeURIComponent(buildCardText(card))}`;
}

// ---------------------------------------------------------------------------
// Imagen PNG de la tarjeta (canvas, sin dependencias)
// ---------------------------------------------------------------------------

const C = {
  bg: "#dbeafe",
  card: "#ffffff",
  navy: "#1e1b4b",
  purple: "#5b21b6",
  pink: "#ec4899",
  turquoise: "#67e8f9",
  turquoiseDark: "#0e7490",
  slate: "#475569",
  slateLight: "#e2e8f0",
  amber: "#d97706",
  green: "#16a34a",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Dibuja la tarjeta en un canvas de 1080 px de ancho y devuelve el
 *  PNG como Blob. Altura dinámica según el largo de los textos. */
export function drawAppointmentCardImage(card: AppointmentCardData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 1080;
    const pad = 64;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Este navegador no puede crear la imagen."));
      return;
    }
    const valueX = 360;
    const valueW = W - pad - valueX;
    const lineH = 62;

    // Medir altura: filas + nota + pie.
    ctx.font = "600 34px system-ui, sans-serif";
    let rowsH = 0;
    const rows = cardRows(card);
    for (const row of rows) {
      rowsH += Math.max(1, wrapText(ctx, row.value, valueW).length) * lineH + 14;
    }
    ctx.font = "600 36px system-ui, sans-serif";
    const noteLines = wrapText(ctx, receptionNote(card), W - pad * 2 - 90);
    const noteH = noteLines.length * 52 + 64;
    const H = 150 + 110 + 96 + 40 + rowsH + 48 + noteH + 120;

    canvas.width = W;
    canvas.height = H;

    // Fondo azul claro con destellos.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const sparkles: [number, number, number, string][] = [
      [90, 90, 10, C.pink],
      [990, 70, 12, C.turquoise],
      [60, 420, 8, C.purple],
      [1020, 500, 10, C.pink],
      [120, H - 90, 10, C.turquoise],
      [960, H - 70, 8, C.purple],
    ];
    for (const [x, y, r, color] of sparkles) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Título + check verde.
    ctx.fillStyle = C.green;
    ctx.beginPath();
    ctx.arc(W - pad - 60, 96, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(W - pad - 84, 96);
    ctx.lineTo(W - pad - 66, 116);
    ctx.lineTo(W - pad - 34, 72);
    ctx.stroke();
    ctx.fillStyle = C.navy;
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("¡Cita registrada!", pad, 100);

    // Tarjeta blanca.
    const cardY = 190;
    const cardH = 96 + 40 + rowsH + 48;
    ctx.fillStyle = C.card;
    roundRect(ctx, pad, cardY, W - pad * 2, cardH, 36);
    ctx.fill();

    // Banner morado "TU CITA".
    ctx.fillStyle = C.purple;
    roundRect(ctx, pad + 28, cardY + 28, W - pad * 2 - 56, 84, 20);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TU CITA", W / 2, cardY + 72);

    // Filas.
    let y = cardY + 96 + 40;
    ctx.textAlign = "left";
    for (const row of rows) {
      ctx.font = "700 34px system-ui, sans-serif";
      ctx.fillStyle = C.slate;
      ctx.fillText(`${row.label}:`, pad + 28, y);
      ctx.font = "600 34px system-ui, sans-serif";
      ctx.fillStyle = row.accent ? C.amber : C.navy;
      const lines = wrapText(ctx, row.value, valueW);
      for (const line of lines) {
        ctx.fillText(line, valueX, y);
        y += lineH;
      }
      y += 14;
      // Divisor.
      ctx.strokeStyle = C.slateLight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad + 28, y - 8);
      ctx.lineTo(W - pad - 28, y - 8);
      ctx.stroke();
    }

    // Nota turquesa.
    const noteY = cardY + cardH + 36;
    ctx.fillStyle = "#a5f3fc";
    roundRect(ctx, pad, noteY, W - pad * 2, noteH, 28);
    ctx.fill();
    ctx.fillStyle = C.turquoiseDark;
    ctx.font = "800 40px system-ui, sans-serif";
    ctx.fillText("ⓘ", pad + 28, noteY + 52);
    ctx.font = "600 36px system-ui, sans-serif";
    let ny = noteY + 44;
    for (const line of noteLines) {
      ctx.fillText(line, pad + 90, ny);
      ny += 52;
    }

    // Pie.
    ctx.fillStyle = C.navy;
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Te confirmamos tu cita por WhatsApp al ${CLINIC_WHATSAPP_DISPLAY}.`,
      W / 2,
      noteY + noteH + 56
    );

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo crear la imagen."));
      },
      "image/png"
    );
  });
}

export type SaveResult =
  | { ok: true; method: "share" | "download" }
  | { ok: false; aborted: boolean; message: string };

/** "Guardar mi cita": primero intenta compartir la imagen con el
 *  menú del teléfono (Web Share API con archivo: en Android deja
 *  guardarla en la galería o mandarla por WhatsApp). Si el teléfono
 *  no lo soporta, descarga el PNG a Descargas. Si el paciente
 *  cierra el menú sin elegir nada, no es un error: solo se avisa. */
export async function saveAppointmentCard(
  card: AppointmentCardData
): Promise<SaveResult> {
  let blob: Blob;
  try {
    blob = await drawAppointmentCardImage(card);
  } catch (e) {
    return {
      ok: false,
      aborted: false,
      message: e instanceof Error ? e.message : "No se pudo crear la imagen.",
    };
  }
  const filename = `cita-dentiplus-${card.date}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title: string; text: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: "Mi cita — " + card.clinicName,
        text: buildCardText(card),
      });
      return { ok: true, method: "share" };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, aborted: true, message: "Se cerró sin guardar." };
      }
      // Si compartir falla, se sigue con la descarga.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { ok: true, method: "download" };
}
