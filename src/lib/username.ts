// Nombre de usuario — igual que en el POS de EL RODEO, adaptado.
// Supabase Auth solo acepta correo + contraseña, así que el usuario
// entra con su nombre de usuario y la app lo traduce a su correo:
// - Si tiene correo real, se guarda el usuario como alias en
//   user_metadata.username y se resuelve a ese correo.
// - Si no tiene correo real, se crea con un correo interno sintético
//   `<usuario>@vincimia.local` (nadie lo usa para entrar; el login
//   siempre es por el nombre de usuario).
// El usuario se guarda en minúsculas en user_metadata.username.

export const USERNAME_RE = /^[a-zA-Z0-9._]{3,}$/;
export const INTERNAL_EMAIL_DOMAIN = "vincimia.local";

export function normalizeUsername(v: unknown): string {
  return String(v || "").trim().toLowerCase();
}

export function usernameValid(u: string): boolean {
  return USERNAME_RE.test(u);
}

export function internalEmailFor(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}

export function usernameOf(user: { user_metadata?: Record<string, unknown> | null } | null): string | null {
  const u = normalizeUsername(user?.user_metadata?.username);
  return u || null;
}
