// Contenido — creador de publicaciones para Facebook, Instagram y WhatsApp.
// Stack gratis: Gemini/Groq (textos), Gemini Nano Banana (fotos y Dr. Denti),
// Ideogram (carteles con texto), Leonardo (estilos), Pollinations (rápidas)
// y Canva (diseño final). Sin llaves, usa las plantillas locales de
// src/lib/content.ts y no inventa nada. Los borradores viven en
// localStorage en modo demo, igual que el resto del panel. La publicación
// automática a Meta es pendiente: hoy se guarda borrador/aprobado/
// programado y el usuario publica con el texto e imagen generados.
"use client";

import { useEffect, useState } from "react";
import {
  CONTENT_CHANNELS,
  CONTENT_PLAN_LIMITS,
  CONTENT_PROVIDERS,
  CONTENT_TOPICS,
  contentCanCreate,
  type ContentChannel,
  type ContentPost,
  type ContentStatus,
} from "@/lib/content";
import { Button } from "@/components/ui/button";

const KEY = "vincimia-contenido-v1";

function newId() {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadPosts(): ContentPost[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ContentPost[];
  } catch {
    return [];
  }
}

const STATUS_LABEL: Record<ContentStatus, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  programado: "Programado",
  publicado: "Publicado",
  pausado: "Pausado",
};

export default function ContenidoPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [topic, setTopic] = useState(CONTENT_TOPICS[0].topic);
  const [channels, setChannels] = useState<ContentChannel[]>(["facebook", "instagram"]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setPosts(loadPosts()), []);

  const save = (next: ContentPost[]) => {
    setPosts(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const usedThisMonth = posts.filter((p) => {
    const d = new Date(p.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const limit = CONTENT_PLAN_LIMITS.basico;

  const createFromTemplate = () => {
    if (!contentCanCreate("basico", usedThisMonth)) {
      alert("Ya usaste tus 8 publicaciones de este mes en el plan Básico. El plan Pro es ilimitado.");
      return;
    }
    const t = CONTENT_TOPICS.find((x) => x.topic === topic) ?? CONTENT_TOPICS[0];
    const caption = t.captions[Math.floor(Math.random() * t.captions.length)];
    const post: ContentPost = {
      id: newId(),
      topic: t.topic,
      title: t.title,
      caption,
      imagePrompt: t.imagePrompt,
      channels,
      status: "borrador",
      scheduledAt: null,
      createdAt: new Date().toISOString(),
    };
    save([post, ...posts]);
  };

  const setStatus = (id: string, status: ContentStatus) =>
    save(posts.map((p) => (p.id === id ? { ...p, status } : p)));

  const remove = (id: string) => save(posts.filter((p) => p.id !== id));

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contenido</h1>
        <p className="text-slate-600">
          Crea publicaciones para Facebook, Instagram y WhatsApp. Elige un tema,
          genera el texto y guárdalo como borrador. Cuando lo apruebes, lo
          publicas con su imagen en Canva o con la API de Meta.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Plan Básico: {usedThisMonth} de {limit} publicaciones este mes. Pro: ilimitado.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Crear publicación</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CONTENT_TOPICS.map((t) => (
            <button
              key={t.topic}
              onClick={() => setTopic(t.topic)}
              className={`rounded-full px-3 py-1 text-sm ${topic === t.topic ? "bg-brand-600 text-white" : "bg-slate-100"}`}
            >
              {t.title}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {CONTENT_CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={channels.includes(c.id)}
                onChange={(e) =>
                  setChannels(
                    e.target.checked
                      ? [...channels, c.id]
                      : channels.filter((x) => x !== c.id)
                  )
                }
              />
              {c.label}
            </label>
          ))}
        </div>
        <Button className="mt-4" onClick={createFromTemplate}>
          Generar texto
        </Button>
        <p className="mt-2 text-xs text-slate-500">
          Sin llaves de Gemini/Groq, el texto sale de las plantillas locales.
          La imagen se genera con Gemini Nano Banana, Ideogram o Leonardo,
          y el diseño final se arma en Canva.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Stack de contenido (gratis para empezar)</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {CONTENT_PROVIDERS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.use}. Gratis: {p.free}
              {p.paid !== "$0" ? ` · Pago: ${p.paid}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Leonardo solo no basta: no escribe bien el texto en la imagen ni
          mantiene igual a Dr. Denti. Por eso se combina con Gemini e Ideogram.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Tus publicaciones ({posts.length})</h2>
        {posts.length === 0 && (
          <p className="text-sm text-slate-500">
            Todavía no hay publicaciones. Elige un tema arriba y genera la primera.
          </p>
        )}
        {posts.map((p) => (
          <div key={p.id} className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{p.title}</strong>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{STATUS_LABEL[p.status]}</span>
              <span className="text-xs text-slate-500">{p.channels.join(", ")}</span>
            </div>
            <p className="mt-2 text-sm">{p.caption}</p>
            <p className="mt-1 text-xs text-slate-500">Imagen: {p.imagePrompt}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(p.id, p.caption)}>
                {copied === p.id ? "Copiado" : "Copiar texto"}
              </Button>
              {p.status === "borrador" && (
                <Button size="sm" onClick={() => setStatus(p.id, "aprobado")}>Aprobar</Button>
              )}
              {p.status === "aprobado" && (
                <Button size="sm" onClick={() => setStatus(p.id, "programado")}>Programar</Button>
              )}
              {p.status === "programado" && (
                <Button size="sm" onClick={() => setStatus(p.id, "publicado")}>Marcar publicado</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => remove(p.id)}>Borrar</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
