"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contactName,
  fmtTime,
  loadStore,
  saveStore,
  serviceName,
  type StoreData,
} from "@/lib/store";
import { money } from "@/lib/types";

export default function PromotoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("10");

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const next: StoreData = {
      ...data,
      promoters: [
        ...data.promoters,
        {
          id: `prom-${Date.now()}`,
          organization_id: data.org.id,
          name: name.trim(),
          code: name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "PROM",
          phone: phone || null,
          commission_rate: Number(rate) || 0,
          active: true,
          created_at: new Date().toISOString(),
        },
      ],
    };
    saveStore(next);
    setData(next);
    setName("");
    setPhone("");
    setRate("10");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Promotores</h1>
        <p className="text-sm text-slate-500">
          Las comisiones se liquidan <strong>solo sobre citas completadas</strong>{" "}
          (check-in en recepción). Las citas en pendiente, confirmadas,
          canceladas o en conflicto <strong>no</strong> generan comisión.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.promoters.map((p) => {
          const mine = data.appointments.filter(
            (a) => a.promoter_id === p.id
          );
          const completed = mine.filter((a) => a.status === "completed");
          const totalCompleted = completed.reduce((s, a) => s + a.price, 0);
          const commission = (totalCompleted * p.commission_rate) / 100;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  {p.name} · {p.commission_rate} % · Código {p.code}
                </CardTitle>
                <p className="text-sm text-slate-500">
                  {p.phone ?? "Sin teléfono"} ·{" "}
                  {p.active ? "Activo" : "Inactivo"}
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Citas completadas: <strong>{completed.length}</strong> de{" "}
                  {mine.length} totales
                </p>
                <p>
                  Ventas por completadas:{" "}
                  <strong>{money(totalCompleted)}</strong>
                </p>
                <p className="text-base">
                  Comisión a liquidar:{" "}
                  <strong className="text-green-700">
                    {money(commission)}
                  </strong>
                </p>
                {completed.length > 0 && (
                  <ul className="list-disc pl-5 text-slate-600">
                    {completed.map((a) => (
                      <li key={a.id}>
                        {contactName(data, a.contact_id)} ·{" "}
                        {serviceName(data, a.service_id)} ·{" "}
                        {a.start_time.slice(0, 10)} {fmtTime(a.start_time)} ·{" "}
                        {money(a.price)} →{" "}
                        {money((a.price * p.commission_rate) / 100)}
                      </li>
                    ))}
                  </ul>
                )}
                {mine.filter((a) => a.status === "conflict").length > 0 && (
                  <p className="text-red-700">
                    {mine.filter((a) => a.status === "conflict").length} cita(s)
                    en conflicto: $0 de comisión.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar promotor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del promotor"
              className="w-56"
              required
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono"
              className="w-44"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="% comisión"
              className="w-28"
            />
            <Button type="submit">Agregar</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            En el modo demo los promotores se guardan solo en este navegador.
            En Supabase, la tabla es <code>promoters</code> con{" "}
            <code>commission_rate</code> en porcentaje.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
