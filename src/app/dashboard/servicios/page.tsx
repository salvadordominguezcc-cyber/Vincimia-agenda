// Servicios — cada cambio (agregar, editar, activar, borrar) se
// guarda aquí mismo y también en la nube (Supabase, tabla services),
// para que el link, el anti-empalme y Google Calendar usen la misma
// duración y el mismo precio. Si la nube falla, el cambio queda
// guardado aquí y la página lo dice en lenguaje normal.

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadStore, saveStore, type StoreData } from "@/lib/store";
import {
  deleteServiceFromCloud,
  fetchCatalog,
  mergeCatalogIntoStore,
  saveServiceToCloud,
} from "@/lib/cloud-sync";
import { supabaseConfigured } from "@/lib/supabase";
import { money, type Service } from "@/lib/types";

export default function ServiciosPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("45");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const d = loadStore();
    setData(d);
    // Al entrar, la nube manda: si en la nube hay servicios (con su
    // duración y precio reales), esos son los que se muestran. Los
    // que solo viven en el aparato se conservan.
    if (supabaseConfigured()) {
      fetchCatalog(d.org.id, d.org.excel_webhook_secret)
        .then((catalog) => {
          const merged = mergeCatalogIntoStore(loadStore(), catalog);
          setData(merged);
        })
        .catch(() => {
          // Sin conexión a la nube se sigue con lo del aparato.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const update = (next: StoreData) => {
    saveStore(next);
    setData(next);
  };

  /** Guarda el servicio en la nube y, si la nube le dio otro id
   *  (porque ya existía con ese nombre), adopta el id de la nube. */
  const syncService = async (service: Service) => {
    const result = await saveServiceToCloud(data, service);
    if (result.ok) {
      const cloud = result.row?.service as Service | undefined;
      if (cloud && cloud.id !== service.id) {
        const next: StoreData = {
          ...data,
          services: data.services.map((s) =>
            s.id === service.id ? { ...s, id: cloud.id } : s
          ),
          appointments: data.appointments.map((a) =>
            a.service_id === service.id ? { ...a, service_id: cloud.id } : a
          ),
        };
        update(next);
      }
      setMessage("Listo, el servicio quedó guardado también en la nube.");
    } else {
      setError(
        "Se guardó aquí, pero no se pudo guardar en la nube. Revisa tu conexión e inténtalo de nuevo."
      );
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setMessage("");
    setError("");
    const service: Service = {
      id: editingId ?? `svc-${Date.now()}`,
      organization_id: data.org.id,
      name: name.trim(),
      duration_minutes: Number(duration) || 45,
      price: Number(price) || 0,
      follow_up_days: 30,
      active: true,
      created_at: new Date().toISOString(),
    };
    const next: StoreData = {
      ...data,
      services: editingId
        ? data.services.map((s) => (s.id === editingId ? { ...service, active: s.active, created_at: s.created_at } : s))
        : [...data.services, service],
    };
    update(next);
    setEditingId(null);
    setName("");
    setDuration("45");
    setPrice("");
    void syncService(service);
  };

  const startEdit = (s: Service) => {
    setEditingId(s.id);
    setName(s.name);
    setDuration(String(s.duration_minutes));
    setPrice(String(s.price));
    setMessage("");
    setError("");
  };

  const toggle = (s: Service) => {
    const updated = { ...s, active: !s.active };
    update({
      ...data,
      services: data.services.map((x) => (x.id === s.id ? updated : x)),
    });
    setMessage("");
    setError("");
    void syncService(updated);
  };

  const remove = (s: Service) => {
    update({
      ...data,
      services: data.services.filter((x) => x.id !== s.id),
    });
    setMessage("");
    setError("");
    void (async () => {
      const result = await deleteServiceFromCloud(data, s.id);
      setMessage(
        result.ok
          ? "Listo, el servicio se borró también de la nube."
          : "Se borró aquí, pero no se pudo borrar de la nube. Revisa tu conexión e inténtalo de nuevo."
      );
    })();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Servicios</h1>
        <p className="text-sm text-slate-500">
          La duración de cada servicio es la que usa el motor anti-empalmes
          para calcular si dos citas se traslapan. Lo que cambies aquí se
          guarda también en la nube, para que el link use la misma duración.
        </p>
      </div>

      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

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
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggle(s)}>
                  {s.active ? "Desactivar" : "Activar"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(s)}>
                  Borrar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar servicio" : "Agregar servicio"}</CardTitle>
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
            <Button type="submit">{editingId ? "Guardar cambios" : "Agregar"}</Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setDuration("45");
                  setPrice("");
                }}
              >
                Cancelar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
