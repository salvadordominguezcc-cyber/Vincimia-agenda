// Página pública de calificación — /resena/[slug].
// Sigue el patrón de /reserva/[slug]: pública, sin login, lee solo los
// datos públicos de la organización (nombre, slug, link de Google) y
// guarda la calificación en feedback.
// Embudo (PDF del plan de reseñas, fig. 1):
//   · 4–5 estrellas → se guarda solo la calificación y se redirige al
//     link de Google Maps de la clínica.
//   · 1–3 estrellas → formulario privado (nombre y WhatsApp opcionales,
//     comentario obligatorio) que se guarda en feedback.
// POLÍTICA DE GOOGLE (prohíbe el review gating): el formulario privado
// SIEMPRE incluye el enlace discreto "O publicar opinión directamente
// en Google". La solicitud se manda a todos los pacientes por igual.
// Sin link de Google configurado, las 4–5 estrellas no pueden
// redirigir: se muestra el agradecimiento y se avisa con honestidad.

"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { Sparkles, Star } from "lucide-react";
import { loadStore, saveStore } from "@/lib/store";
import { newFeedbackId, type FeedbackItem } from "@/lib/reviews";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface PublicOrg {
  id: string;
  name: string;
  slug: string;
  google_review_url: string | null;
}

type Step = "rate" | "redirect" | "form" | "thanks" | "thanks-nolink";

