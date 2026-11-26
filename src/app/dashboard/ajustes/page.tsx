// Ajustes — Datos de tu negocio y borrar los datos de ejemplo.
// Lenguaje normal en toda la pantalla: nada de "slug", "buffer" ni
// jerga técnica a la vista. Los valores técnicos (slug, buffer_minutes,
// connected_google_email) solo viven dentro del código y en Supabase.
//
// Qué hace al guardar: actualiza el negocio aquí mismo (localStorage)
// para que el cambio se vea de inmediato, y también en la nube por la
// ruta /api/catalog/org (con el secreto del negocio, como las citas).
// Al entrar, los datos de la nube mandan: nombre, enlace, tiempo entre
// citas, descanso y correo de Google vienen de Supabase.
// Al borrar los datos de ejemplo NO se borra el negocio ni la cuenta.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  clearDemoData,
  contactName,
  doctorName,
  fmtDate,
  fmtTime,
  loadStore,
  saveStore,
  serviceName,
  type StoreData,
} from "@/lib/store";
import {
  applyCatalogIds,
  applyCloudIds,
  fetchCatalog,
  fetchCloudAppointments,
  isCloudId,
  localOnlyAppointments,
  mergeCatalogIntoStore,
  mergeCloudIntoStore,
  saveOrgToCloud,
  uploadCatalogToCloud,
  uploadSelectedAppointments,
} from "@/lib/cloud-sync";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { slugify, STATUS_LABEL } from "@/lib/types";

