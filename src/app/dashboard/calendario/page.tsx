// Calendario tipo Google Calendar — vista por semana y por día.
// El color de cada bloque es el del doctor que atiende la cita (cada
// doctor tiene su color en Doctores); de dónde llegó la cita se ve en
// el detalle y en la leyenda de origen. También se marca si es la
// primera vez que viene el cliente
// o si ya había venido, calculado del historial del mismo contacto
// (ver isFirstVisit en src/lib/store.ts). No se cambia la lógica de
// anti-empalme: los huecos ocupados ya se ven como bloques, y el tiempo
// libre entre citas es el que se puso en Ajustes.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  confirmAppointment,
  contactName,
  contactPhone,
  doctorById,
  doctorName,
  fmtTime,
  isFirstVisit,
  loadStore,
  promoterName,
  proposeTimes,
  serviceName,
  setStatus,
  type StoreData,
} from "@/lib/store";
import { DoctorChip } from "@/components/DoctorChip";
import { confirmationMessage } from "@/lib/messages";
import { notifyAppointmentStatus } from "@/lib/notify-channels";
import { supabaseConfigured } from "@/lib/supabase";
import { SOURCE_LABEL, SPECIALTY_LABEL, STATUS_LABEL, money, type Appointment, type SourceType, type StatusType } from "@/lib/types";
import { CalendarCheck, CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Horario que se muestra en el calendario (8:00 a 20:00).
const FIRST_HOUR = 8;
const LAST_HOUR = 20;
const HOUR_PX = 64;

// Color por origen — palabras normales en la leyenda, nada de códigos.
const SOURCE_COLOR: Record<
  SourceType,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  google_calendar: {
    label: "Google Calendar",
    bg: "bg-blue-100",
    border: "border-blue-600",
    text: "text-blue-900",
    dot: "bg-blue-600",
  },
  excel_promoter: {
    label: "Promotor",
    bg: "bg-green-100",
    border: "border-green-600",
    text: "text-green-900",
    dot: "bg-green-600",
  },
  vincimia_link: {
    label: "Link público",
    bg: "bg-violet-100",
    border: "border-violet-600",
    text: "text-violet-900",
    dot: "bg-violet-600",
  },
  whatsapp_bot: {
    label: "WhatsApp",
    bg: "bg-teal-100",
    border: "border-teal-600",
    text: "text-teal-900",
    dot: "bg-teal-600",
  },
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// Lunes de la semana de la fecha dada (la semana empieza en lunes).
function mondayOf(d: Date): Date {
  const c = new Date(d);
  const dow = (c.getDay() + 6) % 7; // lunes = 0
  return addDays(c, -dow);
}

function minutesOf(iso: string): number {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

const dayName = new Intl.DateTimeFormat("es-MX", { weekday: "short" });
const dayNum = new Intl.DateTimeFormat("es-MX", { day: "numeric" });
const monthName = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });

function isToday(iso: string): boolean {
  return iso === toISODate(new Date());
}

// Reparte las citas que se traslapan en columnas lado a lado, como en
// Google Calendar, para que ninguna tape a otra.
function layoutDay(list: Appointment[]): { appt: Appointment; col: number; cols: number }[] {
  const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const colEnd: number[] = [];
  const placed = sorted.map((appt) => {
    const start = minutesOf(appt.start_time);
    const end = minutesOf(appt.end_time);
    let col = colEnd.findIndex((e) => e <= start);
    if (col === -1) {
      col = colEnd.length;
      colEnd.push(end);
    } else {
      colEnd[col] = end;
    }
    return { appt, col, cols: 0, _end: end };
  });
  // El número de columnas de cada grupo es el máximo de columnas
  // abiertas a la vez dentro de ese grupo.
  const total = colEnd.length;
  return placed.map((p) => ({ appt: p.appt, col: p.col, cols: Math.max(total, 1) }));
}

