"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DoctorChip } from "@/components/DoctorChip";
import { GroupNoticeToggle } from "@/components/GroupNotice";
import { confirmationMessage, reviewRequestMessage } from "@/lib/messages";
import { isCloudId } from "@/lib/cloud-sync";
import { notifyAppointmentStatus, notifyGroupNoticed } from "@/lib/notify-channels";
import { supabaseConfigured } from "@/lib/supabase";
import {
  confirmAppointment,
  contactName,
  contactPhone,
  doctorById,
  doctorName,
  fmtTime,
  isGroupNotified,
  loadStore,
  proposeTimes,
  resetDemo,
  serviceName,
  setGroupNotified,
  setStatus,
  type StoreData,
} from "@/lib/store";
import { todayISO } from "@/lib/demo-data";
import { SOURCE_LABEL, SPECIALTY_LABEL, STATUS_LABEL, money, type StatusType } from "@/lib/types";
import { AlertTriangle, CalendarCheck, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<StatusType, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-200 text-slate-600",
  conflict: "bg-red-100 text-red-800",
  on_hold: "bg-violet-100 text-violet-800",
};

export default function AgendaPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [date, setDate] = useState(todayISO());
  const [proposal, setProposal] = useState<Record<string, string>>({});
  const [holdError, setHoldError] = useState("");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastMessageKind, setLastMessageKind] = useState<"confirmacion" | "resena">(
    "confirmacion"
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando agenda…</p>;

  const day = data.appointments
    .filter((a) => a.start_time.startsWith(date))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const conflicts = day.filter((a) => a.status === "conflict");
  const completedToday = day.filter((a) => a.status === "completed");
  const incomeCompleted = completedToday.reduce((s, a) => s + a.price, 0);

  const change = (id: string, status: StatusType) => {
    const next = setStatus({ ...data }, id, status);
    setData(next);
    // Si la cita existe en la nube, avisar a Google Calendar y a
    // WhatsApp (la ruta dice por canal qué hizo; si no existe en la
    // nube, no pasa nada y el mensaje para copiar sigue ahí).
    if (supabaseConfigured()) {
      notifyAppointmentStatus(data.org.id, data.org.excel_webhook_secret, id, status);
    }
    // Al confirmar se arma el mensaje para el paciente (con el aviso de
    // llegar 15 minutos antes solo si es primera vez).
    if (status === "confirmed") {
      const appt = next.appointments.find((a) => a.id === id);
      if (appt) {
        setLastMessage(confirmationMessage(next, appt));
        setLastMessageKind("confirmacion");
        setCopied(false);
      }
    }
    // Al completar (check-in) se arma el mensaje de solicitud de reseña
    // con su link de calificación, para copiarlo a mano en modo demo.
    // En la nube, la ruta /api/appointments/status lo manda por WhatsApp
    // (o lo deja en cola si WhatsApp no está conectado).
    if (status === "completed") {
      const appt = next.appointments.find((a) => a.id === id);
      if (appt) {
        const url = `${window.location.origin}/resena/${next.org.slug}?cita=${appt.id}`;
        setLastMessage(reviewRequestMessage(next, appt, url));
        setLastMessageKind("resena");
        setCopied(false);
      }
    }
  };

  const saveProposal = (id: string) => {
    const text = proposal[id] ?? "";
    if (!text.trim()) return;
    setData(proposeTimes({ ...data }, id, text));
    setHoldError("");
  };

  // Marca si la tarjeta de la cita ya se reenvió al grupo de WhatsApp
  // de promotores (o la vuelve a pendiente si se marcó por error).
  // Si la cita vive en la nube, se guarda allá también; si la columna
  // aún no está aplicada en Supabase, el valor se queda solo en este
  // aparato. No toca la confirmación, Google ni la hoja.
  const toggleGroupNotice = (id: string) => {
    const appt = data.appointments.find((a) => a.id === id);
    if (!appt) return;
    const nextValue = !isGroupNotified(appt);
    setData(setGroupNotified({ ...data }, id, nextValue));
    if (supabaseConfigured() && isCloudId(id)) {
      notifyGroupNoticed(data.org.id, data.org.excel_webhook_secret, id, nextValue);
    }
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

  const copyMessage = async () => {
    if (!lastMessage) return;
    try {
      await navigator.clipboard.writeText(lastMessage);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda — {data.org.name}</h1>
          <p className="text-sm text-slate-500">
            Agenda unificada: Google Calendar + hoja de Excel de
            promotores (Sheets) + link público. Buffer anti-empalme:{" "}
            {data.org.buffer_minutes} min.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Link href="/dashboard/nueva">
            <Button>+ Nueva cita</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={resetDemo}>
            Restablecer demo
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              {conflicts.length} cita(s) en conflicto — no se guardaron como
              válidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-red-800">
            {conflicts.map((a) => (
              <p key={a.id}>
                <strong>
                  {contactName(data, a.contact_id)} · {fmtTime(a.start_time)}–
                  {fmtTime(a.end_time)}
                </strong>{" "}
                ({serviceName(data, a.service_id)}): {a.notes}
              </p>
            ))}
            <p>
              Para probar el motor: crea una cita a las 10:00 o 10:15 y verás
              el bloqueo. Las citas en conflicto no bloquean horarios.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Citas del día</p>
            <p className="text-2xl font-bold">{day.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Completadas (check-in)</p>
            <p className="text-2xl font-bold">{completedToday.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Ingresos por completadas</p>
            <p className="text-2xl font-bold">{money(incomeCompleted)}</p>
          </CardContent>
        </Card>
      </div>

      {lastMessage && (
        <Card className="border-2 border-green-300 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900">
              Mensaje para el paciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-green-900">{lastMessage}</p>
            <p className="text-xs text-green-800">
              {lastMessageKind === "resena"
                ? "Este es el texto de solicitud de reseña con su link de calificación. En modo demo se copia a mano; en la nube lo manda el bot por WhatsApp (o queda en cola si no está conectado)."
                : "Este es el texto que se le manda por WhatsApp. Si es primera vez, ya trae la recomendación de llegar 15 minutos antes para llenar su historial clínico."}
            </p>
            <Button size="sm" variant="outline" onClick={copyMessage}>
              {copied ? "Copiado ✓" : "Copiar mensaje"}
            </Button>
          </CardContent>
        </Card>
      )}

      {day.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            No hay citas este día.{" "}
            <Link href="/dashboard/nueva" className="font-medium text-brand-700 underline">
              Crea la primera
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {day.map((a) => (
            <Card key={a.id} className={cn(a.status === "conflict" && "border-red-300")}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <div className="flex h-12 w-16 flex-col items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-700">
                  {fmtTime(a.start_time)}
                  <span className="text-xs font-normal text-slate-500">
                    {fmtTime(a.end_time)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {contactName(data, a.contact_id)}{" "}
                    <span className="font-normal text-slate-500">
                      · {contactPhone(data, a.contact_id)}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {serviceName(data, a.service_id)} · {a.duration_minutes}{" "}
                    min · {money(a.price)}
                    {a.doctor_id && (
                      <>
                        {" "}· Doctor:{" "}
                        <DoctorChip
                          name={doctorName(data, a.doctor_id)}
                          color={doctorById(data, a.doctor_id)?.color ?? "#94a3b8"}
                        />{" "}
                        (
                        {SPECIALTY_LABEL[doctorById(data, a.doctor_id)?.specialty ?? "general"]})
                      </>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Origen: {SOURCE_LABEL[a.source]}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </p>
                  <p className="mt-1">
                    <GroupNoticeToggle
                      notified={isGroupNotified(a)}
                      onToggle={() => toggleGroupNotice(a.id)}
                    />
                  </p>
                  {a.status === "on_hold" && (
                    <div className="mt-2 rounded-lg bg-violet-50 p-3 text-sm">
                      <p className="font-medium text-violet-900">
                        En pausa — esperando a la clínica
                      </p>
                      <p className="text-violet-800">
                        Este doctor solo atiende con cita y anticipo. La cita
                        todavía no está confirmada ni bloquea el horario.
                        Propón horarios y, cuando el paciente acepte, confirma
                        la cita.
                      </p>
                      {a.proposed_times && (
                        <p className="mt-1 text-violet-900">
                          <strong>Horarios propuestos:</strong> {a.proposed_times}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Input
                          value={proposal[a.id] ?? a.proposed_times ?? ""}
                          onChange={(e) =>
                            setProposal((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          placeholder="Ejemplo: Miércoles 10:00 o jueves 11:30"
                          className="min-w-56 flex-1 bg-white"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveProposal(a.id)}>
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
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    STATUS_STYLE[a.status]
                  )}
                >
                  {STATUS_LABEL[a.status]}
                </span>
                <div className="flex gap-2">
                  {a.status === "pending" && (
                    <Button size="sm" onClick={() => change(a.id, "confirmed")}>
                      Confirmar
                    </Button>
                  )}
                  {a.status === "on_hold" && (
                    <Button size="sm" onClick={() => confirmHold(a.id)}>
                      Confirmar cita
                    </Button>
                  )}
                  {a.status === "confirmed" && (
                    <Button size="sm" onClick={() => change(a.id, "completed")}>
                      <CheckCircle2 className="h-4 w-4" /> Check-in
                    </Button>
                  )}
                  {(a.status === "pending" || a.status === "confirmed" || a.status === "on_hold") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => change(a.id, "cancelled")}
                    >
                      <XCircle className="h-4 w-4" /> Cancelar
                    </Button>
                  )}
                  {a.status === "conflict" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-700">
                      <CalendarCheck className="h-4 w-4" /> Reagendar a un
                      horario libre
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
