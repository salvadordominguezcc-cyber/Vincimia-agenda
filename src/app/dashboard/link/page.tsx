"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStore, saveStore, type StoreData } from "@/lib/store";

export default function LinkPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const publicPath = `/reserva/${data.org.slug}`;
  const publicUrl = `${origin}${publicPath}`;
  // Dominio público previsto en el Documento Maestro: vincimia.link/slug
  const prettyUrl = `https://vincimia.link/${data.org.slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const setBuffer = (minutes: number) => {
    const next: StoreData = {
      ...data,
      org: { ...data.org, buffer_minutes: minutes },
    };
    saveStore(next);
    setData(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Link público de reserva</h1>
        <p className="text-sm text-slate-500">
          El cliente reserva solo desde este link. La cita nace en{" "}
          <strong>pending</strong> y el contacto se crea si no existe.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-lg bg-brand-50 p-3 font-mono text-sm text-brand-700">
            {prettyUrl}
          </p>
          <p className="text-sm text-slate-600">
            Link real en este despliegue:{" "}
            <code className="rounded bg-slate-100 px-1">{publicUrl}</code>
          </p>
          <div className="flex gap-2">
            <Button onClick={copy}>{copied ? "¡Copiado!" : "Copiar link"}</Button>
            <Link href={publicPath}>
              <Button variant="outline">Abrir como cliente</Button>
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            El dominio vincimia.link es el previsto en el Documento Maestro;
            hoy el link funciona con el dominio de tu despliegue
            (.pages.dev). Para usar vincimia.link hay que comprar el dominio
            y apuntarlo a Cloudflare.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buffer anti-empalme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Margen que se suma después de cada cita antes de permitir la
            siguiente. Hoy:{" "}
            <strong>{data.org.buffer_minutes} minutos</strong>.
          </p>
          <div className="flex gap-2">
            {[5, 10, 15, 30].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={data.org.buffer_minutes === m ? "default" : "outline"}
                onClick={() => setBuffer(m)}
              >
                {m} min
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Ejemplo: una cita de 45 min a las 10:00 termina 10:45; con 15 min
            de buffer, la siguiente no puede empezar antes de las 11:00.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Negocio (Org #1)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            <strong>{data.org.name}</strong> · slug{" "}
            <code>{data.org.slug}</code>
          </p>
          <p className="text-slate-600">
            Servicios activos:{" "}
            {data.services.filter((s) => s.active).length} · Promotores:{" "}
            {data.promoters.filter((p) => p.active).length}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
