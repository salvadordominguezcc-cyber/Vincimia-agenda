// Cliente de Supabase para el navegador.
// Reutiliza el patrón del POS de EL RODEO: si faltan
// las variables de entorno, devuelve null y la app entra en MODO DEMO
// (datos de ejemplo en pantalla, nada se guarda en la nube).
// La llave anon es pública por diseño; la service_role NUNCA va aquí.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function supabaseBrowser(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
  }
  return browserClient;
}

// Cliente de servidor (rutas /api/*). Usa la service_role y solo vive
// en el servidor: nunca se importa desde un componente del navegador.
export function supabaseServer(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}
