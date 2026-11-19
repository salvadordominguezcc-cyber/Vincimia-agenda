// Nombre del doctor con el fondo de su color y letra que contraste.
// El color es el que se pone en Doctores y se puede cambiar cuando se
// quiera; el texto es blanco o casi negro según lo claro u oscuro que
// sea el color, para que siempre se lea bien (contraste W3C).

/** Letra legible sobre un fondo de color: blanca o casi negra. */
export function textOnColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const channel = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.179 ? "#111827" : "#ffffff";
}

export function DoctorChip({
  name,
  color,
  className = "",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${className}`}
      style={{ backgroundColor: color, color: textOnColor(color) }}
    >
      {name}
    </span>
  );
}
