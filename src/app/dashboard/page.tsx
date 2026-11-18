"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contactName,
  contactPhone,
  fmtTime,
  loadStore,
  resetDemo,
  serviceName,
  promoterName,
  setStatus,
  type StoreData,
} from "@/lib/store";
import { todayISO } from "@/lib/demo-data";
import { SOURCE_LABEL, STATUS_LABEL, money, type StatusType } from "@/lib/types";
import { AlertTriangle, CalendarCheck, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<StatusType, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-200 text-slate-600",
  conflict: "bg-red-100 text-red-800",
};

export default function AgendaPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [date, setDate] = useState(todayISO());

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

  const change = (id: string, status: StatusType) =>
    setData(setStatus({ ...data }, id, status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda — {data.org.name}</h1>
          <p className="text-sm text-slate-500">
            Agenda unificada: Google Calendar + promotores (Sheets) + link
            público. Buffer anti-empalme: {data.org.buffer_minutes} min.
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
                ({serviceName(data, a.service_id)}, promotor{" "}
                {promoterName(data, a.promoter_id)}): {a.notes}
              </p>
            ))}
            <p>
              Para probar el motor: crea una cita a las 10:00 o 10:15 y verás
              el bloqueo. Las citas en conflicto no bloquean horarios ni
              generan comisión.
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
                    {a.promoter_id && (
                      <> · Promotor: {promoterName(data, a.promoter_id)}</>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Origen: {SOURCE_LABEL[a.source]}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </p>
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
                  {a.status === "confirmed" && (
                    <Button size="sm" onClick={() => change(a.id, "completed")}>
                      <CheckCircle2 className="h-4 w-4" /> Check-in
                    </Button>
                  )}
                  {(a.status === "pending" || a.status === "confirmed") && (
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
