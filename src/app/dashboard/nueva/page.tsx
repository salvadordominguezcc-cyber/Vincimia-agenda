"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DoctorChip } from "@/components/DoctorChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contactName,
  createAppointment,
  doctorById,
  doctorWorksAt,
  fmtTime,
  loadStore,
  saveAsConflict,
  type StoreData,
} from "@/lib/store";
import { todayISO } from "@/lib/demo-data";
import { money, SPECIALTY_LABEL, type Appointment, type SourceType } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export default function NuevaCitaPage() {
  const router = useRouter();
  const [data, setData] = useState<StoreData | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("09:00");
  const [promoterId, setPromoterId] = useState("");
  const [source, setSource] = useState<SourceType>("vincimia_link");
  const [conflict, setConflict] = useState<Appointment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setServiceId(d.services[0]?.id ?? "");
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;
  const service = data.services.find((s) => s.id === serviceId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflict(null);
    const result = createAppointment(data, {
      clientName,
      clientPhone,
      serviceId,
      date,
      time,
      promoterId: promoterId || null,
      source,
      doctorId: doctorId || null,
    });
    if (result.ok) {
      router.push("/dashboard");
      return;
    }
    if (result.conflictWith) {
      setConflict(result.conflictWith);
      return;
    }
    setError(result.error ?? "No se pudo crear la cita.");
  };

  const saveConflict = () => {
    if (!conflict) return;
    saveAsConflict(
      data,
      {
        clientName,
        clientPhone,
        serviceId,
        date,
        time,
        promoterId: promoterId || null,
        source,
        doctorId: doctorId || null,
      },
      conflict
    );
    router.push("/dashboard");
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nueva cita</h1>
        <p className="text-sm text-slate-500">
          El motor anti-empalmes valida el horario antes de guardar, con el
          buffer de {data.org.buffer_minutes} min de {data.org.name}.
        </p>
      </div>

      {conflict && (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Horario ocupado — cita NO guardada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-800">
            <p>
              {time} choca con{" "}
              <strong>
                {contactName(data, conflict.contact_id)} ·{" "}
                {fmtTime(conflict.start_time)}–{fmtTime(conflict.end_time)}
              </strong>{" "}
              ({conflict.status === "completed" ? "completada" : conflict.status}).
              Con el buffer de {data.org.buffer_minutes} min, ese hueco no
              está libre.
            </p>
            <p className="mt-2">
              Cambia la hora o guarda el intento como{" "}
              <strong>conflicto</strong> para dejar registro (no bloquea
              horarios ni genera comisión).
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" onClick={saveConflict}>
                Guardar como conflicto
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConflict(null)}>
                Cambiar la hora
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre del cliente *</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej. Roberto Gómez"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Teléfono</label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+52 …"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Servicio *</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {data.services
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration_minutes} min · {money(s.price)}
                    </option>
                  ))}
              </select>
              {service && (
                <p className="mt-1 text-xs text-slate-500">
                  Duración: {service.duration_minutes} min · Precio:{" "}
                  {money(service.price)}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Doctor (opcional)</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Sin asignar</option>
                {data.doctors
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {SPECIALTY_LABEL[d.specialty]}
                    </option>
                  ))}
              </select>
              {doctorId &&
                (() => {
                  const doc = doctorById(data, doctorId);
                  if (!doc) return null;
                  const weekday = new Date(`${date}T12:00:00`).getDay();
                  const day = doc.schedule.find((d) => d.weekday === weekday);
                  const works = service
                    ? doctorWorksAt(doc, date, time, service.duration_minutes)
                    : { ok: true };
                  return (
                    <p className="mt-1 text-xs text-slate-500">
                      <DoctorChip name={doc.name} color={doc.color} /> ·{" "}
                      {SPECIALTY_LABEL[doc.specialty]} ·{" "}
                      {day && day.active
                        ? `ese día atiende de ${day.start} a ${day.end}`
                        : "ese día no atiende"}
                      {!works.ok && service && (
                        <span className="font-medium text-red-700">
                          {" "}
                          — la cita a las {time} queda fuera de su horario.
                        </span>
                      )}
                      {doc.requires_deposit && (
                        <span className="mt-1 block rounded-lg bg-amber-50 p-2 font-medium text-amber-800">
                          Este doctor solo atiende con cita y anticipo: la
                          cita quedará en pausa hasta que la clínica confirme
                          los horarios y el paciente acepte. No se bloquea el
                          horario de inmediato.
                        </span>
                      )}
                    </p>
                  );
                })()}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Fecha *</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Hora *</label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Promotor (opcional)</label>
              <select
                value={promoterId}
                onChange={(e) => setPromoterId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Sin promotor</option>
                {data.promoters
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.commission_rate} %)
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Origen</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceType)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="vincimia_link">Recepción / Link público</option>
                <option value="google_calendar">Google Calendar</option>
                <option value="excel_promoter">Excel / Promotor</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Guardar cita</Button>
              <Link href="/dashboard">
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        Para probar el bloqueo: hoy, servicio Consulta General (45 min) a las
        10:00 o 10:15. Choca con Laura Méndez 10:00–11:00 + buffer.
      </p>
    </div>
  );
}
