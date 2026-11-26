// Diseño Dentiplus para agendar cita — COMPARTIDO por el link público
// (/reserva/[slug]) y por Nueva cita del panel (/dashboard/nueva).
// Antes cada ruta tenía su propio formulario con campos, textos y
// colores distintos; Salvador pidió homologarlos. Por eso el encabezado
// con Dr. Denti, los campos, el botón rosa y la tarjeta TU CITA viven
// aquí una sola vez y las dos páginas los usan igual.
//
// Los datos (nombre, dirección, horario, servicios, precios) vienen
// del negocio en Ajustes/nube, nunca quemados: el encabezado lee
// org.name / org.address / org.hours_text y los servicios/doctores
// vienen de data.services / data.doctors.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DoctorChip } from "@/components/DoctorChip";
import { doctorById, doctorWorksAt, type StoreData } from "@/lib/store";
import { money, SPECIALTY_LABEL, type Organization } from "@/lib/types";
import { PHONE_COUNTRIES, type PhoneCountry } from "@/lib/phone";
import {
  buildWhatsAppShareUrl,
  cardRows,
  CLINIC_WHATSAPP_DISPLAY,
  receptionNote,
  saveAppointmentCard,
  type AppointmentCardData,
} from "@/lib/appointment-card";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Info,
  MapPin,
  MessageCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Encabezado con Dr. Denti + datos de la clínica
// ---------------------------------------------------------------------------

