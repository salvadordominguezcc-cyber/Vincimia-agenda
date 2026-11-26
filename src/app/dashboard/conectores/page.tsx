"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStore, type StoreData } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { AlertTriangle, Bell, Calendar, FileSpreadsheet, MessageSquare } from "lucide-react";

interface GoogleStatus {
  connected: boolean;
  status: string;
  configured: boolean;
  connected_google_email: string | null;
  last_calendar_sync: string | null;
  message: string;
}

interface WaStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  business_number: string | null;
  message: string;
}

interface MetaChannelStatus {
  configured: boolean;
  status: string;
  message: string;
  webhook_url: string;
}

interface MetaStatus {
  messenger: MetaChannelStatus;
  instagram: MetaChannelStatus;
}

export default function ConectoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [testResult, setTestResult] = useState("");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [wa, setWa] = useState<WaStatus | null>(null);
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [googleBanner, setGoogleBanner] = useState("");
  const [syncResult, setSyncResult] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  // Interruptor de confirmaciones de Vincimia (formato Confirmafy).
  // null = aún no se leyó el valor guardado.
  const [confirmations, setConfirmations] = useState<boolean | null>(null);
  const [confirmationsBusy, setConfirmationsBusy] = useState(false);
  const [confirmationsNote, setConfirmationsNote] = useState("");
  // Respaldo local cuando Supabase no está configurado (modo demo):
  // el interruptor vive solo en este aparato y se dice así en la
  // tarjeta; en la nube vive en organizations (migración 010).
  const confirmationsLocalKey = (id: string) => `vincimia-confirmaciones-v1:${id}`;

  const orgId = data?.org.id ?? "";
  const secret = data?.org.excel_webhook_secret ?? "";

  const loadStatuses = async (id: string, orgSecret: string) => {
    try {
      const [g, w, m] = await Promise.all([
        fetch(`/api/google-calendar/status?organization_id=${id}`).then((r) => r.json()),
        fetch(`/api/whatsapp/status?organization_id=${id}`).then((r) => r.json()),
        fetch("/api/meta/status").then((r) => r.json()),
      ]);
      setGoogle(g as GoogleStatus);
      setWa(w as WaStatus);
      setMeta(m as MetaStatus);
    } catch {
      // Sin red, las tarjetas muestran su estado pendiente por defecto.
    }
    try {
      const res = await fetch(`/api/confirmations/toggle?organization_id=${id}`, {
        headers: { Authorization: `Bearer ${orgSecret}` },
      });
      const json = await res.json();
      if (json.ok && typeof json.enabled === "boolean") {
        setConfirmations(json.enabled);
      } else {
        setConfirmations(true);
      }
    } catch {
      setConfirmations(true);
    }
  };

  const loadConfirmationsLocal = (id: string) => {
    try {
      const saved = window.localStorage.getItem(confirmationsLocalKey(id));
      setConfirmations(saved === null ? true : saved === "true");
    } catch {
      setConfirmations(true);
    }
  };

  useEffect(() => {
    const d = loadStore();
    setData(d);
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("google") === "connected") {
        setGoogleBanner("Google Calendar conectado. Ya puedes sincronizar.");
      } else if (q.get("google") === "error") {
        setGoogleBanner(q.get("message") ?? "No se pudo conectar Google Calendar.");
      }
    }
    if (supabaseConfigured()) loadStatuses(d.org.id, d.org.excel_webhook_secret);
    else loadConfirmationsLocal(d.org.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/sheets`
      : "/api/webhook/sheets";

  const testWebhook = async () => {
    setTestResult("Probando…");
    try {
      const res = await fetch("/api/webhook/sheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.org.excel_webhook_secret}`,
        },
        body: JSON.stringify({
          organization_id: data.org.id,
          promoter_name: "Carlos M.",
          client_name: "Prueba Sheets",
          client_phone: "+52 686 000 0000",
          start_time: `${new Date().toISOString().slice(0, 10)}T10:00:00`,
          service_name: "Consulta General",
          source: "excel_promoter",
        }),
      });
      const json = await res.json();
      setTestResult(`HTTP ${res.status} — ${JSON.stringify(json, null, 2)}`);
    } catch (e) {
      setTestResult(`Error: ${String(e)}`);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncResult("Sincronizando con Google Calendar…");
    try {
      const res = await fetch("/api/google-calendar/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ organization_id: orgId }),
      });
      const json = await res.json();
      setSyncResult(
        json.ok
          ? json.message
          : `No se pudo sincronizar: ${json.message ?? "error desconocido"}`
      );
      await loadStatuses(orgId, secret);
    } catch (e) {
      setSyncResult(`Error: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!window.confirm("¿Desconectar Google Calendar? Las citas ya creadas en Google no se borran.")) return;
    await fetch("/api/google-calendar/disconnect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ organization_id: orgId }),
    });
    await loadStatuses(orgId, secret);
  };

  const toggleWa = async (enabled: boolean) => {
    setWaBusy(true);
    try {
      const res = await fetch("/api/whatsapp/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ organization_id: orgId, enabled }),
      });
      const json = await res.json();
      if (!json.ok) alert(json.message ?? "No se pudo cambiar el bot.");
      await loadStatuses(orgId, secret);
    } finally {
      setWaBusy(false);
    }
  };

  const toggleConfirmations = async (enabled: boolean) => {
    setConfirmationsBusy(true);
    setConfirmationsNote("");
    if (!supabaseConfigured()) {
      // Modo demo: solo en este aparato, no en la nube.
      try {
        window.localStorage.setItem(confirmationsLocalKey(orgId), String(enabled));
      } catch {
        // Sin almacenamiento, el cambio solo vive en esta pantalla.
      }
      setConfirmations(enabled);
      setConfirmationsNote(
        enabled
          ? "Guardado solo en este aparato (modo demo, sin nube)."
          : "Guardado solo en este aparato (modo demo, sin nube)."
      );
      setConfirmationsBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/confirmations/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ organization_id: orgId, enabled }),
      });
      const json = await res.json();
      if (!json.ok) {
        setConfirmationsNote(json.message ?? "No se pudo cambiar.");
      } else {
        setConfirmations(json.enabled === true);
        setConfirmationsNote(json.message ?? "");
      }
    } catch (e) {
      setConfirmationsNote(`Error: ${String(e)}`);
    } finally {
      setConfirmationsBusy(false);
    }
  };

  const googleConnected = google?.connected ?? false;
  const waConnected = wa?.connected ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conectores</h1>
        <p className="text-sm text-slate-500">
          Estado real de cada integración. Nada aquí se simula como conectado:
          lo pendiente dice pendiente.
        </p>
      </div>

      {googleBanner && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{googleBanner}</p>
      )}

      <Card className={googleConnected ? "border-2 border-green-300" : "border-2 border-amber-300"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-600" />
            Google Calendar — cuenta secundaria
            <span
              className={
                googleConnected
                  ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
                  : "rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800"
              }
            >
              {googleConnected ? "Conectado" : "Pendiente de conectar"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {googleConnected ? (
            <>
              <p>
                <strong>Conectado con:</strong>{" "}
                {google?.connected_google_email ?? "cuenta de Google"}
              </p>
              <p>
                Última sincronización:{" "}
                {google?.last_calendar_sync
                  ? new Date(google.last_calendar_sync).toLocaleString("es-MX")
                  : "aún no se ha sincronizado"}
              </p>
              <p>
                Al confirmar, mover o cancelar una cita en la Agenda, se
                actualiza también en Google Calendar. Los eventos que se
                escriben a mano en Google se traen a la agenda sin empalmar
                con otras citas ni con el tiempo de descanso.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={syncNow} disabled={syncing}>
                  {syncing ? "Sincronizando…" : "Sincronizar ahora"}
                </Button>
                <Button variant="outline" onClick={disconnectGoogle}>
                  Desconectar
                </Button>
              </div>
              {syncResult && (
                <p className="rounded-lg bg-slate-100 p-3 text-sm">{syncResult}</p>
              )}
            </>
          ) : (
            <>
              <p>
                <strong>Estado: no conectado.</strong>{" "}
                {google?.message ??
                  "No hay ningún token guardado y no se muestra ninguna cita de Google como si fuera real."}
              </p>
              <p>Para conectarlo falta:</p>
              <ol className="list-decimal pl-5 text-slate-700">
                <li>
                  Crear el proyecto en Google Cloud y activar la Calendar API
                  (paso a paso en <code>FASE2_SETUP.md</code>).
                </li>
                <li>
                  Guardar el ID y el secreto de Google en Cloudflare y pulsar
                  Conectar: Google te pedirá elegir la cuenta secundaria —
                  correo maestro <code>iavincimia@gmail.com</code> — sin
                  cerrar tu sesión.
                </li>
                <li>
                  Al conectar, el permiso se guarda y la sincronización queda
                  activa en los dos sentidos.
                </li>
              </ol>
              <p className="text-slate-500">
                En el modo demo, la cita de Roberto Gómez 09:00 está marcada
                como origen &quot;Google Calendar&quot; solo como dato de
                ejemplo, para mostrar cómo se ve una cita de esa fuente en la
                agenda unificada.
              </p>
              <Button asChild disabled={!google?.configured && supabaseConfigured()}>
                <a href={`/api/google-calendar/auth?organization_id=${orgId}`}>
                  Conectar cuenta secundaria
                </a>
              </Button>
              {!supabaseConfigured() && (
                <p className="text-slate-500">
                  En modo demo sin Supabase no se puede conectar: primero
                  configura la nube.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            Google Sheets — promotores (webhook)
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              Listo en este MVP
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            URL del webhook:{" "}
            <code className="rounded bg-slate-100 px-1">{webhookUrl}</code>
          </p>
          <p>
            Secreto del webhook (columna{" "}
            <code>excel_webhook_secret</code> de la organización):{" "}
            <code className="rounded bg-slate-100 px-1">
              {data.org.excel_webhook_secret}
            </code>
          </p>
          <p>
            Columnas de la hoja: A Fecha · B Hora · C Cliente · D Teléfono ·
            E Promotor · F Estado. El script está en{" "}
            <code>scripts/apps-script-sheets.gs</code>: pégalo en la hoja en
            Extensiones → Apps Script.
          </p>
          <p>
            Si la fila choca con una cita existente, el webhook responde{" "}
            <code>success: false, status: &quot;conflict&quot;</code> y la hoja
            marca la fila en rojo. Si no choca, crea la cita en{" "}
            <code>pending</code>.
          </p>
          <Button variant="outline" onClick={testWebhook}>
            Probar webhook (cita de prueba 10:00, debe dar conflicto)
          </Button>
          {testResult && (
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-green-300">
              {testResult}
            </pre>
          )}
          <p className="text-xs text-slate-500">
            En modo demo sin Supabase, la ruta responde 503 explicando que el
            webhook real necesita la nube. Con Supabase configurado, valida el
            secreto, corre el anti-empalme y guarda en la tabla appointments.
          </p>
        </CardContent>
      </Card>

      <Card className={waConnected ? "border-2 border-green-300" : "border-2 border-slate-300"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand-600" />
            Bot de WhatsApp
            <span
              className={
                waConnected
                  ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
                  : "rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
              }
            >
              {waConnected ? "Activo" : "Pendiente de conectar"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{wa?.message ?? "Cargando el estado de WhatsApp…"}</p>
          {wa?.business_number && (
            <p>
              Número del negocio:{" "}
              <code className="rounded bg-slate-100 px-1">{wa.business_number}</code>
            </p>
          )}
          {waConnected ? (
            <>
              <p>
                Al confirmar una cita en la Agenda, el bot manda solo la
                confirmación por WhatsApp, con el aviso de llegar 15 minutos
                antes si es la primera vez del paciente. Si el paciente
                responde <strong>Confirmo</strong>, la cita queda confirmada;
                si responde <strong>Cancelar</strong>, queda cancelada.
              </p>
              <Button variant="outline" onClick={() => toggleWa(false)} disabled={waBusy}>
                Apagar el bot
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                Todavía no se envía ninguna confirmación automática: la
                confirmación hoy es manual, en la Agenda, y el mensaje listo
                para copiar sigue ahí.
              </p>
              <p>
                Para activarlo falta: la cuenta de WhatsApp Business en Meta,
                el número, el token en Cloudflare y pegar el webhook en Meta
                (paso a paso en <code>FASE2_SETUP.md</code>). Los mensajes
                los cobra Meta: los primeros 1,000 de servicio al mes son
                gratis y luego cuestan unos $0.16 pesos por mensaje de
                utilidad en México.
              </p>
              <Button
                onClick={() => toggleWa(true)}
                disabled={waBusy || !wa?.configured}
              >
                Activar el bot
              </Button>
              {!wa?.configured && (
                <p className="text-slate-500">
                  Primero hay que guardar el token y el número en Cloudflare
                  (ver FASE2_SETUP.md); sin eso el botón no se puede usar.
                </p>
              )}
            </>
          )}
          <p className="text-xs text-slate-500">
            Webhook para pegar en Meta:{" "}
            <code className="rounded bg-slate-100 px-1">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/webhook/whatsapp`
                : "/api/webhook/whatsapp"}
            </code>
          </p>
        </CardContent>
      </Card>

      <Card className={confirmations === false ? "border-2 border-slate-300" : "border-2 border-green-300"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-600" />
            Confirmaciones de Vincimia (formato Confirmafy)
            <span
              className={
                confirmations === false
                  ? "rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                  : "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
              }
            >
              {confirmations === null
                ? "Cargando…"
                : confirmations
                  ? "Activo"
                  : "Inactivo"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Cuando está <strong>activo</strong>, al confirmar una cita Vincimia
            crea o actualiza el evento en Google Calendar con el formato
            Confirmafy (título &quot;🟢 Nombre / teléfono / tratamiento&quot;,
            color del doctor, recordatorio 30 minutos antes) y manda la
            confirmación por WhatsApp al paciente.
          </p>
          <p>
            Cuando está <strong>inactivo</strong>, al confirmar la cita solo
            se guarda en Vincimia: no se crea ni actualiza nada en Google y
            no se manda WhatsApp. Así Confirmafy sigue confirmando sin que
            nada se empalme ni le lleguen dos mensajes al paciente.
          </p>
          {!supabaseConfigured() && (
            <p className="text-slate-500">
              En modo demo sin Supabase, este interruptor solo vive en este
              aparato (no se guarda en la nube).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {confirmations !== false ? (
              <Button
                variant="outline"
                onClick={() => toggleConfirmations(false)}
                disabled={confirmationsBusy || confirmations === null}
              >
                Apagar confirmaciones
              </Button>
            ) : (
              <Button
                onClick={() => toggleConfirmations(true)}
                disabled={confirmationsBusy}
              >
                Prender confirmaciones
              </Button>
            )}
          </div>
          {confirmationsNote && (
            <p className="rounded-lg bg-slate-100 p-3 text-sm">{confirmationsNote}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 border-slate-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand-600" />
            Messenger (Facebook)
            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
              {meta?.messenger.configured ? "Configurado, pendiente de autorizar" : "Pendiente de conectar"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{meta?.messenger.message ?? "Cargando el estado de Messenger…"}</p>
          <p>
            Cuando esté conectado, los mensajes de la fanpage llegan a la
            bandeja y el bot unificado contesta solo, con el mismo cerebro
            que en WhatsApp. Si quiere agendar, le pasa el link de
            WhatsApp del consultorio.
          </p>
          <p>
            Para activarlo falta: el producto Messenger en la app de Meta,
            autorizar la página, verificar el webhook y pegar
            <code className="rounded bg-slate-100 px-1"> META_PAGE_ACCESS_TOKEN</code> y
            <code className="rounded bg-slate-100 px-1"> META_VERIFY_TOKEN</code> en
            Cloudflare (paso a paso en <code>FASE2_SETUP.md</code>).
          </p>
          <p className="text-xs text-slate-500">
            Webhook para pegar en Meta:{" "}
            <code className="rounded bg-slate-100 px-1">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/webhook/messenger`
                : "/api/webhook/messenger"}
            </code>
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-slate-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand-600" />
            Instagram
            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
              {meta?.instagram.configured ? "Configurado, pendiente de autorizar" : "Pendiente de conectar"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{meta?.instagram.message ?? "Cargando el estado de Instagram…"}</p>
          <p>
            Cuando esté conectado, los mensajes directos de la cuenta
            profesional de Instagram llegan a la bandeja y el bot
            unificado contesta solo, con el mismo cerebro que en
            WhatsApp. Si quiere agendar, le pasa el link de WhatsApp
            del consultorio.
          </p>
          <p>
            Para activarlo falta: el producto Instagram en la app de Meta,
            vincular la cuenta profesional con su fanpage, autorizarla,
            verificar el webhook y pegar
            <code className="rounded bg-slate-100 px-1"> META_INSTAGRAM_TOKEN</code> y
            <code className="rounded bg-slate-100 px-1"> META_VERIFY_TOKEN</code> en
            Cloudflare (paso a paso en <code>FASE2_SETUP.md</code>).
          </p>
          <p className="text-xs text-slate-500">
            Webhook para pegar en Meta:{" "}
            <code className="rounded bg-slate-100 px-1">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/webhook/instagram`
                : "/api/webhook/instagram"}
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
