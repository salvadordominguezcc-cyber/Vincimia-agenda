// Nueva cita del panel — mismo formulario y misma tarjeta que el link
// público (/reserva/[slug]). Antes este formulario era otro distinto:
// pedía la hora a mano (sin horarios libres), el teléfono no tenía
// selector de país y al guardar te sacaba a la Agenda sin mostrar
// ninguna tarjeta. Ahora los campos, el orden, el selector de país,
// los horarios libres y la tarjeta TU CITA son los mismos del link
// (ver src/components/BookingDesign.tsx).
//
// La cita del panel sigue guardándose solo en este aparato hasta
// subirla desde Ajustes: la tarjeta lo dice claro, como en el link.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { freeSlots } from "@/lib/anti-overlap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AppointmentCardView,
  BookingFields,
  ClinicBookingHeader,
} from "@/components/BookingDesign";
import {
  contactName,
  createAppointment,
  fmtTime,
  loadStore,
  saveAsConflict,
  type StoreData,
} from "@/lib/store";
import { todayISO } from "@/lib/demo-data";
import { type Appointment, type SourceType } from "@/lib/types";
import { formatPhoneDisplay, normalizePhone, type PhoneCountry } from "@/lib/phone";
import type { AppointmentCardData } from "@/lib/appointment-card";
import { AlertTriangle } from "lucide-react";

export default function NuevaCitaPage() {
  const router = useRouter();
  const [data, setData] = useState<StoreData | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  /** País del teléfono (selector del formulario, México por defecto):
   *  decide el prefijo con el que se guarda, igual que en el link. */
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>("MX");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [promoterId, setPromoterId] = useState("");
  const [source, setSource] = useState<SourceType>("vincimia_link");
  const [conflict, setConflict] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  /** Tarjeta TU CITA que se muestra al guardar (misma del link). */
  const [done, setDone] = useState(false);
  const [doneOnHold, setDoneOnHold] = useState(false);
  const [doneCard, setDoneCard] = useState<AppointmentCardData | null>(null);

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setServiceId(d.services[0]?.id ?? "");
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;
  const service = data.services.find((s) => s.id === serviceId);
  const doctor = data.doctors.find((d) => d.id === doctorId) ?? null;
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
  /** Teléfono completo en internacional sin "+" (52… México,
   *  1… Estados Unidos) según el país elegido. Así se guarda en
   *  este aparato y así se muestra en la tarjeta, igual que en
   *  el link. */
  const fullPhone = normalizePhone(clientPhone, phoneCountry) ?? clientPhone;

  const resetForm = () => {
    setClientName("");
    setClientPhone("");
    setPhoneCountry("MX");
    setServiceId(data.services[0]?.id ?? "");
    setDoctorId("");
    setDate(todayISO());
    setTime("");
    setPromoterId("");
    setSource("vincimia_link");
    setConflict(null);
    setError("");
    setDone(false);
    setDoneOnHold(false);
    setDoneCard(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflict(null);
    if (!time) {
      setError("Elige una hora libre de la lista.");
      return;
    }
    if (!service) {
      setError("Elige un servicio.");
      return;
    }
    const result = createAppointment(data, {
      clientName,
      clientPhone: fullPhone,
      serviceId,
      date,
      time,
      promoterId: promoterId || null,
      source,
      doctorId: doctorId || null,
    });
    if (!result.ok) {
      if (result.conflictWith) {
        setConflict(result.conflictWith);
        return;
      }
      setError(result.error ?? "No se pudo crear la cita.");
      return;
    }
    const onHold = result.appointment?.status === "on_hold";
    setDoneCard({
      clinicName: data.org.name,
      patientName: clientName,
      phone: formatPhoneDisplay(fullPhone),
      date,
      time,
      serviceName: service.name,
      doctorName: doctor?.name ?? null,
      price: service.price,
      status: onHold ? "En pausa" : "Pendiente por confirmar",
    });
    setDoneOnHold(onHold);
    setDone(true);
  };

  const saveConflict = () => {
    if (!conflict || !service) return;
    saveAsConflict(
      data,
      {
        clientName,
        clientPhone: fullPhone,
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
    <div className="mx-auto max-w-2xl space-y-4">
      {done && doneCard ? (
        <AppointmentCardView
          card={doneCard}
          title={`¡Cita registrada, ${clientName}!`}
          context="panel"
          onHold={doneOnHold}
          localOnly
          onCreateAnother={resetForm}
        />
      ) : (
        <>
          <ClinicBookingHeader org={data.org} compact />
          <p className="-mt-2 text-center text-xs text-slate-500">
            Nueva cita — se guarda en este aparato hasta subirla a la nube
            desde Ajustes.
          </p>

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

          <BookingFields
            data={data}
            clientName={clientName}
            onClientName={setClientName}
            clientPhone={clientPhone}
            onClientPhone={setClientPhone}
            phoneCountry={phoneCountry}
            onPhoneCountry={setPhoneCountry}
            serviceId={serviceId}
            onServiceId={(v) => {
              setServiceId(v);
              setTime("");
            }}
            doctorId={doctorId}
            onDoctorId={(v) => {
              setDoctorId(v);
              setTime("");
            }}
            date={date}
            onDate={(v) => {
              setDate(v);
              setTime("");
            }}
            time={time}
            onTime={setTime}
            slots={slots}
            submitLabel="Guardar cita"
            nameLabel="Nombre del cliente"
            onSubmit={submit}
            extraFields={
              <>
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
                  <p className="mt-1 text-xs text-slate-500">
                    Solo recepción: el paciente no lo ve. Los promotores se
                    controlan en su Excel.
                  </p>
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
              </>
            }
          />
          <div className="text-center">
            <Link href="/dashboard">
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
