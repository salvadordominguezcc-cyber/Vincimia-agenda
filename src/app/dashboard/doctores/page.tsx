// Doctores — cada doctor con su especialidad, su color y sus horarios.
// Lenguaje normal en toda la pantalla: nada de códigos técnicos a la vista.
// Los doctores se guardan aquí mismo (para que se vean de inmediato) y
// también en Supabase cuando hay sesión (tabla doctors, migración
// supabase/migrations/001_doctors.sql). Si la nube falla, el cambio queda
// guardado aquí y la página lo dice en lenguaje normal.

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadStore, saveStore, type StoreData } from "@/lib/store";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import {
  DOCTOR_COLORS,
  SPECIALTIES,
  SPECIALTY_LABEL,
  type Doctor,
  type DoctorScheduleDay,
  type DoctorSpecialty,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function defaultSchedule(): DoctorScheduleDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    start: weekday === 6 ? "09:00" : "09:00",
    end: weekday === 6 ? "14:00" : "18:00",
    active: weekday >= 1 && weekday <= 6,
  }));
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `doc-${Date.now()}`;
  }
}

/** Resume el horario en palabras normales: "Lun–Vie 9:00–18:00 · Sáb 9:00–14:00". */
function scheduleSummary(schedule: DoctorScheduleDay[]): string {
  const active = schedule.filter((d) => d.active);
  if (active.length === 0) return "Sin horarios";
  const groups: { days: number[]; start: string; end: string }[] = [];
  for (const d of [...active].sort((a, b) => a.weekday - b.weekday)) {
    const last = groups[groups.length - 1];
    if (last && last.start === d.start && last.end === d.end) {
      last.days.push(d.weekday);
    } else {
      groups.push({ days: [d.weekday], start: d.start, end: d.end });
    }
  }
  return groups
    .map((g) => {
      const label =
        g.days.length === 1
          ? DAY_SHORT[g.days[0]]
          : `${DAY_SHORT[g.days[0]]}–${DAY_SHORT[g.days[g.days.length - 1]]}`;
      return `${label} ${g.start}–${g.end}`;
    })
    .join(" · ");
}

