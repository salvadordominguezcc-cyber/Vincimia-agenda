"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadStore, saveStore, type StoreData } from "@/lib/store";
import { money } from "@/lib/types";

export default function ServiciosPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("45");
  const [price, setPrice] = useState("");

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const update = (next: StoreData) => {
    saveStore(next);
    setData(next);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update({
      ...data,
      services: [
        ...data.services,
        {
          id: `svc-${Date.now()}`,
          organization_id: data.org.id,
          name: name.trim(),
          duration_minutes: Number(duration) || 45,
          price: Number(price) || 0,
          follow_up_days: 30,
          active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setName("");
    setDuration("45");
    setPrice("");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Servicios</h1>
        <p className="text-sm text-slate-500">
          La duración de cada servicio es la que usa el motor anti-empalmes
          para calcular si dos citas se traslapan.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.services.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-slate-600">
                  {s.duration_minutes} min · {money(s.price)} · Seguimiento a
                  los {s.follow_up_days} días
                </p>
                <p className="text-xs text-slate-500">
                  {s.active ? "Activo" : "Inactivo"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update({
                      ...data,
                      services: data.services.map((x) =>
                        x.id === s.id ? { ...x, active: !x.active } : x
                      ),
                    })
                  }
                >
                  {s.active ? "Desactivar" : "Activar"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    update({
                      ...data,
                      services: data.services.filter((x) => x.id !== s.id),
                    })
                  }
                >
                  Borrar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar servicio</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del servicio"
              className="w-56"
              required
            />
            <Input
              type="number"
              min="5"
              step="5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Minutos"
              className="w-28"
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Precio MXN"
              className="w-32"
            />
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
