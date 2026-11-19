import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CalendarCheck,
  FileSpreadsheet,
  Link2,
  ShieldCheck,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Motor anti-empalmes",
    text: "Ninguna cita se guarda si choca con otra, considerando el buffer configurable (15 min por defecto). Si choca, queda marcada como conflicto.",
  },
  {
    icon: CalendarCheck,
    title: "Agenda unificada",
    text: "Google Calendar, promotores por Sheets y link público en una sola agenda, por negocio.",
  },
  {
    icon: Link2,
    title: "Link público de reserva",
    text: "Cada negocio tiene su link (vincimia.link/slug): el cliente reserva solo y la cita nace en pendiente.",
  },
  {
    icon: FileSpreadsheet,
    title: "Promotores por Sheets",
    text: "El promotor anota en Google Sheets y el webhook valida el horario. Si está ocupado, la hoja lo marca como conflicto.",
  },
  {
    icon: Users,
    title: "Comisiones solo por cita completada",
    text: "El panel de Promotores liquida comisiones únicamente sobre citas con check-in (completed).",
  },
  {
    icon: AlertTriangle,
    title: "WhatsApp: Fase 2, pendiente",
    text: "El bot de WhatsApp IA y la confirmación automática NO están en este MVP. Quedan marcados como pendientes, sin simularse.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <Logo />
            Vincimia Agenda
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/reserva/clinica-sonrisa">
              <Button variant="ghost">Reservar cita</Button>
            </Link>
            <Link href="/login">
              <Button>Entrar</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 text-center sm:py-24">
          <div className="mb-5 flex justify-center">
            <Logo className="h-20 w-20 shadow-md" />
          </div>
          <p className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            MVP · Agenda inteligente · Sin citas empalmadas
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            La agenda que no deja empalmar citas
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Vincimia Agenda unifica Google Calendar, los promotores
            de Google Sheets y tu link público de reserva en una sola agenda,
            con motor anti-empalmes y comisiones por cita completada.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login">
              <Button size="lg">Entrar al panel</Button>
            </Link>
            <Link href="/reserva/clinica-sonrisa">
              <Button size="lg" variant="outline">
                Probar el link público
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            El panel requiere cuenta (correo y contraseña). La reserva
            pública no pide login: el cliente reserva solo y la cita nace en
            pendiente.
          </p>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="h-6 w-6 text-brand-600" />
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        Vincimia Agenda · MVP · Next.js + Supabase + Cloudflare
        Pages · Bot de WhatsApp: Fase 2, pendiente.
      </footer>
    </div>
  );
}
