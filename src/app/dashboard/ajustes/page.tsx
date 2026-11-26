// Ajustes — Datos de tu negocio y borrar los datos de ejemplo.
// Lenguaje normal en toda la pantalla: nada de "slug", "buffer" ni
// jerga técnica a la vista. Los valores técnicos (slug, buffer_minutes,
// connected_google_email) solo viven dentro del código y en Supabase.
//
// Qué hace al guardar: actualiza el negocio aquí mismo (localStorage)
// para que el cambio se vea de inmediato, y también en Supabase cuando
// hay sesión. Las reglas de Supabase ya permiten que un miembro del
// negocio actualice sus datos y borre sus filas (ver supabase/schema.sql:
// "org_update_members" y las reglas de promotores/servicios/contactos/
// citas); no hace falta ninguna regla nueva, solo que el usuario ya
// tenga su acceso, que el panel crea solo al entrar (ensureMembership).
// Al borrar los datos de ejemplo NO se borra el negocio ni la cuenta.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearDemoData, loadStore, saveStore, type StoreData } from "@/lib/store";
import {
  applyCloudIds,
  fetchCloudAppointments,
  localOnlyAppointments,
  mergeCloudIntoStore,
  uploadLocalAppointments,
} from "@/lib/cloud-sync";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { slugify } from "@/lib/types";

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

  useEffect(() => {
    const d = loadStore();
    setData(d);
    setName(d.org.name);
    setLink(d.org.slug);
    setGap(String(d.org.buffer_minutes));
    setBreakStart(d.org.break_start ?? "");
    setBreakEnd(d.org.break_end ?? "");
    setGoogleEmail(d.org.connected_google_email ?? "");
  }, []);

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
        "El enlace solo puede tener letras minúsculas, números y guiones. Ejemplo: clinica-sonrisa"
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

    // 2) Se guarda también en la nube, cuando hay sesión.
    if (!supabaseConfigured()) {
      setMessage("Listo, ya se guardaron los datos de tu negocio.");
      return;
    }
    setSaving(true);
    try {
      const client = supabaseBrowser();
      if (!client) {
        setMessage("Listo, ya se guardaron los datos de tu negocio.");
        return;
      }
      const { error: updateError } = await client
        .from("organizations")
        .update({
          name: cleanName,
          slug: cleanLink,
          buffer_minutes: gapMinutes,
          break_start: cleanBreakStart || null,
          break_end: cleanBreakEnd || null,
          connected_google_email: cleanEmail || null,
        })
        .eq("id", data.org.id);
      if (updateError) {
        if (updateError.code === "23505") {
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

  // Sube a la nube las citas que solo viven en este aparato. No borra
  // nada local: solo les pone su id de la nube para que al confirmarlas
  // ya lleguen a Google Calendar y a WhatsApp.
  const uploadToCloud = async () => {
    if (!data) return;
    setSyncing(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const result = await uploadLocalAppointments(data);
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
                placeholder="Ejemplo: clinica-sonrisa"
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
            <strong>{localOnlyAppointments(data).length} citas</strong> que
            solo viven en este aparato.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={uploadToCloud} disabled={syncing || localOnlyAppointments(data).length === 0}>
              {syncing ? "Sincronizando…" : "Subir mis citas locales a la nube"}
            </Button>
            <Button variant="outline" onClick={downloadFromCloud} disabled={syncing}>
              {syncing ? "Sincronizando…" : "Bajar citas de la nube"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Al subir, las citas quedan también en la nube con su mismo
            estado; nada se borra de este aparato. Al bajar, las citas de
            la nube se agregan a las de aquí, sin duplicar.
          </p>
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
