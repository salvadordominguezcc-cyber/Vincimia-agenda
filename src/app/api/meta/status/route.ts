// Estado real de Messenger e Instagram — Vincimia Agenda.
// GET /api/meta/status
// Nunca devuelve llaves ni tokens: solo dice si cada canal está
// configurado en el servidor y la URL de su webhook. La página
// Conectores y la bandeja lo usan para decir Pendiente y por qué,
// sin simular nada como conectado.

export const runtime = "edge";

import { metaStatus } from "@/lib/meta-channels";

export async function GET(req: Request) {
  const origin =
    typeof req.url === "string" && req.url.startsWith("http")
      ? new URL(req.url).origin
      : "";
  const status = metaStatus();
  return Response.json({
    messenger: {
      ...status.facebook,
      status: status.facebook.configured ? "configured" : "pending",
      webhook_url: `${origin}/api/webhook/messenger`,
    },
    instagram: {
      ...status.instagram,
      status: status.instagram.configured ? "configured" : "pending",
      webhook_url: `${origin}/api/webhook/instagram`,
    },
  });
}
