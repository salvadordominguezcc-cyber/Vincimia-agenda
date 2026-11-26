// Bandeja de equipo — WhatsApp, Messenger e Instagram en un solo lugar.
// Costo $0: Next.js + Supabase + API de Meta (Fase 2), sin suscripciones.
// Las conversaciones de ejemplo son los contactos demo de la agenda
// (Laura Méndez, Luis Soto, Sofía Castro, Mariana Torres, Roberto Gómez).
// Los datos viven en localStorage en modo demo, igual que el resto del
// panel. La respuesta que se escribe aquí se puede ENVIAR por el canal
// de la conversación (ruta /api/inbox/send) cuando ese canal está
// conectado en el servidor; si no lo está, se guarda como borrador
// local y la página dice por qué no se envió. Nada se finge como
// enviado. Los canales Messenger e Instagram usan los webhooks
// /api/webhook/messenger y /api/webhook/instagram (migración 009,
// sin aplicar todavía).
"use client";

import { useEffect, useState } from "react";
import {
  exampleConversations,
  type Conversation,
  type ConversationStatus,
  type InboxChannel,
} from "@/lib/inbox";
import { sendWindowNote } from "@/lib/messages";
import { loadStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

const KEY = "vincimia-bandeja-v1";
const ORG_ID = "11111111-1111-1111-1111-111111111111";

function load(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Conversation[];
  } catch {
    // Se siembran los ejemplos.
  }
  return exampleConversations(ORG_ID);
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  abierta: "Abierta",
  asignada: "Asignada",
  resuelta: "Resuelta",
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  facebook: "Messenger",
  instagram: "Instagram",
};

interface ChannelStatus {
  configured: boolean;
  message: string;
  webhook_url?: string;
}

const CHANNEL_PENDING: Record<InboxChannel, string> = {
  whatsapp:
    "WhatsApp: pendiente — ver estado en Conectores (Fase 2).",
  facebook:
    "Messenger: pendiente — falta META_PAGE_ACCESS_TOKEN y META_VERIFY_TOKEN en Cloudflare.",
  instagram:
    "Instagram: pendiente — falta META_INSTAGRAM_TOKEN y META_VERIFY_TOKEN en Cloudflare.",
};

