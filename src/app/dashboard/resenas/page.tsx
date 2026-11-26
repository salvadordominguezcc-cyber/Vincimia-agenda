// Panel de Reseñas — Dashboard → Reseñas.
// Métricas (promedio, total, conteo por estrellas), comentarios privados
// (marcar como leído), link público de calificación, QR para recepción
// y el campo para configurar el google_review_url de la organización.
// Datos: en modo demo viven en el almacén local; con Supabase, en las
// tablas feedback y review_requests (migración 007) y la columna
// google_review_url de organizations. Sin reseñas de ejemplo: todo
// arranca vacío. Si la migración 007 aún no está aplicada, se avisa y
// no se inventa ningún dato.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadStore, saveStore, type StoreData } from "@/lib/store";
import {
  REVIEW_STATUS_LABEL,
  reviewMetrics,
  reviewUrlFor,
  type FeedbackItem,
  type ReviewRequest,
} from "@/lib/reviews";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((v) => (
        <Star
          key={v}
          className={cn(
            size,
            v <= value ? "fill-yellow-400 text-yellow-400" : "fill-slate-200 text-slate-300"
          )}
        />
      ))}
    </span>
  );
}

interface CloudOrg {
  id: string;
  name: string;
  slug: string;
  google_review_url: string | null;
}

