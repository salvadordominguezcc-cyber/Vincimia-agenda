"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import Link from "next/link";
import { freeSlots } from "@/lib/anti-overlap";
import { todayISO } from "@/lib/demo-data";
import {
  contactName,
  createAppointment,
  doctorById,
  loadStore,
  type StoreData,
} from "@/lib/store";
import { money, SPECIALTY_LABEL, type Appointment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DoctorChip } from "@/components/DoctorChip";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function ReservaPage({
  params,
}: {
  params: { slug: string };
}) {
  const [data, setData] = useState<StoreData | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [conflict, setConflict] = useState<Appointment | null>(null);
  const [done, setDone] = useState(false);
  const [doneOnHold, setDoneOnHold] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setServiceId(d.services[0]?.id ?? "");
  }, []);

  if (!data) return <p className="p-6 text-slate-500">Cargando…</p>;

  if (params.slug !== data.org.slug) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-semibold">Negocio no encontrado</p>
            <p className="text-sm text-slate-500">
              El link <code>/reserva/{params.slug}</code> no corresponde a
              ningún negocio en este demo. Prueba con{" "}
              <Link href="/reserva/clinica-sonrisa" className="text-brand-700 underline">
                /reserva/clinica-sonrisa
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const service = data.services.find((s) => s.id === serviceId);
  const doctor = doctorById(data, doctorId || null);
  const slots = service
    ? freeSlots(
        date,
        service.duration_minutes,
        data.appointments,
        data.org.buffer_minutes,
        doctor ? doctor.schedule : null,
        doctor ? doctor.id : null,
        { start: data.org.break_start, end: data.org.break_end }
      )
    : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflict(null);
    if (!time) {
      setError("Elige una hora libre de la lista.");
      return;
    }
    const result = createAppointment(data, {
      clientName,
      clientPhone,
      serviceId,
      date,
      time,
      promoterId: null,
      source: "vincimia_link",
      doctorId: doctorId || null,
    });
    if (result.ok) {
      setDoneOnHold(result.appointment?.status === "on_hold");
      setDone(true);
      return;
    }
    if (result.conflictWith) {
      setConflict(result.conflictWith);
      return;
    }
    setError(result.error ?? "No se pudo crear la cita.");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <Logo />
          <div>
            <p className="font-bold leading-tight">Vincimia Agenda</p>
            <p className="text-xs text-slate-500">Reserva en línea</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {done ? (
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <h1 className="mt-3 text-xl font-bold">
                ¡Cita registrada, {clientName}!
              </h1>
              <p className="mt-2 text-slate-600">
                {service?.name} · {date} a las {time} · {service && money(service.price)}
              </p>
              {doctor && (
                <p className="mt-1 text-sm text-slate-600">
                  Con <DoctorChip name={doctor.name} color={doctor.color} /> ·{" "}
                  {SPECIALTY_LABEL[doctor.specialty]}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                {doneOnHold ? (
                  <>
                    Tu cita quedó <strong>en pausa</strong>: este doctor solo
                    atiende con cita y anticipo. La clínica revisará los
                    horarios del doctor y te propondrá cuándo puede atenderte.
                    Cuando aceptes, tu cita se confirma. Todavía no se cobra
                    nada en línea.
                  </>
                ) : (
                  <>
                    Quedó en <strong>pendiente</strong>. La clínica te
                    confirmará por teléfono. No hay confirmación automática
                    por WhatsApp en este MVP (Fase 2).
                  </>
                )}
              </p>
              <Link href="/dashboard" className="mt-5 inline-block">
                <Button variant="outline">Verla en la agenda (demo)</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Reserva tu cita — {data.org.name}</CardTitle>
              <p className="text-sm text-slate-500">
                Solo se muestran horarios libres: el motor anti-empalmes ya
                quitó los ocupados y el buffer de {data.org.buffer_minutes}{" "}
                min.
                {data.org.break_start && data.org.break_end && (
                  <>
                    {" "}Tiempo de descanso de {data.org.break_start} a{" "}
                    {data.org.break_end}: en esa hora no hay citas.
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent>
              {conflict && (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Ese horario se acaba de ocupar por{" "}
                  {contactName(data, conflict.contact_id)}. Elige otro horario
                  libre de la lista.
                </p>
              )}
              {error && (
                <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </p>
              )}
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Tu nombre *</label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nombre completo"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Teléfono *</label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+52 …"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Servicio *</label>
                  <select
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      setTime("");
                    }}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    {data.services
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.duration_minutes} min ·{" "}
                          {money(s.price)}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Doctor (opcional)</label>
                  <select
                    value={doctorId}
                    onChange={(e) => {
                      setDoctorId(e.target.value);
                      setTime("");
                    }}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Sin preferencia</option>
                    {data.doctors
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {SPECIALTY_LABEL[d.specialty]}
                        </option>
                      ))}
                  </select>
                  {doctor && (
                    <p className="mt-1 text-xs text-slate-500">
                      Solo se muestran los horarios en los que atiende{" "}
                      {doctor.name}.
                      {doctor.requires_deposit && (
                        <span className="mt-1 block rounded-lg bg-amber-50 p-2 font-medium text-amber-800">
                          Este doctor solo atiende con cita y anticipo: tu
                          cita quedará en pausa hasta que la clínica confirme
                          los horarios y tú aceptes. No se bloquea el horario
                          de inmediato.
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha *</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setTime("");
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Horarios libres *
                  </label>
                  {slots.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      No quedan horarios libres ese día para este servicio.
                      Prueba otra fecha.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {slots.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setTime(s)}
                          className={
                            time === s
                              ? "rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
                              : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={!time}>
                  Reservar cita
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
