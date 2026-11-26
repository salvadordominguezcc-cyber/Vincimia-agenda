"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contactName,
  fmtTime,
  loadStore,
  saveStore,
  serviceName,
  type StoreData,
} from "@/lib/store";
import {
  CHANNEL_LABEL,
  CONVERSATION_STATUS_LABEL,
  money,
  type ConversationStatus,
  type Promoter,
  type VirtualPromoterChannel,
} from "@/lib/types";
import {
  WHATSAPP_CLINICA,
  buildHandoff,
  buildInfoCita,
  defaultPromoterToStore,
  DEFAULT_VIRTUAL_PROMOTERS,
} from "@/lib/virtual-promoters";

const INPUT_CLASS =
  "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50";

const CHANNELS: VirtualPromoterChannel[] = ["facebook", "instagram", "whatsapp"];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatMsg {
  role: "user" | "bot";
  text: string;
}

interface ChatResult {
  ok: boolean;
  reply?: string;
  modo?: string;
  ia_conectada?: boolean;
  quiere_agendar?: boolean;
  treatment?: string | null;
  handoff?: { url: string; message: string } | null;
  info_cita?: string;
  error?: string;
}

/**
 * Tarjeta de un promotor virtual: estadísticas, edición de nombre /
 * persona / canal / fanpage y el simulador "Probar" (charla con el
 * promotor sin Meta conectado). El simulador llama a
 * POST /api/promotores/chat, que responde con IA si hay llaves
 * (Gemini/Groq) o con respuestas locales marcadas como demo.
 */