export default function CalendarioPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [view, setView] = useState<"semana" | "dia">("semana");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState("");
  const [holdError, setHoldError] = useState("");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setData(loadStore());
  }, []);

  const days: Date[] = useMemo(() => {
    if (view === "dia") return [anchor];
    const mon = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [view, anchor]);

  const dayISOs = useMemo(() => days.map(toISODate), [days]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.appointments.filter((a) => dayISOs.includes(a.start_time.slice(0, 10)));
  }, [data, dayISOs]);

  if (!data) return <p className="text-slate-500">Cargando calendario…</p>;

  const selected = selectedId
    ? data.appointments.find((a) => a.id === selectedId) ?? null
    : null;

  const title =
    view === "dia"
      ? `${dayName.format(days[0])} ${dayNum.format(days[0])} de ${monthName.format(days[0])}`
      : `Semana del ${dayNum.format(days[0])} al ${dayNum.format(days[6])} de ${monthName.format(days[0])}`;

  const change = (id: string, status: StatusType) => {
    const next = setStatus({ ...data }, id, status);
    setData(next);
    if (status === "cancelled") setSelectedId(null);
    if (supabaseConfigured()) {
      notifyAppointmentStatus(data.org.id, data.org.excel_webhook_secret, id, status);
    }
    // Al confirmar se arma el mensaje para el paciente (con el aviso de
    // llegar 15 minutos antes solo si es primera vez).
    if (status === "confirmed") {
      const appt = next.appointments.find((a) => a.id === id);
      if (appt) {
        setLastMessage(confirmationMessage(next, appt));
        setCopied(false);
      }
    }
  };

  const copyMessage = async () => {
    if (!lastMessage) return;
    try {
      await navigator.clipboard.writeText(lastMessage);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const saveProposal = (id: string) => {
    if (!proposal.trim()) return;
    setData(proposeTimes({ ...data }, id, proposal));
    setHoldError("");
  };

  const confirmHold = (id: string) => {
    const result = confirmAppointment({ ...data }, id);
    setData(result.data);
    if (!result.ok) {
      setHoldError(result.error ?? "No se pudo confirmar la cita.");
      return;
    }
    setHoldError("");
    const appt = result.data.appointments.find((a) => a.id === id);
    if (appt) {
      setLastMessage(confirmationMessage(result.data, appt));
      setCopied(false);
      if (supabaseConfigured()) {
        notifyAppointmentStatus(data.org.id, data.org.excel_webhook_secret, id, "confirmed");
      }
    }
  };

  const counts = (Object.keys(SOURCE_COLOR) as SourceType[]).map((s) => ({
    source: s,
    count: visible.filter((a) => a.source === s).length,
  }));

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendario — {data.org.name}</h1>
          <p className="text-sm text-slate-500">
            Como Google Calendar: cada cita tiene el color de su doctor.
            De dónde llegó se ve en el detalle. Los huecos entre citas ya
            incluyen el tiempo libre de Ajustes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setView("semana")}
              className={cn(
                "px-3 py-2 text-sm font-medium",
                view === "semana" ? "bg-brand-600 text-white" : "bg-white text-slate-700"
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setView("dia")}
              className={cn(
                "px-3 py-2 text-sm font-medium",
                view === "dia" ? "bg-brand-600 text-white" : "bg-white text-slate-700"
              )}
            >
              Día
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(new Date())}
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(addDays(anchor, view === "dia" ? -1 : -7))}
          >
            ‹
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(addDays(anchor, view === "dia" ? 1 : 7))}
          >
            ›
          </Button>
          <Link href="/dashboard/nueva">
            <Button>+ Nueva cita</Button>
          </Link>
        </div>
      </div>

      <p className="text-lg font-semibold capitalize">{title}</p>

      {/* Leyenda: color por doctor y, abajo, de dónde llegó cada cita. */}
      <Card>
        <CardContent className="space-y-2 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-sm font-medium text-slate-600">Color por doctor:</span>
            {data.doctors.filter((d) => d.active).map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 text-sm">
                <DoctorChip name={d.name} color={d.color} /> · {SPECIALTY_LABEL[d.specialty]}
                <span className="text-slate-500">
                  ({visible.filter((a) => a.doctor_id === d.id).length})
                </span>
              </span>
            ))}
            {visible.filter((a) => !a.doctor_id).length > 0 && (
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-3 w-3 rounded-full bg-slate-400" />
                Sin asignar
                <span className="text-slate-500">
                  ({visible.filter((a) => !a.doctor_id).length})
                </span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-sm font-medium text-slate-600">Llegó por:</span>
            {counts.map(({ source, count }) => (
              <span key={source} className="flex items-center gap-1.5 text-sm">
                <span className={cn("h-3 w-3 rounded-full", SOURCE_COLOR[source].dot)} />
                {SOURCE_COLOR[source].label}
                <span className="text-slate-500">({count})</span>
              </span>
            ))}
          <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
              Primera vez
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
              Ya había venido
            </span>
          </span>
          </div>
        </CardContent>
      </Card>

      {/* Mensaje de confirmación para el paciente. */}
      {lastMessage && (
        <Card className="border-2 border-green-300 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900">Mensaje para el paciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-green-900">{lastMessage}</p>
            <p className="text-xs text-green-800">
              Este es el texto que se le manda por WhatsApp. Si es primera
              vez, ya trae la recomendación de llegar 15 minutos antes para
              llenar su historial clínico.
            </p>
            <Button size="sm" variant="outline" onClick={copyMessage}>
              {copied ? "Copiado ✓" : "Copiar mensaje"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detalle de la cita seleccionada. */}
      {selected && (
        <Card className="border-2 border-slate-300">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <CardTitle>
              {contactName(data, selected.contact_id)}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {STATUS_LABEL[selected.status]}
              </span>
            </CardTitle>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar detalle"
            >
              <X className="h-5 w-5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <strong>Cuándo:</strong> {selected.start_time.slice(0, 10)} ·{" "}
              {fmtTime(selected.start_time)}–{fmtTime(selected.end_time)} (
              {selected.duration_minutes} min)
            </p>
            <p>
              <strong>Servicio:</strong> {serviceName(data, selected.service_id)} ·{" "}
              {money(selected.price)}
            </p>
            <p>
              <strong>Doctor:</strong>{" "}
              {(() => {
                const doc = doctorById(data, selected.doctor_id);
                if (!doc) return "Sin asignar";
                return (
                  <span>
                    <DoctorChip name={doc.name} color={doc.color} /> ·{" "}
                    {SPECIALTY_LABEL[doc.specialty]}
                  </span>
                );
              })()}
            </p>
            <p>
              <strong>Teléfono:</strong> {contactPhone(data, selected.contact_id) || "—"}
              {selected.promoter_id && (
                <> · <strong>Promotor:</strong> {promoterName(data, selected.promoter_id)}</>
              )}
            </p>
            <p>
              <strong>Llegó por:</strong>{" "}
              <span className={cn("inline-flex items-center gap-1.5", SOURCE_COLOR[selected.source].text)}>
                <span className={cn("h-2.5 w-2.5 rounded-full", SOURCE_COLOR[selected.source].dot)} />
                {SOURCE_LABEL[selected.source]}
              </span>
            </p>
            <p>
              <strong>Cliente:</strong>{" "}
              {isFirstVisit(data, selected) ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Primera vez
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                  Ya había venido
                </span>
              )}
            </p>
            {selected.notes && (
              <p className="text-slate-600">
                <strong>Notas:</strong> {selected.notes}
              </p>
            )}
            {selected.status === "on_hold" && (
              <div className="rounded-lg bg-violet-50 p-3">
                <p className="font-medium text-violet-900">
                  En pausa — esperando a la clínica
                </p>
                <p className="text-violet-800">
                  Este doctor solo atiende con cita y anticipo. La cita
                  todavía no está confirmada ni bloquea el horario.
                </p>
                {selected.proposed_times && (
                  <p className="mt-1 text-violet-900">
                    <strong>Horarios propuestos:</strong> {selected.proposed_times}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={proposal || selected.proposed_times || ""}
                    onChange={(e) => setProposal(e.target.value)}
                    placeholder="Ejemplo: Miércoles 10:00 o jueves 11:30"
                    className="min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={() => saveProposal(selected.id)}>
                    Guardar propuesta
                  </Button>
                </div>
                {holdError && (
                  <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-800">
                    {holdError}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {selected.status === "on_hold" && (
                <Button size="sm" onClick={() => confirmHold(selected.id)}>
                  Confirmar cita
                </Button>
              )}
              {selected.status === "pending" && (
                <Button size="sm" onClick={() => change(selected.id, "confirmed")}>
                  Confirmar
                </Button>
              )}
              {selected.status === "confirmed" && (
                <Button size="sm" onClick={() => change(selected.id, "completed")}>
                  <CheckCircle2 className="h-4 w-4" /> Check-in
                </Button>
              )}
              {(selected.status === "pending" || selected.status === "confirmed" || selected.status === "on_hold") && (
                <Button size="sm" variant="outline" onClick={() => change(selected.id, "cancelled")}>
                  <XCircle className="h-4 w-4" /> Cancelar
                </Button>
              )}
              {selected.status === "conflict" && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-700">
                  <CalendarCheck className="h-4 w-4" /> Esta cita está en conflicto:
                  reagéndala a un horario libre.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejilla del calendario. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className={cn("min-w-[720px]", view === "dia" && "min-w-[420px]")}>
          {/* Encabezados de día */}
          <div className="flex border-b border-slate-200">
            <div className="w-14 shrink-0" />
            {days.map((d) => {
              const iso = toISODate(d);
              const today = isToday(iso);
              return (
                <div
                  key={iso}
                  className={cn(
                    "flex-1 border-l border-slate-100 px-2 py-2 text-center",
                    today && "bg-brand-50"
                  )}
                >
                  <p className="text-xs font-medium uppercase text-slate-500">
                    {dayName.format(d)}
                  </p>
                  <p
                    className={cn(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                      today ? "bg-brand-600 text-white" : "text-slate-900"
                    )}
                  >
                    {dayNum.format(d)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Horas + bloques */}
          <div className="flex">
            <div className="w-14 shrink-0">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b border-slate-100 pr-1 text-right text-xs text-slate-500"
                  style={{ height: HOUR_PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const iso = toISODate(d);
              const list = visible.filter((a) => a.start_time.startsWith(iso));
              const placed = layoutDay(list);
              return (
                <div
                  key={iso}
                  className={cn(
                    "relative flex-1 border-l border-slate-100",
                    isToday(iso) && "bg-brand-50/40"
                  )}
                  style={{ height: hours.length * HOUR_PX }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="border-b border-slate-100"
                      style={{ height: HOUR_PX }}
                    />
                  ))}
                  {/* Tiempo de descanso de la clínica: banda sombreada. */}
                  {data.org.break_start && data.org.break_end && (() => {
                    const bs = minutesOf(`2000-01-01T${data.org.break_start}:00`);
                    const be = minutesOf(`2000-01-01T${data.org.break_end}:00`);
                    if (be <= FIRST_HOUR * 60 || bs >= LAST_HOUR * 60) return null;
                    const top = Math.max(0, ((bs - FIRST_HOUR * 60) / 60) * HOUR_PX);
                    const height = Math.max(22, ((be - bs) / 60) * HOUR_PX - 2);
                    return (
                      <div
                        className="absolute left-0 right-0 border-y border-slate-300 bg-slate-200/80 px-2 py-1"
                        style={{ top, height }}
                      >
                        <p className="text-[11px] font-medium text-slate-600">
                          Tiempo de descanso {data.org.break_start}–{data.org.break_end}
                        </p>
                      </div>
                    );
                  })()}
                  {placed.map(({ appt, col, cols }) => {
                    const c = SOURCE_COLOR[appt.source];
                    const doc = doctorById(data, appt.doctor_id);
                    const blockStyle = doc
                      ? {
                          backgroundColor: `${doc.color}26`,
                          borderLeftColor: doc.color,
                          color: "#1e293b",
                        }
                      : undefined;
                    const startMin = minutesOf(appt.start_time);
                    const endMin = minutesOf(appt.end_time);
                    const top = Math.max(0, ((startMin - FIRST_HOUR * 60) / 60) * HOUR_PX);
                    const height = Math.max(
                      26,
                      ((endMin - startMin) / 60) * HOUR_PX - 2
                    );
                    const first = isFirstVisit(data, appt);
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(appt.id);
                          setProposal(appt.proposed_times ?? "");
                          setHoldError("");
                        }}
                        className={cn(
                          "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left",
                          !doc && c.bg,
                          !doc && c.border,
                          !doc && c.text,
                          appt.status === "cancelled" && "opacity-50 line-through",
                          appt.status === "conflict" && "border-dashed border-red-500",
                          selectedId === appt.id && "ring-2 ring-slate-900"
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          ...blockStyle,
                        }}
                      >
                        <p className="truncate text-xs font-bold leading-tight">
                          {fmtTime(appt.start_time)} {contactName(data, appt.contact_id)}
                        </p>
                        {height >= 44 && (
                          <>
                            <p className="truncate text-[11px] leading-tight">
                              {serviceName(data, appt.service_id)}
                            </p>
                            <p className="truncate text-[11px] leading-tight">
                              {doc ? (
                                <DoctorChip
                                  name={doctorName(data, appt.doctor_id)}
                                  color={doc.color}
                                />
                              ) : (
                                <span className="opacity-80">{c.label}</span>
                              )}
                            </p>
                            <span
                              className={cn(
                                "mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium",
                                first
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-600 text-white"
                              )}
                            >
                              {first ? "Primera vez" : "Ya había venido"}
                            </span>
                          </>
                        )}
                        {height < 44 && (
                          <span
                            className={cn(
                              "mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium",
                              first ? "bg-emerald-600 text-white" : "bg-slate-600 text-white"
                            )}
                          >
                            {first ? "1ª vez" : "Ya vino"}
                          </span>
                        )}
                        {appt.status === "conflict" && (
                          <p className="text-[11px] font-bold text-red-700">Conflicto</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {visible.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No hay citas en {view === "dia" ? "este día" : "esta semana"}.{" "}
            <Link href="/dashboard/nueva" className="font-medium text-brand-700 underline">
              Crea la primera
            </Link>
            .
          </CardContent>
        </Card>
      )}
    </div>
  );
}
