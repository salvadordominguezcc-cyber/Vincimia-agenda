// Promotores HUMANOS — Vincimia Agenda.
// Decisión de Salvador (2026-11-26): un solo bot unificado, SIN
// promotores virtuales. Aquí solo se administran los promotores
// humanos (Yessi, Sofía, Beatriz, Yesenia, etc.): nombre, teléfono,
// % de comisión y código automático. Las comisiones se liquidan solo
// sobre citas completadas. Los datos de ejemplo que aún traigan
// promotores virtuales viejos se filtran (campo is_virtual heredado).

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
import { money, type Promoter } from "@/lib/types";

const INPUT_CLASS =
  "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50";

/** Filtra promotores virtuales viejos que puedan quedar guardados
 *  en el navegador desde antes de la decisión del bot unificado. */
function isHuman(p: Promoter): boolean {
  return !(p as { is_virtual?: boolean }).is_virtual;
}

export default function PromotoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("10");

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const updateData = (next: StoreData) => {
    saveStore(next);
    setData(next);
  };

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
    updateData(next);
    setName("");
    setPhone("");
    setRate("10");
  };

  const humans = data.promoters.filter(isHuman);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Promotores</h1>
        <p className="text-sm text-slate-500">
          Las comisiones se liquidan <strong>solo sobre citas completadas</strong>{" "}
          (check-in en recepción). Las citas en pendiente, confirmadas,
          canceladas o en conflicto <strong>no</strong> generan comisión.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Los promotores son personas (Yessi, Sofía, Beatriz, Yesenia…).
          El bot que contesta por WhatsApp, Messenger e Instagram es uno
          solo y no es un promotor: solo importa el canal por el que
          llega el paciente.
        </p>
      </div>

      <h2 className="pt-2 text-xl font-bold">Promotores humanos</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {humans.map((p) => {
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
