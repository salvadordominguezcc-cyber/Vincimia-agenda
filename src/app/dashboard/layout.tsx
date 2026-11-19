// Layout del panel — con guard de autenticación.
// Cuando Supabase está configurado, el panel exige sesión: sin sesión se
// redirige a /login?next=<ruta>. Cuando NO está configurado (modo demo
// local, sin variables de entorno), el panel abre como antes, sin login.
// La protección es en el navegador: las páginas del panel son estáticas y
// los datos demo viven en localStorage; los datos reales en Supabase están
// protegidos por RLS y las rutas /api/* usan la service_role en el servidor.
// La reserva pública (/reserva/[slug]) y la portada (/) NO pasan por aquí
// y siguen públicas.

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureMembership } from "@/lib/auth";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { loadStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Agenda" },
  { href: "/dashboard/calendario", label: "Calendario" },
  { href: "/dashboard/nueva", label: "Nueva cita" },
  { href: "/dashboard/doctores", label: "Doctores" },
  { href: "/dashboard/promotores", label: "Promotores" },
  { href: "/dashboard/servicios", label: "Servicios" },
  { href: "/dashboard/conectores", label: "Conectores" },
  { href: "/dashboard/link", label: "Link público" },
  { href: "/dashboard/ajustes", label: "Ajustes" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  // Enlace actual del negocio (cambia en Ajustes); si aún no se ha
  // cargado, se usa el de ejemplo.
  const [orgSlug, setOrgSlug] = useState("clinica-sonrisa");
  const demo = !supabaseConfigured();

  useEffect(() => {
    try {
      setOrgSlug(loadStore().org.slug || "clinica-sonrisa");
    } catch {
      // Se queda el de ejemplo.
    }
  }, []);

  useEffect(() => {
    if (demo) {
      setChecking(false);
      return;
    }
    const client = supabaseBrowser();
    if (!client) {
      setChecking(false);
      return;
    }
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
        return;
      }
      setEmail(session.user.email ?? null);
      await ensureMembership();
      setChecking(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
      } else {
        setEmail(session.user.email ?? null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [demo, pathname, router]);

  const signOut = async () => {
    const client = supabaseBrowser();
    if (client) await client.auth.signOut();
    router.replace("/login");
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-500">
        Verificando sesión…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pt-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Logo className="h-8 w-8" />
            Vincimia Agenda
          </Link>
          {demo ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Modo demo — datos de ejemplo, nada en la nube
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              Conectado a Supabase
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {email && (
              <span className="hidden text-sm text-slate-600 sm:inline">{email}</span>
            )}
            <Link
              href={`/reserva/${orgSlug}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Ver link público →
            </Link>
            {!demo && (
              <Button variant="outline" size="sm" onClick={signOut}>
                Cerrar sesión
              </Button>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 pt-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                pathname === item.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