export default function ResenaPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { cita?: string };
}) {
  const [org, setOrg] = useState<PublicOrg | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const appointmentId =
    typeof searchParams?.cita === "string" ? searchParams.cita : null;

  useEffect(() => {
    const load = async () => {
      if (supabaseConfigured()) {
        const client = supabaseBrowser();
        if (!client) {
          setLoadError("No se pudo cargar la clínica.");
          return;
        }
        // Solo campos públicos (ver migración 007: get_public_org).
        const { data, error } = await client.rpc("get_public_org", {
          p_slug: params.slug,
        });
        if (error) {
          setLoadError(
            "Este link aún no está activo: falta aplicar la migración de reseñas en la nube."
          );
          return;
        }
        const row = Array.isArray(data) ? (data[0] as PublicOrg | undefined) : undefined;
        if (!row) {
          setNotFound(true);
          return;
        }
        setOrg(row);
        return;
      }
      // Modo demo: la organización vive en el almacén local.
      const d = loadStore();
      if (d.org.slug !== params.slug) {
        setNotFound(true);
        return;
      }
      setOrg({
        id: d.org.id,
        name: d.org.name,
        slug: d.org.slug,
        google_review_url: d.org.google_review_url,
      });
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFeedback = async (item: {
    rating: number;
    client_name: string | null;
    client_contact: string | null;
    comment: string | null;
  }): Promise<boolean> => {
    if (!org) return false;
    if (supabaseConfigured()) {
      const client = supabaseBrowser();
      if (!client) return false;
      const { error } = await client.from("feedback").insert({
        organization_id: org.id,
        appointment_id: appointmentId,
        rating: item.rating,
        client_name: item.client_name,
        client_contact: item.client_contact,
        comment: item.comment,
        is_read: false,
      });
      if (error) {
        setError(`No se pudo guardar: ${error.message}`);
        return false;
      }
      return true;
    }
    const d = loadStore();
    const row: FeedbackItem = {
      id: newFeedbackId(),
      organization_id: org.id,
      appointment_id: appointmentId,
      rating: item.rating,
      client_name: item.client_name,
      client_contact: item.client_contact,
      comment: item.comment,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    saveStore({ ...d, feedback: [row, ...d.feedback] });
    return true;
  };

  const pickStars = async (value: number) => {
    setRating(value);
    setError("");
    if (value >= 4) {
      // Se guarda solo la calificación (para las métricas del panel);
      // el comentario lo escribe el paciente en Google.
      await saveFeedback({
        rating: value,
        client_name: null,
        client_contact: null,
        comment: null,
      });
      if (org?.google_review_url) {
        setStep("redirect");
        window.setTimeout(() => {
          window.location.href = org.google_review_url as string;
        }, 1200);
      } else {
        setStep("thanks-nolink");
      }
      return;
    }
    setStep("form");
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!comment.trim()) {
      setError("Cuéntanos qué podemos mejorar, por favor.");
      return;
    }
    setSending(true);
    const ok = await saveFeedback({
      rating,
      client_name: name.trim() || null,
      client_contact: contact.trim() || null,
      comment: comment.trim(),
    });
    setSending(false);
    if (ok) setStep("thanks");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-4">
          <Logo />
          <div>
            <p className="font-bold leading-tight">Vincimia Agenda</p>
            <p className="text-xs text-slate-500">Califica tu visita</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8">
        {loadError ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-semibold">Link no disponible</p>
              <p className="mt-1 text-sm text-slate-500">{loadError}</p>
            </CardContent>
          </Card>
        ) : notFound ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-semibold">Negocio no encontrado</p>
              <p className="mt-1 text-sm text-slate-500">
                El link <code>/resena/{params.slug}</code> no corresponde a
                ningún negocio.
              </p>
            </CardContent>
          </Card>
        ) : !org ? (
          <p className="p-6 text-center text-slate-500">Cargando…</p>
        ) : step === "redirect" ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-yellow-500" />
              <h1 className="mt-3 text-xl font-bold">¡Nos alegra mucho!</h1>
              <p className="mt-2 text-slate-600">
                Redirigiendo a Google Maps para compartir tu reseña…
              </p>
              <p className="mt-4 text-sm text-slate-500">
                Si no te redirige solo,{" "}
                <a
                  href={org.google_review_url ?? undefined}
                  className="font-medium text-brand-700 underline"
                >
                  toca aquí para ir a Google Maps
                </a>
                .
              </p>
            </CardContent>
          </Card>
        ) : step === "thanks-nolink" ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-yellow-500" />
              <h1 className="mt-3 text-xl font-bold">
                ¡Gracias por tus {rating} estrellas!
              </h1>
              <p className="mt-2 text-slate-600">
                Tu calificación quedó registrada. La clínica aún no tiene
                configurado su link de Google, así que por ahora no podemos
                llevarte a dejar la reseña pública.
              </p>
            </CardContent>
          </Card>
        ) : step === "thanks" ? (
          <Card>
            <CardContent className="py-10 text-center">
              <h1 className="text-xl font-bold">
                ¡Gracias por tus comentarios!
              </h1>
              <p className="mt-2 text-slate-600">
                La clínica los revisará de inmediato.
              </p>
              {org.google_review_url && (
                <p className="mt-4 text-sm">
                  <a
                    href={org.google_review_url}
                    className="text-slate-400 underline"
                  >
                    O publicar opinión directamente en Google
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        ) : step === "form" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                Lamentamos que no todo fuera perfecto
              </CardTitle>
              <p className="text-center text-sm text-slate-500">
                Cuéntanos qué sucedió para poder mejorar nuestra atención.
              </p>
            </CardHeader>
            <CardContent>
              {error && (
                <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </p>
              )}
              <form onSubmit={submitForm} className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Tu nombre (opcional)</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Teléfono o WhatsApp (opcional)
                  </label>
                  <Input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Teléfono o WhatsApp"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    ¿Cómo podemos mejorar? *
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    required
                    placeholder="¿Cómo podemos mejorar?"
                    className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? "Enviando…" : "Enviar comentarios"}
                </Button>
                {org.google_review_url && (
                  <a
                    href={org.google_review_url}
                    className="block pt-1 text-center text-xs text-slate-400 underline"
                  >
                    O publicar opinión directamente en Google
                  </a>
                )}
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-xl font-bold">{org.name}</p>
              <p className="mt-2 text-slate-600">
                Gracias por tu visita. ¿Cómo calificarías tu experiencia hoy?
              </p>
              <div className="mt-6 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`${v} estrellas`}
                    onClick={() => pickStars(v)}
                    onMouseEnter={() => setHover(v)}
                    onMouseLeave={() => setHover(0)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "h-10 w-10",
                        (hover || rating) >= v
                          ? "fill-yellow-400 text-yellow-400"
                          : "fill-slate-200 text-slate-300"
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Tu calificación ayuda a la clínica a mejorar. Si tu
                experiencia no fue buena, tus comentarios llegan solo a la
                clínica, en privado.
              </p>
            </CardContent>
          </Card>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">
          Calificación de Vincimia Agenda
        </p>
      </main>
    </div>
  );
}