const LINK_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function AjustesPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [gap, setGap] = useState("15");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState("");
  // Sincronización con la nube: subir las citas que solo viven en
  // este aparato y bajar las que ya están en Supabase.
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  // Citas marcadas para subir: por defecto todas menos las
  // canceladas (esas no vale la pena subirlas). Las canceladas se
  // pueden marcar a mano si de verdad se quieren subir.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Subir servicios y doctores que solo viven en este aparato.
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogSyncMessage, setCatalogSyncMessage] = useState("");
  const [catalogSyncError, setCatalogSyncError] = useState("");

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setName(d.org.name);
    setLink(d.org.slug);
    setGap(String(d.org.buffer_minutes));
    setBreakStart(d.org.break_start ?? "");
    setBreakEnd(d.org.break_end ?? "");
    setGoogleEmail(d.org.connected_google_email ?? "");
    // Al entrar, los datos del negocio y el catálogo de la nube
    // mandan: si en la nube cambió el nombre, el enlace, el descanso
    // o hay servicios/doctores nuevos, se ven aquí sin duplicar.
    if (supabaseConfigured()) {
      fetchCatalog(d.org.id, d.org.excel_webhook_secret)
        .then((catalog) => {
          const merged = mergeCatalogIntoStore(loadStore(), catalog);
          setData(merged);
          setName(merged.org.name);
          setLink(merged.org.slug);
          setGap(String(merged.org.buffer_minutes));
          setBreakStart(merged.org.break_start ?? "");
          setBreakEnd(merged.org.break_end ?? "");
          setGoogleEmail(merged.org.connected_google_email ?? "");
        })
        .catch(() => {
          // Sin conexión a la nube se sigue con lo del aparato.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Las citas marcadas siguen a la lista de locales: las nuevas que
  // llegan se marcan solas (menos las canceladas) y las que ya
  // subieron dejan de aparecer. Así el usuario nunca sube una
  // cancelada sin querer.
  const localApptIds = data ? localOnlyAppointments(data).map((a) => a.id).join(",") : "";
  useEffect(() => {
    if (!data) return;
    setSelectedIds((prev) => {
      const current = localOnlyAppointments(data);
      const kept = prev.filter((id) => current.some((a) => a.id === id));
      const added = current
        .filter((a) => a.status !== "cancelled" && !kept.includes(a.id))
        .map((a) => a.id);
      if (kept.length === prev.length && added.length === 0) return prev;
      return [...kept, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localApptIds]);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const counts = {
    citas: data.appointments.length,
    clientes: data.contacts.length,
    servicios: data.services.length,
    promotores: data.promoters.length,
    doctores: (data.doctors ?? []).length,
  };
  const hasDemoData =
    counts.citas + counts.clientes + counts.servicios + counts.promotores + counts.doctores > 0;
  const localAppts = localOnlyAppointments(data);
  // Servicios y doctores que solo viven en este aparato (sin id de
  // la nube): son los que faltan por subir para que el link los vea.
  const localServices = data.services.filter((s) => !isCloudId(s.id));
  const localDoctors = (data.doctors ?? []).filter((d) => !isCloudId(d.id));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    const cleanName = name.trim();
    const cleanLink = link.trim().toLowerCase();
    const gapMinutes = Math.max(0, Math.min(120, Number(gap) || 0));
    const cleanEmail = googleEmail.trim();
    if (!cleanName) {
      setError("Escribe el nombre de tu negocio.");
      return;
    }
    if (!LINK_RE.test(cleanLink)) {
      setError(
        "El enlace solo puede tener letras minúsculas, números y guiones. Ejemplo: clinica-dentiplus"
      );
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Ese correo de Google Calendar no se ve válido. Revísalo.");
      return;
    }
    // Tiempo de descanso: si se pone uno, hay que poner los dos y que
    // la salida sea después de la entrada. Vacío = sin descanso.
    const cleanBreakStart = breakStart.trim();
    const cleanBreakEnd = breakEnd.trim();
    if ((cleanBreakStart && !cleanBreakEnd) || (!cleanBreakStart && cleanBreakEnd)) {
      setError("Para el tiempo de descanso pon la hora de inicio y la de fin, o deja las dos vacías.");
      return;
    }
    if (cleanBreakStart && cleanBreakEnd && cleanBreakEnd <= cleanBreakStart) {
      setError("En el tiempo de descanso, la hora de fin debe ser después de la de inicio.");
      return;
    }

    // 1) Se guarda aquí mismo para que se vea de inmediato.
    const next: StoreData = {
      ...data,
      org: {
        ...data.org,
        name: cleanName,
        slug: cleanLink,
        buffer_minutes: gapMinutes,
        break_start: cleanBreakStart || null,
        break_end: cleanBreakEnd || null,
        connected_google_email: cleanEmail || null,
      },
    };
    saveStore(next);
    setData(next);
    setGap(String(gapMinutes));

    // 2) Se guarda también en la nube, por la ruta del servidor (con
    // el secreto del negocio, como las citas): así no depende de las
    // reglas del navegador y el link usa los mismos datos.
    if (!supabaseConfigured()) {
      setMessage("Listo, ya se guardaron los datos de tu negocio.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveOrgToCloud(next, {
        name: cleanName,
        slug: cleanLink,
        buffer_minutes: gapMinutes,
        break_start: cleanBreakStart || null,
        break_end: cleanBreakEnd || null,
        connected_google_email: cleanEmail || null,
      });
      if (!result.ok) {
        if (String(result.message).includes("ya lo usa otro negocio")) {
          setError(
            "Ese enlace ya lo usa otro negocio, prueba con otro. Los demás datos sí quedaron guardados aquí."
          );
        } else {
          setError(
            "Se guardó aquí, pero no se pudo guardar en la nube. Revisa tu conexión e inténtalo de nuevo."
          );
        }
        return;
      }
      setMessage("Listo, ya se guardaron los datos de tu negocio.");
    } catch {
      setError(
        "Se guardó aquí, pero no se pudo guardar en la nube. Revisa tu conexión e inténtalo de nuevo."
      );
    } finally {
      setSaving(false);
    }
  };

  // Sube a la nube solo las citas marcadas en la lista. No borra
  // nada local: solo les pone su id de la nube para que al confirmarlas
  // ya lleguen a Google Calendar y a WhatsApp. Las que no se marcan
  // se quedan en este aparato.
  const uploadToCloud = async () => {
    if (!data) return;
    setSyncing(true);
    setSyncMessage("");
    setSyncError("");
    if (selectedIds.length === 0) {
      setSyncError("Marca al menos una cita en la lista para subirla.");
      setSyncing(false);
      return;
    }
    try {
      const result = await uploadSelectedAppointments(data, selectedIds);
      let next = data;
      if (result.mapping.length > 0) {
        next = applyCloudIds(data, result.mapping);
        setData(next);
      }
      const parts = [`${result.uploaded} citas subidas a la nube.`];
      if (result.skipped > 0) parts.push(`${result.skipped} ya estaban en la nube.`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} no se pudieron subir.`);
      setSyncMessage(parts.join(" "));
      if (result.errors.length > 0) setSyncError(result.errors.slice(0, 3).join(" "));
    } catch (e) {
      setSyncError(`No se pudo subir: ${String(e)}. Revisa tu conexión e inténtalo de nuevo.`);
    } finally {
      setSyncing(false);
    }
  };

  // Baja las citas de la nube y las mezcla con las de este aparato.
  const downloadFromCloud = async () => {
    if (!data) return;
    setSyncing(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const cloud = await fetchCloudAppointments(data.org.id, data.org.excel_webhook_secret);
      const before = data.appointments.length;
      const next = mergeCloudIntoStore(data, cloud);
      setData(next);
      const added = next.appointments.length - before;
      setSyncMessage(
        added > 0
          ? `Listo: llegaron ${added} citas de la nube.`
          : "Ya estabas al día: no llegó ninguna cita nueva de la nube."
      );
    } catch (e) {
      setSyncError(`No se pudo bajar: ${String(e)}. Revisa tu conexión e inténtalo de nuevo.`);
    } finally {
      setSyncing(false);
    }
  };

  // Sube a la nube los servicios y doctores que solo viven en este
  // aparato (los que todavía no tienen id de la nube). No borra nada:
  // si en la nube ya existe uno con el mismo nombre, se actualiza en
  // vez de duplicarse, y aquí se le pone su id de la nube.
  const uploadCatalog = async () => {
    if (!data) return;
    setCatalogSyncing(true);
    setCatalogSyncMessage("");
    setCatalogSyncError("");
    try {
      const result = await uploadCatalogToCloud(data);
      const next = applyCatalogIds(data, result);
      if (next !== data) setData(next);
      const serviceCount = result.services.created + result.services.updated;
      const doctorCount = result.doctors.created + result.doctors.updated;
      const parts = [];
      if (serviceCount > 0) parts.push(`${serviceCount} servicios`);
      if (doctorCount > 0) parts.push(`${doctorCount} doctores`);
      if (parts.length === 0) {
        setCatalogSyncMessage("Ya estabas al día: no había nada que subir.");
      } else {
        setCatalogSyncMessage(`Listo: se subieron ${parts.join(" y ")} a la nube.`);
      }
      const errors = [...result.services.errors, ...result.doctors.errors];
      if (errors.length > 0) setCatalogSyncError(errors.slice(0, 3).join(" "));
    } catch (e) {
      setCatalogSyncError(`No se pudo subir: ${String(e)}. Revisa tu conexión e inténtalo de nuevo.`);
    } finally {
      setCatalogSyncing(false);
    }
  };

  const clearDemo = async () => {
    setClearing(true);
    setClearMessage("");
    setError("");
    // 1) Se borra aquí mismo.
    const next = clearDemoData(data);
    setData(next);
    setConfirmClear(false);

    // 2) Se borra también en la nube, cuando hay sesión.
    // Primero las citas y luego clientes, servicios y promotores.
    if (!supabaseConfigured()) {
      setClearMessage(
        "Ya quedó limpio. Tu agenda está lista para tus datos reales."
      );
      setClearing(false);
      return;
    }
    try {
      const client = supabaseBrowser();
      if (!client) {
        setClearMessage(
          "Ya quedó limpio. Tu agenda está lista para tus datos reales."
        );
        return;
      }
      const orgId = data.org.id;
      for (const table of [
        "appointments",
        "contacts",
        "services",
        "promoters",
        "doctors",
      ]) {
        const { error: deleteError } = await client
          .from(table)
          .delete()
          .eq("organization_id", orgId);
        if (deleteError) {
          setClearMessage(
            "Se borró aquí, pero algo no se pudo borrar en la nube. Inténtalo de nuevo en un momento."
          );
          return;
        }
      }
      setClearMessage(
        "Ya quedó limpio. Tu agenda está lista para tus datos reales."
      );
    } catch {
      setClearMessage(
        "Se borró aquí, pero algo no se pudo borrar en la nube. Inténtalo de nuevo en un momento."
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="text-sm text-slate-500">
          Cambia los datos de tu negocio y, cuando estés listo, borra los
          datos de ejemplo para empezar limpio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de tu negocio</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {message && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {message}
            </p>
          )}
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre del negocio *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ejemplo: Clínica Dental Sonrisa"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Enlace de tu negocio *
              </label>
              <Input
                value={link}
                onChange={(e) =>
                  setLink(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                  )
                }
                placeholder="Ejemplo: clinica-dentiplus"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Así sale en tu link de reserva, solo letras y guiones.
              </p>
              <button
                type="button"
                className="mt-1 text-xs font-medium text-brand-700 hover:underline"
                onClick={() => setLink(slugify(name))}
              >
                Usar el nombre para el enlace
              </button>
              {origin && link && (
                <p className="mt-2 rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
                  Tu link de reserva:{" "}
                  <code>
                    {origin}/reserva/{link}
                  </code>
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">
                Tiempo entre citas *
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={gap}
                  onChange={(e) => setGap(e.target.value)}
                  className="w-24"
                  required
                />
                <span className="text-sm text-slate-600">minutos</span>
                {[5, 10, 15, 30].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={Number(gap) === m ? "default" : "outline"}
                    onClick={() => setGap(String(m))}
                  >
                    {m} min
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Minutos libres entre una cita y otra, para que no se empalmen.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">
                Tiempo de descanso
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-32"
                />
                <span className="text-sm text-slate-600">a</span>
                <Input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-32"
                />
                {(breakStart || breakEnd) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBreakStart("");
                      setBreakEnd("");
                    }}
                  >
                    Quitar descanso
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                La hora de comida de la clínica. En ese tiempo no se muestran
                ni se permiten citas. Déjalo vacío si no hay descanso.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">
                Correo de Google Calendar
              </label>
              <Input
                type="email"
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                placeholder="Ejemplo: agenda.tunegocio@gmail.com"
              />
              <p className="mt-1 text-xs text-slate-500">
                El correo de la cuenta de Google que se usa solo para las
                citas. Puedes dejarlo vacío por ahora.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sincronizar con la nube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {syncMessage && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {syncMessage}
            </p>
          )}
          {syncError && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {syncError}
            </p>
          )}
          <p className="text-sm text-slate-600">
            Solo las citas que están en la nube llegan a Google Calendar y
            reciben la confirmación por WhatsApp. Ahora mismo tienes{" "}
            <strong>{localAppts.length} citas</strong> que solo viven en
            este aparato. Marca las que quieras subir y deja fuera las
            que ya no van.
          </p>
          {localAppts.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing}
                  onClick={() =>
                    setSelectedIds(
                      localAppts
                        .filter((a) => a.status !== "cancelled")
                        .map((a) => a.id)
                    )
                  }
                >
                  Seleccionar todas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing}
                  onClick={() => setSelectedIds([])}
                >
                  Quitar selección
                </Button>
                <span className="self-center text-xs text-slate-500">
                  {selectedIds.length} de {localAppts.length} marcadas
                </span>
              </div>
              <ul className="space-y-2">
                {localAppts.map((a) => {
                  const cancelled = a.status === "cancelled";
                  const checked = selectedIds.includes(a.id);
                  return (
                    <li key={a.id}>
                      <label
                        className={
                          "flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm " +
                          (cancelled
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : "border-slate-300 bg-white")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={syncing}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, a.id]
                                : prev.filter((id) => id !== a.id)
                            )
                          }
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span>
                          <span className="font-medium">
                            {contactName(data, a.contact_id)}
                          </span>{" "}
                          · {fmtDate(a.start_time)} · {fmtTime(a.start_time)}–
                          {fmtTime(a.end_time)}
                          <span className="block text-xs text-slate-500">
                            {serviceName(data, a.service_id)} ·{" "}
                            {doctorName(data, a.doctor_id) || "Sin asignar"}{" "}
                            · {STATUS_LABEL[a.status]}
                          </span>
                          {cancelled && (
                            <span className="block text-xs font-medium text-red-700">
                              Cancelada — no vale la pena subirla.
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={uploadToCloud}
              disabled={syncing || selectedIds.length === 0}
            >
              {syncing
                ? "Sincronizando…"
                : `Subir ${selectedIds.length > 0 ? `${selectedIds.length} ` : ""}citas marcadas a la nube`}
            </Button>
            <Button variant="outline" onClick={downloadFromCloud} disabled={syncing}>
              {syncing ? "Sincronizando…" : "Bajar citas de la nube"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Al subir, solo las citas marcadas quedan también en la nube
            con su mismo estado; nada se borra de este aparato. Al bajar,
            las citas de la nube se agregan a las de aquí, sin duplicar.
          </p>

          <div className="border-t border-slate-200 pt-3">
            {catalogSyncMessage && (
              <p className="mb-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                {catalogSyncMessage}
              </p>
            )}
            {catalogSyncError && (
              <p className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {catalogSyncError}
              </p>
            )}
            <p className="text-sm text-slate-600">
              Los servicios y doctores también se guardan solos en la
              nube cuando los agregas o editas. Si alguno solo vive en
              este aparato, súbelo aquí:{" "}
              <strong>
                {localServices.length} servicios y {localDoctors.length}{" "}
                doctores
              </strong>{" "}
              por subir.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={uploadCatalog}
              disabled={
                catalogSyncing ||
                localServices.length + localDoctors.length === 0
              }
            >
              {catalogSyncing
                ? "Sincronizando…"
                : "Subir servicios y doctores a la nube"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos de ejemplo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearMessage && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {clearMessage}
            </p>
          )}
          {hasDemoData ? (
            <>
              <p className="text-sm text-slate-600">
                Ahora mismo tu agenda tiene los datos de ejemplo con los que
                se probó la app: {counts.citas} citas, {counts.clientes}{" "}
                clientes, {counts.servicios} servicios, {counts.promotores}{" "}
                promotores y {counts.doctores} doctores.
              </p>
              {!confirmClear ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirmClear(true)}
                  disabled={clearing}
                >
                  Borrar los datos de ejemplo
                </Button>
              ) : (
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">
                    ¿Seguro que quieres borrarlos?
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    Esto borra todas las citas, los clientes, los servicios,
                    los promotores y los doctores de ejemplo. Tu negocio y tu
                    cuenta no se borran. Esta acción no se puede deshacer.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      onClick={clearDemo}
                      disabled={clearing}
                    >
                      {clearing ? "Borrando…" : "Sí, borrar todo"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmClear(false)}
                      disabled={clearing}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Ya no tienes datos de ejemplo. Tu agenda está limpia y lista
              para tus datos reales. Puedes agregar servicios en{" "}
              <Link
                href="/dashboard/servicios"
                className="font-medium text-brand-700 hover:underline"
              >
                Servicios
              </Link>{" "}
              y citas en{" "}
              <Link
                href="/dashboard/nueva"
                className="font-medium text-brand-700 hover:underline"
              >
                Nueva cita
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
