"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStore, type StoreData } from "@/lib/store";
import { AlertTriangle, Calendar, FileSpreadsheet, MessageSquare } from "lucide-react";

export default function ConectoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    setData(loadStore());
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
      setTestResult(
        `HTTP ${res.status} — ${JSON.stringify(json, null, 2)}`
      );
    } catch (e) {
      setTestResult(`Error: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conectores</h1>
        <p className="text-sm text-slate-500">
          Estado real de cada integración. Nada aquí se simula como conectado:
          lo pendiente dice pendiente.
        </p>
      </div>

      <Card className="border-2 border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-600" />
            Google Calendar — cuenta secundaria
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Pendiente de conectar
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Estado: no conectado.</strong> No hay ningún token guardado
            en este MVP (el campo <code>google_refresh_token</code> está vacío
            en la base de datos) y no se muestra ninguna cita de Google como si
            fuera real.
          </p>
          <p>Para conectarlo en la Fase 1 completa, falta:</p>
          <ol className="list-decimal pl-5 text-slate-700">
            <li>
              Crear el proyecto en Google Cloud y activar la Calendar API.
            </li>
            <li>
              Configurar el OAuth con{" "}
              <code>prompt: &apos;select_account&apos;</code> para elegir la
              cuenta secundaria — correo maestro{" "}
              <code>iavincimia@gmail.com</code> — sin cerrar la sesión
              principal de Vincimia Agenda.
            </li>
            <li>
              Guardar el <code>refresh_token</code> en la tabla{" "}
              <code>organizations</code> (columna{" "}
              <code>google_refresh_token</code>) y poner{" "}
              <code>google_calendar_sync = true</code>.
            </li>
            <li>
              Sincronizar en ambos sentidos: leer eventos creados a mano en
              esa cuenta y escribir en ella las citas aprobadas desde Excel o
              el link público.
            </li>
          </ol>
          <p className="text-slate-500">
            En el modo demo, la cita de Roberto Gómez 09:00 está marcada como
            origen &quot;Google Calendar&quot; solo como dato de ejemplo, para
            mostrar cómo se ve una cita de esa fuente en la agenda unificada.
          </p>
          <Button disabled>
            Conectar cuenta secundaria (requiere credenciales de Google)
          </Button>
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

      <Card className="border-2 border-slate-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-slate-500" />
            Bot de WhatsApp IA
            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
              Fase 2 — Pendiente
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            No hay bot de WhatsApp en este MVP. No se envía ninguna
            confirmación automática y ninguna cita se marca como confirmada por
            WhatsApp. La confirmación hoy es manual, en la Agenda.
          </p>
          <p className="text-slate-500">
            Para la Fase 2 falta: cuenta de WhatsApp Cloud API (Meta),
            plantillas de mensaje aprobadas, costo por mensaje y la ruta que
            reciba las respuestas del cliente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
