// Página 404 personalizada de Dentiplus Mexicali: mismo diseño que el
// link de reserva (fondo celeste, Dr. Denti, rosa mexicano / morado /
// azul marino / turquesa, letra gruesa redondeada). Sin el aspecto
// genérico de error de Next.js.
//
// Es componente de cliente porque necesita la ruta real que abrió el
// visitante: al montarse la reporta a /api/not-found/log. Si la ruta
// era un link de reserva roto (/reserva/...), el dueño recibe un aviso
// por WhatsApp (máximo 1 por ruta por hora); los demás 404 solo quedan
// registrados, sin aviso.

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const BOOKING_URL = "/reserva/clinica-dentiplus";

export default function NotFound() {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    fetch("/api/not-found/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {
      // Si el registro falla, la página 404 se muestra igual.
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#dbeafe] via-[#e0f2fe] to-[#cffafe] px-4 py-8 text-slate-900">
      <main className="w-full max-w-xl text-center">
        <div className="overflow-hidden rounded-3xl bg-white/80 px-4 py-8 shadow-sm">
          <div className="mx-auto aspect-[3/4] w-32 overflow-hidden rounded-2xl">
            <img
              src="/dr-denti.webp"
              alt="Dr. Denti"
              className="h-full w-full object-cover object-top"
            />
          </div>
          <p className="mt-4 text-sm font-bold tracking-wide text-[#8b5cf6]">
            DENTIPLUS MEXICALI
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-[#1e1b4b]">
            Esta página no existe
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600">
            El link que abriste ya no está disponible o se escribió mal. No te
            preocupes, tu sonrisa sigue en buenas manos.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={BOOKING_URL}
              className="rounded-full bg-[#ec4899] px-6 py-3 text-base font-extrabold text-white shadow-sm"
            >
              Agendar cita
            </Link>
            <Link
              href="/"
              className="rounded-full bg-white px-6 py-3 text-base font-extrabold text-[#1e1b4b] shadow-sm ring-1 ring-slate-200"
            >
              Volver al inicio
            </Link>
          </div>
          <p className="mt-6 text-sm font-medium text-slate-500">
            ¿Necesitas ayuda? Escríbenos por WhatsApp al +52 663 328 0701.
          </p>
        </div>
      </main>
    </div>
  );
}
