// Editor visual de flujos — cajitas propias con divs, sin React Flow
// ni paquetes nuevos, costo $0. Agrega nodos por tipo, edita su texto,
// conecta el nodo siguiente con un selector y borra nodos. Se guarda
// en localStorage en modo demo, igual que el resto del panel.
// Flujo de ejemplo: paciente escribe → pregunta servicio → propone
// horarios → confirma → recordatorio. La ejecución real del flujo
// (que el bot responda solo por WhatsApp) es pendiente: necesita
// correr los nodos en /api/webhook/whatsapp (ver INBOX_FLOWS.md).
"use client";

import { useEffect, useState } from "react";
import {
  FLOW_NODE_TYPES,
  NODE_COLORS,
  exampleFlow,
  newNodeId,
  type Flow,
  type FlowNode,
  type FlowNodeType,
} from "@/lib/inbox";
import { Button } from "@/components/ui/button";

const KEY = "vincimia-flujos-v1";
const ORG_ID = "11111111-1111-1111-1111-111111111111";

function load(): Flow {
  if (typeof window === "undefined") return exampleFlow(ORG_ID);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Flow;
  } catch {
    // Se siembra el ejemplo.
  }
  return exampleFlow(ORG_ID);
}

export default function FlujosPage() {
  const [flow, setFlow] = useState<Flow>(() => exampleFlow(ORG_ID));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const f = load();
    setFlow(f);
    setSelectedId(f.nodes[0]?.id ?? null);
  }, []);

  const save = (next: Flow) => {
    setFlow(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const selected = flow.nodes.find((n) => n.id === selectedId) ?? null;

  const addNode = (type: FlowNodeType) => {
    const label = FLOW_NODE_TYPES.find((t) => t.id === type)?.label ?? type;
    const node: FlowNode = {
      id: newNodeId(),
      type,
      title: `${label} nuevo`,
      text: "",
      nextId: null,
      x: 20,
      y: 20 + flow.nodes.length * 40,
    };
    // Si el último nodo no tenía siguiente, conéctalo al nuevo.
    const nodes = [...flow.nodes];
    const last = nodes[nodes.length - 1];
    if (last && !last.nextId) last.nextId = node.id;
    save({ ...flow, nodes: [...nodes, node], updatedAt: new Date().toISOString() });
    setSelectedId(node.id);
  };

  const updateSelected = (patch: Partial<FlowNode>) => {
    if (!selected) return;
    save({
      ...flow,
      nodes: flow.nodes.map((n) => (n.id === selected.id ? { ...n, ...patch } : n)),
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteSelected = () => {
    if (!selected) return;
    const nodes = flow.nodes
      .filter((n) => n.id !== selected.id)
      .map((n) => (n.nextId === selected.id ? { ...n, nextId: null } : n));
    save({ ...flow, nodes, updatedAt: new Date().toISOString() });
    setSelectedId(nodes[0]?.id ?? null);
  };

  const resetExample = () => {
    const f = exampleFlow(ORG_ID);
    save(f);
    setSelectedId(f.nodes[0]?.id ?? null);
  };

  const nextLabel = (node: FlowNode) => {
    if (!node.nextId) return "Fin del flujo";
    const next = flow.nodes.find((n) => n.id === node.nextId);
    return next ? `→ ${next.title}` : "→ (nodo borrado)";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Flujos</h1>
        <p className="text-slate-600">
          Arma el bot con cajitas, sin código: agrega un nodo, escribe lo
          que dice y elige a qué cajita sigue. El flujo se guarda en este
          aparato y se puede activar por negocio.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Flujo: <strong>{flow.name}</strong> · {flow.active ? "Activo" : "Pausado"} ·{" "}
          {flow.nodes.length} cajitas
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Agregar cajita</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FLOW_NODE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => addNode(t.id)}
              title={t.hint}
              className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-brand-50"
            >
              + {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Mensaje manda un texto · Pregunta espera respuesta · Condición
          sigue por un camino u otro · Agendar propone horarios libres ·
          Confirmar confirma la cita · Transferir pasa a una persona.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => save({ ...flow, active: !flow.active })}
          >
            {flow.active ? "Pausar flujo" : "Activar flujo"}
          </Button>
          <Button size="sm" variant="outline" onClick={resetExample}>
            Volver al ejemplo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <h2 className="font-semibold">Tus cajitas, en orden</h2>
          {flow.nodes.length === 0 && (
            <p className="text-sm text-slate-500">No hay cajitas. Agrega la primera arriba.</p>
          )}
          {flow.nodes.map((node, i) => (
            <div key={node.id}>
              <button
                onClick={() => setSelectedId(node.id)}
                className={`w-full rounded-xl border-2 bg-white p-4 text-left ${NODE_COLORS[node.type]} ${selectedId === node.id ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium">{i + 1}</span>
                  <strong>{node.title}</strong>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs">
                    {FLOW_NODE_TYPES.find((t) => t.id === node.type)?.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{node.text || "(sin texto todavía)"}</p>
                <p className="mt-1 text-xs text-slate-500">{nextLabel(node)}</p>
              </button>
              {i < flow.nodes.length - 1 && (
                <div className="py-1 text-center text-slate-400" aria-hidden>↓</div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Editar cajita</h2>
          {!selected ? (
            <p className="mt-2 text-sm text-slate-500">Elige una cajita para editarla.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm font-medium" htmlFor="titulo">Título</label>
                <input
                  id="titulo"
                  value={selected.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="texto">Texto que dice el bot</label>
                <textarea
                  id="texto"
                  value={selected.text}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  rows={4}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="siguiente">Siguiente cajita</label>
                <select
                  id="siguiente"
                  value={selected.nextId ?? ""}
                  onChange={(e) => updateSelected({ nextId: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Fin del flujo</option>
                  {flow.nodes
                    .filter((n) => n.id !== selected.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))}
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={deleteSelected}>
                Borrar esta cajita
              </Button>
              <p className="text-xs text-slate-500">
                Al borrar una cajita, las que apuntaban a ella quedan en
                &ldquo;Fin del flujo&rdquo;. Vuelve a conectarlas con el selector.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
