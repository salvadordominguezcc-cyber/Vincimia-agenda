// Link público de reserva — mismo formulario y misma tarjeta TU CITA
// que Nueva cita del panel (/dashboard/nueva). El encabezado con
// Dr. Denti, los campos, el botón rosa y la tarjeta viven en
// src/components/BookingDesign.tsx y las dos rutas los usan igual.
//
// La lógica de guardado no cambió: primero se guarda aquí mismo
// (anti-empalme local); luego se intenta crearla en la nube y, si
// la nube la recibe, la cita local adopta el id de la nube para que
// el panel la vea como cita de la nube y al confirmarla dispare
// Google + WhatsApp + aviso al dueño. Si la nube no la recibe, la
// cita queda solo en este aparato y la tarjeta lo dice claro.

"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import Link from "next/link";
import { freeSlots } from "@/lib/anti-overlap";
import { todayISO } from "@/lib/demo-data";
import {
  adoptCloudAppointmentId,
  contactName,
  createAppointment,
  doctorById,
  loadStore,
  type StoreData,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AppointmentCardView,
  BookingFields,
  ClinicBookingHeader,
} from "@/components/BookingDesign";
import { fetchPublicCatalog, mergeCatalogIntoStore } from "@/lib/cloud-sync";
import { formatPhoneDisplay, normalizePhone, type PhoneCountry } from "@/lib/phone";
import type { AppointmentCardData } from "@/lib/appointment-card";
import type { Appointment } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export default function ReservaPage({
  params,
}: {
  params: { slug: string };
}) {
  const [data, setData] = useState<StoreData | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  /** País del teléfono del paciente (selector del formulario,
   *  México por defecto): decide el prefijo con el que se guarda y
   *  se confirma por WhatsApp. Un número de EUA sin este dato se
   *  leía como mexicano y la confirmación nunca llegaba. */
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>("MX");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [conflict, setConflict] = useState<Appointment | null>(null);
  const [done, setDone] = useState(false);
  const [doneOnHold, setDoneOnHold] = useState(false);
  const [error, setError] = useState("");
  /** true cuando la cita quedó solo en este aparato: la nube no la
   *  recibió (sin conexión o sin Supabase) y por eso no llega a
   *  Google Calendar ni se manda la confirmación por WhatsApp. */
  const [localOnly, setLocalOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** true cuando ya se intentó traer el catálogo de la nube para
   *  este enlace: hasta entonces no se dice "Negocio no encontrado",
   *  porque el enlace real (clinica-dentiplus) solo vive en la nube
   *  y en este aparato todavía está el demo. */
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  /** Datos de la tarjeta "TU CITA" que se muestra al registrarse:
   *  solo valores reales de la reserva y del negocio, nada inventado. */
  const [doneCard, setDoneCard] = useState<AppointmentCardData | null>(null);

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setServiceId(d.services[0]?.id ?? "");
    // El link trae de la nube los servicios y doctores reales del
    // negocio (y sus horarios y descanso), solo en memoria: no se
    // escribe nada en el localStorage del paciente. Si no hay
    // conexión, se sigue con lo del aparato como antes.
    fetchPublicCatalog(params.slug)
      .then((catalog) => {
        if (!catalog || !catalog.org) return;
        const merged = mergeCatalogIntoStore(loadStore(), catalog, false);
        setData(merged);
        setServiceId((prev) =>
          merged.services.some((s) => s.id === prev)
            ? prev
            : merged.services[0]?.id ?? ""
        );
        setDoctorId((prev) =>
          (merged.doctors ?? []).some((doc) => doc.id === prev) ? prev : ""
        );
      })
      .catch(() => {
        // Sin conexión se sigue con lo del aparato.
      })
      .finally(() => setCatalogLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="p-6 text-slate-500">Cargando…</p>;

  if (params.slug !== data.org.slug && !catalogLoaded) {
    return <p className="p-6 text-slate-500">Cargando…</p>;
  }

  if (params.slug !== data.org.slug) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-semibold">Negocio no encontrado</p>
            <p className="text-sm text-slate-500">
              El link <code>/reserva/{params.slug}</code> no corresponde a
              ningún negocio en este demo. Prueba con{" "}
              <Link href="/reserva/clinica-dentiplus" className="text-brand-700 underline">
                /reserva/clinica-dentiplus
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
  /** Teléfono completo en internacional sin "+" (52… México,
   *  1… Estados Unidos) según el país elegido. Así se guarda en
   *  la nube y en este aparato, y así se muestra en la tarjeta. */
  const fullPhone = normalizePhone(clientPhone, phoneCountry) ?? clientPhone;
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

  const resetForm = () => {
    setClientName("");
    setClientPhone("");
    setPhoneCountry("MX");
    setServiceId(data.services[0]?.id ?? "");
    setDoctorId("");
    setDate(todayISO());
    setTime("");
    setConflict(null);
    setError("");
    setDone(false);
    setDoneOnHold(false);
    setLocalOnly(false);
    setDoneCard(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflict(null);
    setLocalOnly(false);
    if (!time) {
      setError("Elige una hora libre de la lista.");
      return;
    }
    // 1) Se guarda aquí mismo (anti-empalme local, como antes).
    const result = createAppointment(data, {
      clientName,
      clientPhone: fullPhone,
      serviceId,
      date,
      time,
      promoterId: null,
      source: "vincimia_link",
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
    // 2) Se intenta crearla también en la nube: solo ahí llega a
    // Google Calendar y a la confirmación por WhatsApp. Si la nube
    // no responde, la cita queda guardada aquí y se avisa claro que
    // quedó solo en este aparato, sin inventar que se sincronizó.
    setSubmitting(true);
    let onHold = result.appointment?.status === "on_hold";
    let onlyLocal = false;
    try {
      const res = await fetch("/api/appointments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: params.slug,
          client_name: clientName,
          client_phone: fullPhone,
          phone_country: phoneCountry,
          service_name: service?.name ?? "",
          date,
          time,
          doctor_id: doctorId || null,
          doctor_name: doctor?.name ?? null,
          // La duración del servicio en este aparato: si en la nube
          // no existe un servicio con ese nombre, el servidor usa
          // esta duración y no adivina 45 min.
          duration_minutes: service?.duration_minutes ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        appointment_id?: string;
        status?: string;
        message?: string;
      };
      if (res.ok && json.ok && json.appointment_id && result.appointment) {
        // La cita local adopta el id de la nube: el panel ya la ve
        // como cita de la nube y al confirmarla dispara Google +
        // WhatsApp + aviso al dueño.
        adoptCloudAppointmentId(data, result.appointment.id, json.appointment_id);
        onHold = json.status === "on_hold";
      } else {
        // La nube no la recibió (sin conexión, sin Supabase, o el
        // horario ya se ocupó allá): queda solo en este aparato.
        onlyLocal = true;
      }
    } catch {
      onlyLocal = true;
    } finally {
      setSubmitting(false);
    }
    if (service) {
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
    }
    setLocalOnly(onlyLocal);
    setDoneOnHold(onHold);
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        {done && doneCard ? (
          <AppointmentCardView
            card={doneCard}
            title={`¡Cita registrada, ${clientName}!`}
            context="link"
            onHold={doneOnHold}
            localOnly={localOnly}
            onCreateAnother={resetForm}
          />
        ) : (
          <>
            <ClinicBookingHeader org={data.org} />
            {conflict && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Ese horario se acaba de ocupar por{" "}
                {contactName(data, conflict.contact_id)}. Elige otro horario
                libre de la lista.
              </p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
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
              submitting={submitting}
              submitLabel="Reservar mi cita"
              onSubmit={submit}
            />
          </>
        )}
      </main>
    </div>
  );
}