export function ClinicBookingHeader({
  org,
  compact = false,
}: {
  org: Organization;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#dbeafe] via-[#e0f2fe] to-[#cffafe] px-4 py-5 text-center shadow-sm">
      <div
        className={
          compact
            ? "mx-auto aspect-[3/4] w-24 overflow-hidden rounded-2xl"
            : "mx-auto aspect-[3/4] w-48 overflow-hidden rounded-2xl"
        }
      >
        {/* Dr. Denti 3D oficial (public/dr-denti.webp). La imagen es
            vertical: el recorte 3/4 desde arriba muestra espejo, cara
            y cepillo sin cortar la cara. */}
        <img
          src="/dr-denti.webp"
          alt="Dr. Denti"
          className="h-full w-full object-cover object-top"
        />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold leading-tight text-[#1e1b4b]">
        {org.name}
      </h1>
      <p className="text-base font-bold text-[#8b5cf6]">
        Tu sonrisa en buenas manos
      </p>
      {(org.address || org.hours_text) && (
        <div className="mx-auto mt-4 max-w-md space-y-2 rounded-2xl bg-white p-4 text-left shadow-sm">
          {org.address && (
            <p className="flex items-start gap-2 text-sm font-medium text-slate-800">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#ec4899]" />
              {org.address}
            </p>
          )}
          {org.hours_text && (
            <p className="flex items-start gap-2 text-sm font-medium text-slate-800">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#06b6d4]" />
              {org.hours_text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campos del formulario de reserva (los mismos en el link y en el panel)
// ---------------------------------------------------------------------------

export interface BookingFieldsProps {
  data: StoreData;
  clientName: string;
  onClientName: (v: string) => void;
  clientPhone: string;
  onClientPhone: (v: string) => void;
  phoneCountry: PhoneCountry;
  onPhoneCountry: (c: PhoneCountry) => void;
  serviceId: string;
  onServiceId: (v: string) => void;
  doctorId: string;
  onDoctorId: (v: string) => void;
  date: string;
  onDate: (v: string) => void;
  time: string;
  onTime: (v: string) => void;
  slots: string[];
  submitting?: boolean;
  submitLabel: string;
  /** "Tu nombre" en el link, "Nombre del cliente" en el panel. */
  nameLabel?: string;
  /** Campos solo del panel (Promotor, Origen): van después de los
   *  horarios libres y antes del botón, no se le piden al paciente. */
  extraFields?: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
}

export function BookingFields(props: BookingFieldsProps) {
  const {
    data,
    clientName,
    onClientName,
    clientPhone,
    onClientPhone,
    phoneCountry,
    onPhoneCountry,
    serviceId,
    onServiceId,
    doctorId,
    onDoctorId,
    date,
    onDate,
    time,
    onTime,
    slots,
    submitting,
    submitLabel,
    nameLabel = "Tu nombre",
    extraFields,
    onSubmit,
  } = props;
  const service = data.services.find((s) => s.id === serviceId);
  const doctor = doctorById(data, doctorId || null);

  return (
    <Card className="overflow-hidden rounded-3xl border-2 border-[#e0f2fe]">
      <CardContent className="space-y-4 px-5 py-5">
        <div>
          <p className="flex items-center gap-2 text-xl font-extrabold text-[#1e1b4b]">
            <CalendarDays className="h-6 w-6 text-[#ec4899]" />
            Reserva tu cita
          </p>
          <p className="mt-1 text-sm text-slate-500">
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
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">{nameLabel} *</label>
            <Input
              value={clientName}
              onChange={(e) => onClientName(e.target.value)}
              placeholder="Nombre completo"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Teléfono *</label>
            <div className="flex gap-2">
              <select
                value={phoneCountry}
                onChange={(e) =>
                  onPhoneCountry(e.target.value as PhoneCountry)
                }
                aria-label="País del teléfono"
                className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                {PHONE_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} {c.prefix}
                  </option>
                ))}
              </select>
              <Input
                value={clientPhone}
                onChange={(e) => onClientPhone(e.target.value)}
                placeholder={phoneCountry === "US" ? "+1 …" : "+52 …"}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Servicio *</label>
            <select
              value={serviceId}
              onChange={(e) => onServiceId(e.target.value)}
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
              onChange={(e) => onDoctorId(e.target.value)}
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
            {doctor &&
              (() => {
                const weekday = new Date(`${date}T12:00:00`).getDay();
                const day = doctor.schedule.find((d) => d.weekday === weekday);
                const works = service
                  ? doctorWorksAt(doctor, date, time, service.duration_minutes)
                  : { ok: true };
                return (
                  <p className="mt-1 text-xs text-slate-500">
                    <DoctorChip name={doctor.name} color={doctor.color} /> ·{" "}
                    {SPECIALTY_LABEL[doctor.specialty]} ·{" "}
                    {day && day.active
                      ? `ese día atiende de ${day.start} a ${day.end}`
                      : "ese día no atiende"}
                    {!works.ok && service && time && (
                      <span className="font-medium text-red-700">
                        {" "}
                        — la cita a las {time} queda fuera de su horario.
                      </span>
                    )}
                    {doctor.requires_deposit && (
                      <span className="mt-1 block rounded-lg bg-amber-50 p-2 font-medium text-amber-800">
                        Este doctor solo atiende con cita y anticipo: la cita
                        quedará en pausa hasta que la clínica confirme los
                        horarios y el paciente acepte. No se bloquea el
                        horario de inmediato.
                      </span>
                    )}
                  </p>
                );
              })()}
          </div>
          <div>
            <label className="text-sm font-medium">Fecha *</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => onDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Horarios libres *</label>
            {slots.length === 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                No quedan horarios libres ese día para este servicio. Prueba
                otra fecha.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onTime(s)}
                    className={
                      time === s
                        ? "rounded-lg bg-[#ec4899] px-3 py-2 text-sm font-semibold text-white"
                        : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {extraFields}
          <Button
            type="submit"
            className="w-full bg-[#ec4899] py-6 text-base font-bold text-white hover:bg-[#db2777]"
            disabled={submitting || !time}
          >
            {submitting ? "Registrando…" : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta TU CITA (la misma en el link y en el panel)
// ---------------------------------------------------------------------------

export function AppointmentCardView({
  card,
  title,
  context,
  onHold,
  localOnly,
  onCreateAnother,
}: {
  card: AppointmentCardData;
  title: string;
  /** "link": la ve el paciente. "panel": la ve la recepción. */
  context: "link" | "panel";
  onHold: boolean;
  localOnly: boolean;
  /** Solo panel: limpia el formulario para crear otra cita sin
   *  recargar la página. */
  onCreateAnother?: () => void;
}) {
  const [savingCard, setSavingCard] = useState(false);
  const [saveCardMsg, setSaveCardMsg] = useState("");

  const saveCard = async () => {
    if (savingCard) return;
    setSavingCard(true);
    setSaveCardMsg("");
    const res = await saveAppointmentCard(card);
    setSavingCard(false);
    if (res.ok) {
      setSaveCardMsg(
        res.method === "share"
          ? "Se abrió para compartir o guardar la imagen."
          : "Imagen descargada en tu teléfono."
      );
    } else if (!res.aborted) {
      setSaveCardMsg(res.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h1 className="mt-3 text-2xl font-bold text-[#1e1b4b]">{title}</h1>
      </div>
      {/* Tarjeta TU CITA: los datos ordenados para guardarla y
          presentarla en recepción. */}
      <Card className="overflow-hidden border-2 border-[#e0f2fe]">
        <div className="bg-[#5b21b6] px-4 py-3 text-center">
          <p className="text-xl font-extrabold tracking-wide text-white">
            TU CITA
          </p>
        </div>
        <CardContent className="divide-y divide-slate-200 px-5 py-2">
          {cardRows(card).map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[110px_1fr] gap-2 py-2.5 text-left"
            >
              <span className="font-semibold text-slate-500">
                {row.label}:
              </span>
              <span
                className={
                  row.accent
                    ? "font-bold text-amber-600"
                    : "font-semibold text-slate-900"
                }
              >
                {row.value}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      {/* Aviso de recepción + estado real de la cita. */}
      <div className="rounded-2xl bg-cyan-100 p-4">
        <p className="flex items-start gap-2 text-left font-semibold text-[#0e7490]">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          {receptionNote(card)}
        </p>
        <p className="mt-3 text-left text-sm text-slate-600">
          {onHold ? (
            <>
              Tu cita quedó <strong>en pausa</strong>: este doctor solo
              atiende con cita y anticipo. La clínica revisará los horarios
              del doctor y te propondrá cuándo puede atenderte. Cuando
              aceptes, tu cita se confirma. Todavía no se cobra nada en
              línea.
            </>
          ) : localOnly ? (
            context === "panel" ? (
              <>
                Quedó en <strong>pendiente</strong>, pero solo vive en este
                aparato: todavía no está en la nube, así que no llega a
                Google Calendar ni se manda la confirmación por WhatsApp.
                Súbela desde Ajustes &gt; Sincronizar con la nube para que
                al confirmarla sí llegue a todo.
              </>
            ) : (
              <>
                Quedó en <strong>pendiente</strong>, pero solo se guardó en
                este aparato: no se pudo sincronizar con la agenda de la
                clínica, así que todavía no llega a Google Calendar ni te
                llegará la confirmación por WhatsApp. Avísale a la clínica
                para que la registre.
              </>
            )
          ) : context === "panel" ? (
            <>
              Quedó en <strong>pendiente</strong> y ya está en la nube. Al
              confirmarla llegará a Google Calendar y al WhatsApp del
              paciente.
            </>
          ) : (
            <>
              Quedó en <strong>pendiente</strong>. La clínica te confirmará
              por WhatsApp.
            </>
          )}
        </p>
        <div className="mt-4 space-y-2">
          <Button
            type="button"
            onClick={saveCard}
            disabled={savingCard}
            className="w-full bg-[#ec4899] py-6 text-base font-bold text-white hover:bg-[#db2777]"
          >
            <Download className="mr-2 h-5 w-5" />
            {savingCard ? "Guardando…" : "Guardar mi cita"}
          </Button>
          <a
            href={buildWhatsAppShareUrl(card)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center rounded-lg border-2 border-green-600 bg-white px-4 py-3 text-base font-bold text-green-700"
          >
            <MessageCircle className="mr-2 h-5 w-5" />
            Compartir por WhatsApp
          </a>
          {saveCardMsg && (
            <p className="text-center text-sm font-medium text-green-700">
              {saveCardMsg}
            </p>
          )}
        </div>
      </div>
      {context === "link" ? (
        <>
          {!localOnly && (
            <p className="text-center text-sm text-slate-500">
              Te confirmamos tu cita por WhatsApp al{" "}
              {CLINIC_WHATSAPP_DISPLAY}.
            </p>
          )}
          <div className="text-center">
            <Link href="/dashboard">
              <Button variant="outline">Verla en la agenda (demo)</Button>
            </Link>
          </div>
          {onCreateAnother && (
            <div className="text-center">
              <Button variant="outline" onClick={onCreateAnother}>
                Reservar otra cita
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline">Ver en la agenda</Button>
          </Link>
          {localOnly && (
            <Link href="/dashboard/ajustes">
              <Button variant="outline">Ir a Ajustes para subirla</Button>
            </Link>
          )}
          {onCreateAnother ? (
            <Button variant="outline" onClick={onCreateAnother}>
              Crear otra cita
            </Button>
          ) : (
            <Link href="/dashboard/nueva">
              <Button variant="outline">Crear otra cita</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