export default function BandejaPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<"todas" | ConversationStatus>("todas");
  const [channelFilter, setChannelFilter] = useState<"todas" | InboxChannel>("todas");
  const [meta, setMeta] = useState<{
    messenger: ChannelStatus;
    instagram: ChannelStatus;
  } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendResult, setSendResult] = useState("");

  useEffect(() => {
    const list = load();
    setConvs(list);
    setSelectedId(list[0]?.id ?? null);
    // Estado real de Messenger e Instagram (sin tokens, dice Pendiente).
    fetch("/api/meta/status")
      .then((r) => r.json())
      .then((j) => setMeta(j as { messenger: ChannelStatus; instagram: ChannelStatus }))
      .catch(() => undefined);
  }, []);

  const save = (next: Conversation[]) => {
    setConvs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const selected = convs.find((c) => c.id === selectedId) ?? null;
  const visible = convs.filter(
    (c) =>
      (filter === "todas" || c.status === filter) &&
      (channelFilter === "todas" || c.channel === channelFilter)
  );
  const openCount = convs.filter((c) => c.status !== "resuelta").length;

  /** Destinatario real del canal: teléfono en WhatsApp, id de Meta
   *  (PSID/IGSID) en Messenger e Instagram. Sin él no se puede enviar. */
  const recipientOf = (c: Conversation): string | null =>
    c.channel === "whatsapp" ? c.contactPhone : (c.metaSenderId ?? null);

  const channelConfigured = (channel: InboxChannel): boolean => {
    if (channel === "facebook") return meta?.messenger.configured ?? false;
    if (channel === "instagram") return meta?.instagram.configured ?? false;
    // WhatsApp: la bandeja no sabe si está conectado sin Supabase;
    // /api/inbox/send lo dice al intentar. Se intenta igual.
    return true;
  };

  const assign = (name: string, role: "recepcionista" | "admin") => {
    if (!selected) return;
    save(convs.map((c) =>
      c.id === selected.id
        ? { ...c, status: "asignada" as const, assignedTo: name, assignedRole: role }
        : c
    ));
  };

  const resolve = () => {
    if (!selected) return;
    save(convs.map((c) =>
      c.id === selected.id ? { ...c, status: "resuelta" as const } : c
    ));
  };

  const reopen = () => {
    if (!selected) return;
    save(convs.map((c) =>
      c.id === selected.id ? { ...c, status: "abierta" as const, assignedTo: null, assignedRole: null } : c
    ));
  };

  const saveDraft = (sent = false) => {
    if (!selected || !draft.trim()) return;
    const message = {
      id: `m-${Date.now()}`,
      conversationId: selected.id,
      from: "equipo" as const,
      text: draft.trim(),
      createdAt: new Date().toISOString(),
      // draft: true = solo borrador local, todavía NO se envió.
      draft: !sent,
    };
    save(convs.map((c) =>
      c.id === selected.id
        ? { ...c, messages: [...c.messages, message], lastMessage: draft.trim(), updatedAt: new Date().toISOString() }
        : c
    ));
    setDraft("");
  };

  /** Envía la respuesta por el canal de la conversación. Si el canal
   *  no está conectado o no hay destinatario, NO se finge el envío:
   *  se guarda como borrador y se dice por qué. */
  const sendReply = async () => {
    if (!selected || !draft.trim() || sendBusy) return;
    const recipient = recipientOf(selected);
    if (!recipient) {
      setSendResult(
        `No se puede enviar por ${CHANNEL_LABEL[selected.channel]}: esta conversación no tiene destinatario guardado (teléfono o id de Meta). Se guardó como borrador.`
      );
      saveDraft();
      return;
    }
    if (!channelConfigured(selected.channel)) {
      setSendResult(
        `${CHANNEL_PENDING[selected.channel]} Se guardó como borrador.`
      );
      saveDraft();
      return;
    }
    setSendBusy(true);
    setSendResult("");
    try {
      const store = loadStore();
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${store.org.excel_webhook_secret}`,
        },
        body: JSON.stringify({
          organization_id: store.org.id,
          channel: selected.channel,
          recipient,
          text: draft.trim(),
          conversation_id: selected.id.startsWith("conv-") ? undefined : selected.id,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (json.ok) {
        saveDraft(true);
        setSendResult(json.message ?? "Mensaje enviado.");
      } else {
        setSendResult(
          `No se envió: ${json.message ?? "error desconocido"} Se guardó como borrador.`
        );
        saveDraft();
      }
    } catch (e) {
      setSendResult(`No se envió: ${String(e)} Se guardó como borrador.`);
      saveDraft();
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bandeja de equipo</h1>
        <p className="text-slate-600">
          WhatsApp, Messenger e Instagram en un solo lugar. Asigna cada
          conversación a quien esté de turno y márcala resuelta cuando se
          atienda. {openCount} sin resolver.
        </p>
        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Las respuestas se envían por el canal de cada conversación solo
          cuando ese canal está conectado en el servidor; si no lo está,
          se guardan como borrador y la página dice por qué. Nada se
          finge como enviado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["todas", "abierta", "asignada", "resuelta"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f ? "bg-brand-600 text-white" : "bg-slate-100"}`}
          >
            {f === "todas" ? "Todas" : STATUS_LABEL[f]}
          </button>
        ))}
        <span className="mx-1 self-center text-slate-300">|</span>
        {(["todas", "whatsapp", "facebook", "instagram"] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setChannelFilter(ch)}
            className={`rounded-full px-3 py-1 text-sm ${channelFilter === ch ? "bg-teal-600 text-white" : "bg-slate-100"}`}
          >
            {ch === "todas" ? "Todos los canales" : CHANNEL_LABEL[ch]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="text-sm text-slate-500">No hay conversaciones en este filtro.</p>
          )}
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full rounded-xl border bg-white p-3 text-left ${selectedId === c.id ? "border-brand-500 ring-1 ring-brand-500" : ""}`}
            >
              <div className="flex items-center gap-2">
                <strong>{c.contactName}</strong>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{CHANNEL_LABEL[c.channel]}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{STATUS_LABEL[c.status]}</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-600">{c.lastMessage}</p>
              <p className="text-xs text-slate-500">
                {c.assignedTo ? `Asignada a ${c.assignedTo} (${c.assignedRole})` : "Sin asignar"}
                {c.contactPhone ? ` · ${c.contactPhone}` : ""}
              </p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{selected.contactName}</h2>
              <span className="text-sm text-slate-500">
                {CHANNEL_LABEL[selected.channel]} · {STATUS_LABEL[selected.status]}
              </span>
              {selected.assignedTo && (
                <span className="text-sm text-slate-500">
                  · {selected.assignedTo} ({selected.assignedRole})
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.from === "paciente"
                      ? "bg-slate-100"
                      : m.from === "bot"
                        ? "ml-auto bg-teal-50 text-teal-900"
                        : "ml-auto bg-brand-50 text-brand-900"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">
                    {m.from === "paciente" ? selected.contactName : m.from === "bot" ? "Bot" : "Equipo"}
                    {m.draft ? " · borrador, no enviado" : ""}
                  </p>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => assign("Recepción", "recepcionista")}>
                Asignar a Recepción
              </Button>
              <Button size="sm" variant="outline" onClick={() => assign("Admin", "admin")}>
                Asignar a Admin
              </Button>
              {selected.status !== "resuelta" ? (
                <Button size="sm" onClick={resolve}>Marcar resuelta</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={reopen}>Reabrir</Button>
              )}
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium" htmlFor="respuesta">Escribir respuesta</label>
              <textarea
                id="respuesta"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Escribe la respuesta al paciente…"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={sendReply} disabled={!draft.trim() || sendBusy}>
                  {sendBusy ? "Enviando…" : `Enviar por ${CHANNEL_LABEL[selected.channel]}`}
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveDraft()} disabled={!draft.trim()}>
                  Guardar borrador
                </Button>
              </div>
              {sendResult && (
                <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-700">{sendResult}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {sendWindowNote(selected.channel)} Guardar borrador no envía
                nada: solo deja el texto listo en la conversación.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Canales</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          <li>
            <strong>WhatsApp</strong> —{" "}
            {CHANNEL_PENDING.whatsapp}{" "}
            <span className="text-slate-500">Webhook: /api/webhook/whatsapp</span>
          </li>
          <li>
            <strong>Messenger</strong> —{" "}
            {meta
              ? meta.messenger.configured
                ? "Configurado en el servidor. Falta autorizar la página en Meta y verificar el webhook."
                : meta.messenger.message
              : "Cargando estado…"}{" "}
            <span className="text-slate-500">
              Webhook: <code className="rounded bg-slate-100 px-1">/api/webhook/messenger</code>
            </span>
          </li>
          <li>
            <strong>Instagram</strong> —{" "}
            {meta
              ? meta.instagram.configured
                ? "Configurado en el servidor. Falta autorizar la cuenta en Meta y verificar el webhook."
                : meta.instagram.message
              : "Cargando estado…"}{" "}
            <span className="text-slate-500">
              Webhook: <code className="rounded bg-slate-100 px-1">/api/webhook/instagram</code>
            </span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Los mensajes de Messenger e Instagram llegan a esta bandeja
          cuando su webhook está verificado en Meta y la página/cuenta
          está registrada para el negocio (migración 009). Sin eso, la
          bandeja muestra los ejemplos y nada se finge como conectado.
        </p>
      </div>
    </div>
  );
}
