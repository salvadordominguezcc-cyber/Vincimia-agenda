// Restablecer contraseña — destino del enlace de recuperación de Supabase.
// El enlace del correo llega aquí con #access_token=...&type=recovery ;
// supabase-js lo detecta solo al cargar y crea la sesión de recuperación,
// así que esta página solo pide la contraseña nueva y la guarda con
// auth.updateUser(). Si el enlace caducó o ya se usó, no hay sesión y se
// le dice al usuario que pida otro enlace en /login.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureMembership } from "@/lib/auth";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  // true cuando Supabase devolvió el enlace con error en el hash, por
  // ejemplo #error=access_denied&error_code=otp_expired
  // ("Email link is invalid or has expired"): el enlace ya venció o ya se
  // usó. Se muestra un mensaje claro en español, no el texto crudo en inglés.
  const [linkExpired, setLinkExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Leer el error del hash ANTES de pedir la sesión: con un enlace
    // vencido supabase-js no crea sesión y el hash es la única señal.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error") || hash.get("error_code") === "otp_expired") {
      setLinkExpired(true);
      setReady(true);
      return;
    }
    if (!supabaseConfigured()) {
      setReady(true);
      return;
    }
    const client = supabaseBrowser();
    if (!client) {
      setReady(true);
      return;
    }
    // supabase-js detecta el token del hash (#access_token&type=recovery)
    // y crea la sesión antes de que getSession responda.
    client.auth.getSession().then(({ data: { session } }) => {
      setHasSession(Boolean(session));
      setReady(true);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    const client = supabaseBrowser();
    if (!client) return;
    setBusy(true);
    const { error: err } = await client.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await ensureMembership();
    router.replace("/login?aviso=restablecida");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              V
            </span>
            Vincimia Agenda
          </Link>
        </div>
      </header>
      <main className="py-8">
        <div className="mx-auto max-w-md p-6">
          <Card>
            <CardHeader>
              <CardTitle>Pon tu contraseña nueva</CardTitle>
            </CardHeader>
            <CardContent>
              {!ready ? (
                <p className="text-sm text-slate-500">Verificando el enlace…</p>
              ) : !hasSession ? (
                <>
                  <p className="text-sm text-slate-600">
                    {linkExpired
                      ? "Este enlace ya venció o ya se usó, pide uno nuevo."
                      : "Este enlace no es válido o ya caducó. Pide uno nuevo desde el login."}
                  </p>
                  <Link href="/login?mode=recuperar" className="mt-4 inline-block">
                    <Button>Pedir otro enlace</Button>
                  </Link>
                </>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  {error && (
                    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      {error}
                    </p>
                  )}
                  <div>
                    <label className="text-sm font-medium">
                      Contraseña nueva *
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Guardando…" : "Guardar contraseña"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
