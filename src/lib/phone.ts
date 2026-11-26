// Teléfonos con país — Vincimia Agenda.
// México (+52) y Estados Unidos (+1). El formato canónico que se
// guarda es el internacional sin "+": 52 + 10 dígitos (México) o
// 1 + 10 dígitos (Estados Unidos). Sin esto, un número de EUA se
// leía como mexicano y la confirmación por WhatsApp nunca llegaba.
//
// Sin secretos ni llamadas de red: se puede importar desde el
// navegador (formulario, tarjeta, panel) y desde el servidor.

export type PhoneCountry = "MX" | "US";

export const PHONE_COUNTRIES: {
  code: PhoneCountry;
  label: string;
  prefix: string;
}[] = [
  { code: "MX", label: "México", prefix: "+52" },
  { code: "US", label: "Estados Unidos", prefix: "+1" },
];

export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** País por los propios dígitos: 12 dígitos con 52 → México;
 *  11 con 1 → Estados Unidos (formato E.164 que manda Meta en el
 *  webhook, sin "+"); lo demás (10 dígitos locales) → México, el
 *  comportamiento de antes. */
export function detectPhoneCountry(
  raw: string | null | undefined
): PhoneCountry {
  const digits = phoneDigits(raw);
  if (digits.length === 12 && digits.startsWith("52")) return "MX";
  if (digits.length === 11 && digits.startsWith("1")) return "US";
  return "MX";
}

/** Normaliza a formato internacional sin "+".
 *  MX: 10 dígitos → 52 + número; 12 con 52 → tal cual; 11 con 1 →
 *  52 + resto (móvil mexicano con el 1 viejo, formato 044).
 *  US: 10 dígitos → 1 + número; 11 con 1 → tal cual.
 *  Un número de EUA nunca se convierte en 52. */
export function normalizePhone(
  raw: string | null | undefined,
  country: PhoneCountry = "MX"
): string | null {
  const digits = phoneDigits(raw);
  if (!digits) return null;
  if (country === "US") {
    if (digits.length === 11 && digits.startsWith("1")) return digits;
    if (digits.length === 10) return `1${digits}`;
    if (digits.length === 12 && digits.startsWith("52")) return digits;
    return digits;
  }
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  if (digits.length === 11 && digits.startsWith("1"))
    return `52${digits.slice(1)}`;
  return digits;
}

/** Normaliza un teléfono ya guardado: el país se detecta de los
 *  propios dígitos (los guardados ya vienen en internacional, y los
 *  viejos locales de México son de 10 dígitos). */
export function normalizeStoredPhone(
  raw: string | null | undefined
): string | null {
  return normalizePhone(raw, detectPhoneCountry(raw));
}

/** "526861140969" → "+52 686 114 0969";
 *  "16195550123" → "+1 619 555 0123".
 *  Si no se reconoce el formato, se devuelve el texto tal cual. */
export function formatPhoneDisplay(
  raw: string | null | undefined
): string {
  const digits = phoneDigits(raw);
  if (!digits) return (raw ?? "").trim();
  const country = detectPhoneCountry(raw);
  if (country === "MX" && digits.length === 12 && digits.startsWith("52")) {
    const n = digits.slice(2);
    return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  if (country === "US" && digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1);
    return `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  if (digits.length === 10) {
    return `+52 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return (raw ?? "").trim();
}

/** Dígitos listos para tel:/wa.me: el internacional completo. */
export function phoneDialDigits(
  raw: string | null | undefined
): string {
  return normalizeStoredPhone(raw) ?? phoneDigits(raw);
}