function VirtualPromoterCard({
  data,
  promoter,
  onChange,
}: {
  data: StoreData;
  promoter: Promoter;
  onChange: (next: StoreData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(promoter.name);
  const [persona, setPersona] = useState(promoter.persona ?? "");
  const [channel, setChannel] = useState<VirtualPromoterChannel>(
    promoter.channel ?? "facebook"
  );
  const [fanpage, setFanpage] = useState(promoter.fanpage_url ?? "");
  const [rate, setRate] = useState(String(promoter.commission_rate));
  const [active, setActive] = useState(promoter.active);

  const [msg, setMsg] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [modo, setModo] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; message: string } | null>(null);
  const [infoCita, setInfoCita] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const convs = data.conversations.filter((c) => c.promoter_id === promoter.id);
  const patients = new Set(
    convs
      .map((c) => (c.patient_phone || c.patient_name || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
  const mine = data.appointments.filter((a) => a.promoter_id === promoter.id);
  const confirmed = mine.filter((a) => a.status === "confirmed");
  const completed = mine.filter((a) => a.status === "completed");
  const totalCompleted = completed.reduce((s, a) => s + a.price, 0);
  const commission = (totalCompleted * promoter.commission_rate) / 100;
  const handoffFijo = buildHandoff(promoter);

  const saveEdit = () => {
    const next: StoreData = {
      ...data,
      promoters: data.promoters.map((p) =>
        p.id === promoter.id
          ? {
              ...p,
              name: name.trim() || promoter.name,
              persona: persona.trim() || null,
              channel,
              fanpage_url: fanpage.trim() || null,
              commission_rate: Number(rate) || 0,
              active,
            }
          : p
      ),
    };
    onChange(next);
    setEditing(false);
  };

  const upsertConversation = (
    treatment: string | null,
    status: ConversationStatus
  ) => {
    const pname = patientName.trim();
    const pphone = patientPhone.trim();
    if (!pname && !pphone) return;
    const key = (pphone || pname).toLowerCase();
    const existing = data.conversations.find(
      (c) =>
        c.promoter_id === promoter.id &&
        (c.patient_phone || c.patient_name || "").trim().toLowerCase() === key
    );
    const now = new Date().toISOString();
    let next: StoreData;
    if (existing) {
      const order: ConversationStatus[] = [
        "conversando",
        "en_whatsapp",
        "cita_confirmada",
        "cita_completada",
      ];
      const better =
        order.indexOf(status) > order.indexOf(existing.status)
          ? status
          : existing.status;
      next = {
        ...data,
        conversations: data.conversations.map((c) =>
          c.id === existing.id
            ? {
                ...c,
                treatment: treatment ?? c.treatment,
                status: better,
                updated_at: now,
              }
            : c
        ),
      };
    } else {
      next = {
        ...data,
        conversations: [
          ...data.conversations,
          {
            id: newId("conv"),
            organization_id: data.org.id,
            promoter_id: promoter.id,
            channel: promoter.channel ?? "facebook",
            patient_name: pname || null,
            patient_phone: pphone || null,
            treatment,
            status,
            appointment_id: null,
            created_at: now,
            updated_at: now,
          },
        ],
      };
    }
    onChange(next);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim() || sending) return;
    const text = msg.trim();
    setMsg("");
    setSendError(null);
    setSending(true);
    setThread((t) => [...t, { role: "user", text }]);
    try {
      const res = await fetch("/api/promotores/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promoter_code: promoter.code,
          channel: promoter.channel ?? "facebook",
          message: text,
          patient_name: patientName.trim() || null,
          patient_phone: patientPhone.trim() || null,
          org_name: data.org.name,
          org_slug: data.org.slug,
          promoter: {
            name: promoter.name,
            persona: promoter.persona,
            channel: promoter.channel ?? "facebook",
          },
        }),
      });
      const json = (await res.json()) as ChatResult;
      if (!json.ok || !json.reply) {
        setSendError(json.error ?? "No se pudo chatear con el promotor.");
        return;
      }
      setThread((t) => [...t, { role: "bot", text: json.reply as string }]);
      setModo(json.modo ?? null);
      setHandoff(json.handoff ?? null);
      if (json.info_cita) setInfoCita(json.info_cita);
      upsertConversation(
        json.treatment ?? null,
        json.quiere_agendar || json.handoff ? "en_whatsapp" : "conversando"
      );
    } catch {
      setSendError("No se pudo contactar la ruta de chat. Revisa que el servidor local esté corriendo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {promoter.name} · {CHANNEL_LABEL[promoter.channel ?? "facebook"]} · Código{" "}
          {promoter.code}
        </CardTitle>
        <p className="text-sm text-slate-500">
          Promotor virtual · {promoter.commission_rate} % comisión ·{" "}
          {promoter.active ? "Activo" : "Inactivo"}
          {promoter.fanpage_url ? (
            <>
              {" · "}
              <a
                href={promoter.fanpage_url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 underline"
              >
                Fanpage
              </a>
            </>
          ) : (
            " · Sin link de fanpage todavía"
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-slate-600">
          <strong>Estilo:</strong>{" "}
          {promoter.persona ?? "Sin persona todavía: edítala abajo."}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <p>
            Conversaciones: <strong>{convs.length}</strong>
          </p>
          <p>
            Pacientes: <strong>{patients}</strong>
          </p>
          <p>
            Confirmadas: <strong>{confirmed.length}</strong>
          </p>
          <p>
            Completadas: <strong>{completed.length}</strong>
          </p>
          <p>
            Comisión:{" "}
            <strong className="text-green-700">{money(commission)}</strong>
          </p>
        </div>
        {convs.length > 0 && (
          <ul className="list-disc pl-5 text-slate-600">
            {convs.slice(-5).map((c) => (
              <li key={c.id}>
                {c.patient_name ?? "Sin nombre"} ·{" "}
                {CONVERSATION_STATUS_LABEL[c.status]}
                {c.treatment ? ` · ${c.treatment}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p>
          Pase a WhatsApp único ({WHATSAPP_CLINICA.display}):{" "}
          <a
            href={handoffFijo.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-brand-600 underline"
          >
            {handoffFijo.url}
          </a>
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Cerrar edición" : "Editar nombre, estilo y canal"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowInfo((v) => !v)}
          >
            {showInfo ? "Ocultar información para la cita" : "Ver información para la cita"}
          </Button>
        </div>

        {editing && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del promotor virtual"
            />
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Estilo del promotor (en español): cómo saluda, qué explica, cómo pasa a WhatsApp"
              rows={4}
              className={`${INPUT_CLASS} h-auto resize-y`}
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as VirtualPromoterChannel)}
                className={`${INPUT_CLASS} w-44`}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
              <Input
                value={fanpage}
                onChange={(e) => setFanpage(e.target.value)}
                placeholder="Link de la fanpage (https://facebook.com/...)"
                className="min-w-64 flex-1"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="% comisión"
                className="w-28"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Activo
              </label>
              <Button type="button" onClick={saveEdit}>
                Guardar
              </Button>
            </div>
          </div>
        )}

        {showInfo && (
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
            {buildInfoCita(promoter, data.org)}
          </pre>
        )}

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 font-semibold">
            Probar: chatea con {promoter.name} (simulador, sin Meta)
          </p>
          {modo && (
            <p className="mb-2 text-xs">
              {modo === "demo" ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                  Demo · sin conexión a la IA (faltan las llaves de Gemini/Groq)
                </span>
              ) : (
                <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                  IA conectada · {modo === "ia-gemini" ? "Gemini" : "Groq"}
                </span>
              )}
            </p>
          )}
          <div className="mb-2 max-h-56 space-y-2 overflow-y-auto">
            {thread.length === 0 && (
              <p className="text-slate-500">
                Escribe como si fueras el paciente, por ejemplo: “Hola, ¿cuánto cuesta la
                limpieza?” o “Quiero agendar una cita”.
              </p>
            )}
            {thread.map((m, i) => (
              <p
                key={i}
                className={
                  m.role === "user"
                    ? "text-right text-slate-800"
                    : "rounded bg-slate-100 p-2 text-slate-800"
                }
              >
                <strong>{m.role === "user" ? "Paciente" : promoter.name}:</strong>{" "}
                {m.text}
              </p>
            ))}
          </div>
          {handoff && (
            <div className="mb-2 rounded bg-green-50 p-2">
              <p className="font-semibold text-green-800">
                Pase a WhatsApp listo:
              </p>
              <a
                href={handoff.url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-brand-600 underline"
              >
                {handoff.url}
              </a>
              <p className="text-slate-600">{handoff.message}</p>
            </div>
          )}
          {infoCita && (
            <pre className="mb-2 whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs text-slate-700">
              {infoCita}
            </pre>
          )}
          {sendError && <p className="mb-2 text-red-700">{sendError}</p>}
          <form onSubmit={send} className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Nombre del paciente (opcional, para registrarlo)"
                className="w-56"
              />
              <Input
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="Teléfono (opcional)"
                className="w-44"
              />
            </div>
            <div className="flex gap-2">
              <Input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Mensaje del paciente…"
                className="flex-1"
              />
              <Button type="submit" disabled={sending}>
                {sending ? "…" : "Enviar"}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Sin nombre ni teléfono, la prueba no se guarda como paciente.
            Con nombre, queda registrada en Conversaciones con el código de
            este promotor.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PromotoresPage() {
  const [data, setData] = useState<StoreData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("10");

  const [vName, setVName] = useState("");
  const [vChannel, setVChannel] = useState<VirtualPromoterChannel>("facebook");

  useEffect(() => {
    setData(loadStore());
  }, []);

  if (!data) return <p className="text-slate-500">Cargando…</p>;

  const updateData = (next: StoreData) => {
    saveStore(next);
    setData(next);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const next: StoreData = {
      ...data,
      promoters: [
        ...data.promoters,
        {
          id: `prom-${Date.now()}`,
          organization_id: data.org.id,
          name: name.trim(),
          code: name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "PROM",
          phone: phone || null,
          commission_rate: Number(rate) || 0,
          active: true,
          created_at: new Date().toISOString(),
        },
      ],
    };
    updateData(next);
    setName("");
    setPhone("");
    setRate("10");
  };

  const addVirtual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) return;
    const base = DEFAULT_VIRTUAL_PROMOTERS[0];
    const def = { ...base, name: vName.trim(), channel: vChannel };
    const code =
      vName
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 12) || `PROMO${Date.now() % 1000}`;
    const next: StoreData = {
      ...data,
      promoters: [
        ...data.promoters,
        {
          ...defaultPromoterToStore(def, data.org.id),
          id: `vprom-${Date.now()}`,
          code: data.promoters.some((p) => p.code === code) ? `${code}X` : code,
        },
      ],
    };
    updateData(next);
    setVName("");
    setVChannel("facebook");
  };

  const humans = data.promoters.filter((p) => !p.is_virtual);
  const virtuals = data.promoters.filter((p) => p.is_virtual);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Promotores</h1>
        <p className="text-sm text-slate-500">
          Las comisiones se liquidan <strong>solo sobre citas completadas</strong>{" "}
          (check-in en recepción). Las citas en pendiente, confirmadas,
          canceladas o en conflicto <strong>no</strong> generan comisión.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promotores virtuales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            3 promotores virtuales, uno por fanpage (Facebook e Instagram), y
            los 3 pasan al mismo WhatsApp del consultorio (
            {WHATSAPP_CLINICA.display}) donde se manda la información para la
            cita. Cada paciente queda registrado con el código de su promotor.
          </p>
          <p className="rounded bg-amber-50 p-2 text-amber-800">
            Sin conexión a Meta todavía: las fanpages, las cuentas de
            Instagram y la autorización de Meta están pendientes (ver
            PROMOTORES_VIRTUALES.md en el repositorio). Aquí se prueban con
            el simulador y, sin llaves de IA, las respuestas son locales
            marcadas como demo.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {virtuals.map((p) => (
          <VirtualPromoterCard
            key={p.id}
            data={data}
            promoter={p}
            onChange={updateData}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar promotor virtual</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addVirtual} className="flex flex-wrap gap-2">
            <Input
              value={vName}
              onChange={(e) => setVName(e.target.value)}
              placeholder="Nombre del promotor virtual"
              className="w-56"
              required
            />
            <select
              value={vChannel}
              onChange={(e) => setVChannel(e.target.value as VirtualPromoterChannel)}
              className={`${INPUT_CLASS} w-44`}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
            <Button type="submit">Agregar virtual</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Se crea con el estilo de ejemplo y su código automático (del
            nombre). Edita su estilo, su fanpage y su canal en su tarjeta.
            En Supabase, la tabla es <code>promoters</code> con{" "}
            <code>is_virtual</code>, <code>persona</code> y{" "}
            <code>channel</code> (migración 008, sin aplicar todavía).
          </p>
        </CardContent>
      </Card>

      <h2 className="pt-2 text-xl font-bold">Promotores humanos</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {humans.map((p) => {
          const mine = data.appointments.filter(
            (a) => a.promoter_id === p.id
          );
          const completed = mine.filter((a) => a.status === "completed");
          const totalCompleted = completed.reduce((s, a) => s + a.price, 0);
          const commission = (totalCompleted * p.commission_rate) / 100;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  {p.name} · {p.commission_rate} % · Código {p.code}
                </CardTitle>
                <p className="text-sm text-slate-500">
                  {p.phone ?? "Sin teléfono"} ·{" "}
                  {p.active ? "Activo" : "Inactivo"}
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Citas completadas: <strong>{completed.length}</strong> de{" "}
                  {mine.length} totales
                </p>
                <p>
                  Ventas por completadas:{" "}
                  <strong>{money(totalCompleted)}</strong>
                </p>
                <p className="text-base">
                  Comisión a liquidar:{" "}
                  <strong className="text-green-700">
                    {money(commission)}
                  </strong>
                </p>
                {completed.length > 0 && (
                  <ul className="list-disc pl-5 text-slate-600">
                    {completed.map((a) => (
                      <li key={a.id}>
                        {contactName(data, a.contact_id)} ·{" "}
                        {serviceName(data, a.service_id)} ·{" "}
                        {a.start_time.slice(0, 10)} {fmtTime(a.start_time)} ·{" "}
                        {money(a.price)} →{" "}
                        {money((a.price * p.commission_rate) / 100)}
                      </li>
                    ))}
                  </ul>
                )}
                {mine.filter((a) => a.status === "conflict").length > 0 && (
                  <p className="text-red-700">
                    {mine.filter((a) => a.status === "conflict").length} cita(s)
                    en conflicto: $0 de comisión.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar promotor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del promotor"
              className="w-56"
              required
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono"
              className="w-44"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="% comisión"
              className="w-28"
            />
            <Button type="submit">Agregar</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            En el modo demo los promotores se guardan solo en este navegador.
            En Supabase, la tabla es <code>promoters</code> con{" "}
            <code>commission_rate</code> en porcentaje.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