export default function DoctoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState<DoctorSpecialty>("general");
  const [color, setColor] = useState(DOCTOR_COLORS[0]);
  const [schedule, setSchedule] = useState<DoctorScheduleDay[]>(defaultSchedule());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const startForm = (doc?: Doctor) => {
    setEditingId(doc ? doc.id : null);
    setName(doc ? doc.name : "");
    setSpecialty(doc ? doc.specialty : "general");
    setColor(doc ? doc.color : DOCTOR_COLORS[0]);
    setSchedule(doc ? doc.schedule : defaultSchedule());
    setError("");
    setMessage("");
  };

  const setDay = (weekday: number, patch: Partial<DoctorScheduleDay>) => {
    setSchedule((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d))
    );
  };

  const applyPreset = (kind: "semana" | "sabado" | "toda") => {
    setSchedule((prev) =>
      prev.map((d) => {
        if (kind === "semana")
          return { ...d, start: "09:00", end: "18:00", active: d.weekday >= 1 && d.weekday <= 5 };
        if (kind === "sabado")
          return {
            ...d,
            start: "09:00",
            end: d.weekday === 6 ? "14:00" : "18:00",
            active: d.weekday >= 1 && d.weekday <= 6,
          };
        return { ...d, start: "09:00", end: "18:00", active: true };
      })
    );
  };

  const saveToCloud = async (doctor: Doctor, isNew: boolean) => {
    if (!supabaseConfigured()) return true;
    try {
      const client = supabaseBrowser();
      if (!client) return true;
      const row = {
        id: doctor.id,
        organization_id: doctor.organization_id,
        name: doctor.name,
        specialty: doctor.specialty,
        color: doctor.color,
        schedule: doctor.schedule,
        active: doctor.active,
      };
      const { error } = isNew
        ? await client.from("doctors").insert(row)
        : await client.from("doctors").update(row).eq("id", doctor.id);
      if (error) return false;
      return true;
    } catch {
      return false;
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Escribe el nombre del doctor.");
      return;
    }
    if (!schedule.some((d) => d.active)) {
      setError("Marca al menos un día en el que atienda.");
      return;
    }
    for (const d of schedule.filter((x) => x.active)) {
      if (d.end <= d.start) {
        setError(`El ${DAY_NAMES[d.weekday]} la hora de salida debe ser después de la entrada.`);
        return;
      }
    }
    const isNew = !editingId;
    const doctor: Doctor = {
      id: editingId ?? newId(),
      organization_id: data.org.id,
      name: cleanName,
      specialty,
      color,
      schedule,
      active: true,
      created_at: new Date().toISOString(),
    };
    const next: StoreData = {
      ...data,
      doctors: isNew
        ? [...data.doctors, doctor]
        : data.doctors.map((d) => (d.id === doctor.id ? { ...doctor, active: d.active, created_at: d.created_at } : d)),
    };
    saveStore(next);
    setData(next);
    setSaving(true);
    const ok = await saveToCloud(doctor, isNew);
    setSaving(false);
    setEditingId(null);
    setName("");
    setSpecialty("general");
    setColor(DOCTOR_COLORS[0]);
    setSchedule(defaultSchedule());
    setMessage(
      ok
        ? "Listo, el doctor quedó guardado."
        : "Se guardó aquí, pero no se pudo guardar en la nube. Revisa tu conexión e inténtalo de nuevo."
    );
  };

  const setActive = async (doc: Doctor, active: boolean) => {
    const updated = { ...doc, active };
    const next: StoreData = {
      ...data,
      doctors: data.doctors.map((d) => (d.id === doc.id ? updated : d)),
    };
    saveStore(next);
    setData(next);
    const ok = await saveToCloud(updated, false);
    setMessage(
      ok
        ? active
          ? `${doc.name} ya está activo de nuevo.`
          : `${doc.name} quedó pausado y ya no se le agendan citas.`
        : "Se guardó aquí, pero no se pudo guardar en la nube."
    );
  };

  /**
   * Quitar un doctor: NO se borra de verdad. Solo queda pausado: sus
   * citas pasadas se conservan (siguen viéndose con su color en el
   * calendario) y ya no se le pueden agendar citas nuevas, porque en
   * Nueva cita y en la reserva solo salen los doctores activos.
   * Se puede volver a activar cuando se quiera.
   */
  const removeDoctor = async (doc: Doctor) => {
    setConfirmRemoveId(null);
    await setActive(doc, false);
    if (editingId === doc.id) {
      setEditingId(null);
      setName("");
      setSpecialty("general");
      setColor(DOCTOR_COLORS[0]);
      setSchedule(defaultSchedule());
    }
    setMessage(
      `${doc.name} quedó quitado. Sus citas pasadas se conservan y ya no se le agendan citas nuevas. Se puede volver a activar cuando quieras.`
    );
  };

  const activeDoctors = data.doctors.filter((d) => d.active);
  const pausedDoctors = data.doctors.filter((d) => !d.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Doctores</h1>
        <p className="text-sm text-slate-500">
          Cada doctor tiene su especialidad, su color en el calendario y sus
          horarios. El color se puede cambiar cuando quieras, editando al
          doctor. Las citas solo se agendan dentro de su horario, y dos
          doctores pueden atender a la misma hora porque son agendas
          paralelas. Si quitas a un doctor, sus citas pasadas se conservan
          y solo ya no se le agendan citas nuevas.
        </p>
      </div>

      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      {/* Lista de doctores */}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.doctors.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              Todavía no hay doctores. Agrega el primero con el formulario de abajo.
            </CardContent>
          </Card>
        )}
        {[...activeDoctors, ...pausedDoctors].map((doc) => (
          <Card key={doc.id} className={cn(!doc.active && "opacity-70")}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-4 w-4 shrink-0 rounded-full border border-slate-300"
                  style={{ backgroundColor: doc.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{doc.name}</p>
                  <p className="text-sm text-slate-600">
                    {SPECIALTY_LABEL[doc.specialty]}
                    {!doc.active && " · Pausado"}
                  </p>
                  <p className="text-sm text-slate-500">{scheduleSummary(doc.schedule)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => startForm(doc)}>
                  Editar
                </Button>
                {doc.active ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setActive(doc, false)}>
                      Pausar
                    </Button>
                    {confirmRemoveId === doc.id ? (
                      <span className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                        ¿Seguro? Sus citas pasadas se conservan, solo ya no
                        se le agendan nuevas.
                        <Button size="sm" variant="danger" onClick={() => removeDoctor(doc)}>
                          Sí, quitarlo
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmRemoveId(null)}>
                          Cancelar
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setConfirmRemoveId(doc.id)}>
                        Quitar
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setActive(doc, true)}>
                    Volver a activar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formulario crear / editar */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar doctor" : "Agregar doctor"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ejemplo: Dra. Ana López"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Especialidad *</label>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value as DoctorSpecialty)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {SPECIALTY_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Color en el calendario *</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {DOCTOR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2",
                      color === c ? "border-slate-900 ring-2 ring-slate-400" : "border-slate-300"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer"
                  aria-label="Elegir otro color"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Así se ven sus citas en el calendario.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Horarios</label>
              <p className="text-xs text-slate-500">
                Marca los días que atiende y de qué hora a qué hora. Fuera de
                ese horario no se le pueden agendar citas.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("semana")}>
                  Lunes a viernes 9:00–18:00
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("sabado")}>
                  Lunes a sábado
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("toda")}>
                  Toda la semana
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {schedule.map((d) => (
                  <div key={d.weekday} className="flex flex-wrap items-center gap-2">
                    <label className="flex w-28 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.active}
                        onChange={(e) => setDay(d.weekday, { active: e.target.checked })}
                      />
                      {DAY_NAMES[d.weekday]}
                    </label>
                    <Input
                      type="time"
                      value={d.start}
                      disabled={!d.active}
                      onChange={(e) => setDay(d.weekday, { start: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-sm text-slate-500">a</span>
                    <Input
                      type="time"
                      value={d.end}
                      disabled={!d.active}
                      onChange={(e) => setDay(d.weekday, { end: e.target.value })}
                      className="w-32"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar doctor"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setSpecialty("general");
                    setColor(DOCTOR_COLORS[0]);
                    setSchedule(defaultSchedule());
                    setError("");
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