export default function ResenasPage() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [cloudOrg, setCloudOrg] = useState<CloudOrg | null>(null);
  const [cloudFeedback, setCloudFeedback] = useState<FeedbackItem[] | null>(null);
  const [cloudRequests, setCloudRequests] = useState<ReviewRequest[] | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [googleMsg, setGoogleMsg] = useState("");
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const cloud = supabaseConfigured();

  useEffect(() => {
    const d = loadStore();
    setStore(d);
    setGoogleUrl(d.org.google_review_url ?? "");
    if (!cloud) return;
    const loadCloud = async () => {
      const client = supabaseBrowser();
      if (!client) return;
      const { data: orgRows } = await client
        .from("organizations")
        .select("id, name, slug, google_review_url")
        .eq("id", d.org.id)
        .limit(1);
      const orgRow = (orgRows?.[0] as CloudOrg | undefined) ?? null;
      if (orgRow) {
        setCloudOrg(orgRow);
        setGoogleUrl(orgRow.google_review_url ?? "");
      }
      const { data: fb, error: fbError } = await client
        .from("feedback")
        .select("*")
        .eq("organization_id", d.org.id)
        .order("created_at", { ascending: false });
      if (fbError) {
        setCloudError(
          "No se pudieron leer las reseñas en la nube: probablemente falta aplicar la migración 007_reviews.sql en Supabase (ver REVIEWS.md)."
        );
        return;
      }
      setCloudFeedback((fb as FeedbackItem[]) ?? []);
      const { data: rr } = await client
        .from("review_requests")
        .select("*")
        .eq("organization_id", d.org.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setCloudRequests((rr as ReviewRequest[]) ?? []);
    };
    loadCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!store) return <p className="text-slate-500">Cargando…</p>;

  const org = cloudOrg ?? {
    id: store.org.id,
    name: store.org.name,
    slug: store.org.slug,
    google_review_url: store.org.google_review_url,
  };
  const feedback = cloudFeedback ?? store.feedback;
  const requests = cloudRequests ?? store.reviewRequests;
  const metrics = reviewMetrics(feedback);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const reviewUrl = reviewUrlFor(origin, org.slug);
  const shown = filterUnread ? feedback.filter((f) => !f.is_read) : feedback;

  const saveGoogleUrl = async () => {
    const url = googleUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setGoogleMsg("El link debe empezar con https://");
      return;
    }
    setSavingGoogle(true);
    setGoogleMsg("");
    const value = url || null;
    if (cloud) {
      const client = supabaseBrowser();
      if (!client) {
        setGoogleMsg("No hay conexión con Supabase.");
        setSavingGoogle(false);
        return;
      }
      const { error } = await client
        .from("organizations")
        .update({ google_review_url: value })
        .eq("id", org.id);
      if (error) {
        setGoogleMsg(`No se pudo guardar: ${error.message}`);
        setSavingGoogle(false);
        return;
      }
      setCloudOrg({ ...org, google_review_url: value });
    } else {
      const next: StoreData = {
        ...store,
        org: { ...store.org, google_review_url: value },
      };
      saveStore(next);
      setStore(next);
    }
    setGoogleMsg(
      value
        ? "Link de Google guardado. Las calificaciones de 4–5 estrellas ya llegan a Google Maps."
        : "Link quitado. Las calificaciones de 4–5 estrellas ya no redirigen a Google."
    );
    setSavingGoogle(false);
  };

  const markRead = async (id: string) => {
    if (cloud) {
      const client = supabaseBrowser();
      if (!client) return;
      const { error } = await client
        .from("feedback")
        .update({ is_read: true })
        .eq("id", id);
      if (error) return;
      setCloudFeedback((prev) =>
        (prev ?? []).map((f) => (f.id === id ? { ...f, is_read: true } : f))
      );
      return;
    }
    const next: StoreData = {
      ...store,
      feedback: store.feedback.map((f) =>
        f.id === id ? { ...f, is_read: true } : f
      ),
    };
    saveStore(next);
    setStore(next);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qr-resenas-${org.slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(
      `<html><head><title>QR Reseñas — ${org.name}</title></head>` +
        `<body style="text-align:center;font-family:sans-serif;padding:24px">` +
        `<h2>${org.name}</h2><p>¿Cómo calificarías tu experiencia hoy?</p>` +
        `${svg.outerHTML}<p style="font-size:12px;color:#555">${reviewUrl}</p>` +
        `</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reseñas</h1>
        <p className="text-sm text-slate-500">
          Al completar una cita, el paciente recibe por WhatsApp su link de
          calificación: 4–5 estrellas van a Google Maps, 1–3 quedan como
          comentario privado aquí. La solicitud se manda a todos los
          pacientes por igual.
        </p>
      </div>

      {cloudError && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">
            {cloudError}
          </CardContent>
        </Card>
      )}

      {!org.google_review_url && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">
            <strong>Sin link de Google configurado:</strong> las
            calificaciones de 4–5 estrellas se guardan, pero no pueden
            redirigir a Google Maps hasta que pegues abajo el link de tu
            ficha de Google Business.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Promedio</p>
            <p className="text-2xl font-bold">
              {metrics.average === null
                ? "—"
                : `${metrics.average.toFixed(1)} / 5`}
            </p>
            {metrics.average !== null && <Stars value={Math.round(metrics.average)} />}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Calificaciones</p>
            <p className="text-2xl font-bold">{metrics.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-slate-500">Comentarios sin leer</p>
            <p className="text-2xl font-bold">{metrics.unread}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por estrellas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[5, 4, 3, 2, 1].map((s) => (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-10 font-medium">{s} ★</span>
              <div className="h-3 flex-1 rounded bg-slate-100">
                <div
                  className="h-3 rounded bg-yellow-400"
                  style={{
                    width:
                      metrics.total > 0
                        ? `${(metrics.counts[s] / metrics.total) * 100}%`
                        : "0%",
                  }}
                />
              </div>
              <span className="w-8 text-right text-slate-600">
                {metrics.counts[s]}
              </span>
            </div>
          ))}
          {metrics.total === 0 && (
            <p className="text-sm text-slate-500">
              Aún no hay calificaciones. Cuando un paciente califique desde
              su link, aparecerá aquí.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Link público y QR para recepción</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-lg bg-brand-50 p-3 font-mono text-sm text-brand-700 break-all">
              {reviewUrl}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyLink}>{copied ? "¡Copiado!" : "Copiar link"}</Button>
              <Link href={`/resena/${org.slug}`}>
                <Button variant="outline">Abrir como cliente</Button>
              </Link>
            </div>
            <div className="flex items-start gap-4 pt-2">
              <div ref={qrRef} className="rounded-lg border border-slate-200 bg-white p-2">
                <QRCodeSVG value={reviewUrl} size={160} />
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  Imprímelo y ponlo en recepción: el paciente escanea y
                  califica sin cita.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={downloadQR}>
                    Descargar QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={printQR}>
                    Imprimir QR
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Link de reseñas de Google</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Es el link "Escribir reseña" de tu ficha de Google Business.
              Sin él, las calificaciones de 4–5 estrellas no llegan a Google
              Maps.
            </p>
            <label className="text-sm font-medium">Link de Google *</label>
            <Input
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/… o https://www.google.com/maps/…"
            />
            <p className="text-xs text-slate-500">
              Se consigue en Google Business Profile → tu ficha → Compartir
              → "Escribir reseña". Un link por clínica.
            </p>
            <Button onClick={saveGoogleUrl} disabled={savingGoogle}>
              {savingGoogle ? "Guardando…" : "Guardar link"}
            </Button>
            {googleMsg && (
              <p className="rounded-lg bg-slate-100 p-3 text-sm">{googleMsg}</p>
            )}
            <p className="text-xs text-slate-500">
              Estado de WhatsApp para el envío automático:{" "}
              {store.org.whatsapp_bot_enabled
                ? "bot activado"
                : "bot apagado (las solicitudes quedan en cola)"}
              . Se activa en Dashboard → Conectores.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            Comentarios privados
            <Button
              size="sm"
              variant={filterUnread ? "default" : "outline"}
              onClick={() => setFilterUnread((v) => !v)}
            >
              {filterUnread ? "Ver todos" : `Solo sin leer (${metrics.unread})`}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shown.length === 0 ? (
            <p className="text-sm text-slate-500">
              {metrics.total === 0
                ? "Aún no hay comentarios privados. Las calificaciones de 1–3 estrellas llegan aquí con el comentario del paciente."
                : "No hay comentarios sin leer."}
            </p>
          ) : (
            shown.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "rounded-lg border p-3",
                  f.is_read ? "border-slate-200" : "border-amber-300 bg-amber-50"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={f.rating} />
                  <span className="text-sm font-semibold">
                    {f.client_name || "Paciente sin nombre"}
                  </span>
                  {f.client_contact && (
                    <span className="text-xs text-slate-500">{f.client_contact}</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(f.created_at).toLocaleString("es-MX")}
                  </span>
                </div>
                {f.comment ? (
                  <p className="mt-2 text-sm">{f.comment}</p>
                ) : (
                  <p className="mt-2 text-sm italic text-slate-500">
                    Calificación de {f.rating} estrellas, sin comentario (se
                    fue a Google).
                  </p>
                )}
                {!f.is_read && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => markRead(f.id)}
                  >
                    Marcar como leído
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes de reseña (WhatsApp)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {requests.length === 0 ? (
            <p className="text-slate-500">
              Aún no se ha pedido ninguna reseña. Al marcar una cita como
              completada (check-in), se encola o se manda el WhatsApp con el
              link de calificación.
            </p>
          ) : (
            requests.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2"
              >
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    r.status === "sent" && "bg-green-100 text-green-800",
                    r.status === "queued" && "bg-amber-100 text-amber-800",
                    r.status === "failed" && "bg-red-100 text-red-800",
                    r.status === "no_phone" && "bg-slate-200 text-slate-600"
                  )}
                >
                  {REVIEW_STATUS_LABEL[r.status]}
                </span>
                <span className="font-mono text-xs">{r.phone ?? "sin teléfono"}</span>
                <span className="text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleString("es-MX")}
                </span>
                {r.error && (
                  <span className="text-xs text-red-700">{r.error}</span>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
