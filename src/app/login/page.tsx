// Login / registro / recuperación con Supabase Auth (correo + contraseña).
// Pública: es la puerta del panel. /dashboard redirige aquí sin sesión.
// La reserva pública (/reserva/[slug]) y la portada (/) no piden login.
//
// Flujo de correo (Supabase Auth, flujo implícito de supabase-js):
// - Registro: se envía enlace de confirmación a
//   NEXT_PUBLIC_SITE_URL/login?aviso=confirmado ; al abrirlo, supabase-js
//   detecta el token en el hash (#access_token) y crea la sesión sola.
// - Recuperación: el enlace apunta a /auth/reset, donde se pone la
//   contraseña nueva.
// Si en Supabase está apagada la confirmación de correo, el registro entra
// directo al panel. Ver AUTH_SETUP.md.

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ensureMembership, siteUrl } from "@/lib/auth";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase";
import { normalizeUsername, usernameValid } from "@/lib/username";

type Mode = "login" | "registro" | "recuperar";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const aviso = params.get("aviso") || "";

  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "registro"
      ? "registro"
      : params.get("mode") === "recuperar"
        ? "recuperar"
        : "login"
  );
  const [email, setEmail] = useState("");
  // En login, este campo es "Correo o nombre de usuario" (igual que el
  // POS): si no tiene @, se resuelve a su correo con /api/users?username=.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    aviso === "confirmado"
      ? "Correo confirmado. Ya puedes entrar con tu cuenta."
      : aviso === "restablecida"
        ? "Contraseña actualizada. Entra con la nueva contraseña."
        : ""
  );

  const configured = supabaseConfigured();

  // Si ya hay sesión (por ejemplo, al volver del enlace de confirmación
  // del correo), asegurar membresía piloto y entrar al panel.
  useEffect(() => {
    if (!configured) return;
    const client = supabaseBrowser();
    if (!client) return;
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await ensureMembership();
        router.replace(next);
      }
    });
  }, [configured, next, router]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-semibold">Modo demo — sin Supabase</p>
            <p className="mt-2 text-sm text-slate-500">
              El login necesita Supabase configurado (NEXT_PUBLIC_SUPABASE_URL
              y NEXT_PUBLIC_SUPABASE_ANON_KEY). Sin eso, el panel abre en
              modo demo, como hasta ahora.
            </p>
            <Link href="/dashboard" className="mt-5 inline-block">
              <Button>Entrar al panel demo</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const client = supabaseBrowser();
    if (!client) return;
    const cleanEmail = email.trim().toLowerCase();
    // La recuperación solo pide el correo: no hay campo de contraseña en
    // ese modo y exigirla bloqueaba el envío del enlace (bug reportado
    // 2026-11-18: "Escribe tu correo y tu contraseña." con solo el correo).
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (mode === "recuperar" && !emailValido) {
      setError("Escribe un correo válido.");
      return;
    }
    if (mode !== "recuperar" && !password) {
      setError("Escribe tu correo o usuario y tu contraseña.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        // Entrar con correo o con nombre de usuario, igual que el POS.
        // Si no tiene @, es un usuario: se resuelve a su correo con
        // GET /api/users?username= (la ruta responde el mismo error
        // genérico si no existe, sin revelar si existe).
        let loginEmail = cleanEmail;
        if (!cleanEmail.includes("@")) {
          const name = normalizeUsername(cleanEmail);
          if (!usernameValid(name)) {
            setError("Correo, nombre de usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.");
            return;
          }
          const res = await fetch(`/api/users?username=${encodeURIComponent(name)}`);
          if (!res.ok) {
            setError("Correo, nombre de usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (!data.email) {
            setError("Correo, nombre de usuario o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.");
            return;
          }
          loginEmail = String(data.email).toLowerCase();
        } else if (!emailValido) {
          setError("Escribe un correo válido o tu nombre de usuario.");
          return;
        }
        const { error: err } = await client.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        if (err) {
          setError(
            err.message === "Invalid login credentials"
              ? "Correo, nombre de usuario o contraseña incorrectos."
              : err.message
          );
          return;
        }
        await ensureMembership();
        router.replace(next);
      } else if (mode === "registro") {
        if (!emailValido) {
          setError("Escribe un correo válido.");
          return;
        }
        if (password.length < 6) {
          setError("La contraseña debe tener al menos 6 caracteres.");
          return;
        }
        const cleanUsername = normalizeUsername(username);
        if (cleanUsername && !usernameValid(cleanUsername)) {
          setError("El nombre de usuario debe tener al menos 3 caracteres y solo puede usar letras, números, guion bajo (_) y punto (.), sin espacios.");
          return;
        }
        const { data, error: err } = await client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${siteUrl()}/login?aviso=confirmado`,
            // Usuario opcional: queda como alias en user_metadata para
            // entrar después con usuario + contraseña, igual que el POS.
            data: cleanUsername ? { username: cleanUsername, role: "member" } : { role: "member" },
          },
        });
        if (err) {
          setError(err.message);
          return;
        }
        if (data.session) {
          await ensureMembership();
          router.replace(next);
          return;
        }
        setInfo(
          "Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación para entrar."
        );
      } else {
        const { error: err } = await client.auth.resetPasswordForEmail(
          cleanEmail,
          { redirectTo: `${siteUrl()}/auth/reset` }
        );
        if (err) {
          setError(err.message);
          return;
        }
        setInfo(
          "Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo (y el spam)."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "login"
      ? "Entrar a Vincimia Agenda"
      : mode === "registro"
        ? "Crear tu cuenta"
        : "Recuperar contraseña";

  return (
    <div className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-slate-500">
            {mode === "login" && "El panel es solo para usuarios con cuenta."}
            {mode === "registro" &&
              "Tu cuenta queda ligada a la agenda piloto (Clínica Dental Sonrisa)."}
            {mode === "recuperar" &&
              "Te enviamos un enlace a tu correo para poner una contraseña nueva."}
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {info && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {info}
            </p>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                {mode === "login" ? "Correo o nombre de usuario *" : "Correo *"}
              </label>
              <Input
                type={mode === "login" ? "text" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "login" ? "tu@correo.com o tu usuario, ej. recepcion1" : "tu@correo.com"}
                required
                autoComplete={mode === "login" ? "username" : "email"}
              />
            </div>
            {mode === "registro" && (
              <div>
                <label className="text-sm font-medium">Nombre de usuario (opcional)</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. recepcion1 — para entrar con usuario, sin correo"
                  autoComplete="username"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Si lo pones, podrás entrar con ese usuario y tu contraseña, igual que en el POS.
                </p>
              </div>
            )}
            {mode !== "recuperar" && (
              <div>
                <label className="text-sm font-medium">Contraseña *</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "registro" ? "Mínimo 6 caracteres" : "Tu contraseña"}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Espera…"
                : mode === "login"
                  ? "Entrar"
                  : mode === "registro"
                    ? "Crear cuenta"
                    : "Enviar enlace"}
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-center text-sm">
            {mode === "login" && (
              <>
                <p>
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    className="font-medium text-brand-700 underline"
                    onClick={() => setMode("registro")}
                  >
                    Crear una
                  </button>
                </p>
                <p>
                  <button
                    type="button"
                    className="font-medium text-brand-700 underline"
                    onClick={() => setMode("recuperar")}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </p>
              </>
            )}
            {mode !== "login" && (
              <p>
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  className="font-medium text-brand-700 underline"
                  onClick={() => setMode("login")}
                >
                  Entrar
                </button>
              </p>
            )}
            <p className="pt-2">
              <Link href="/" className="text-slate-500 underline">
                Volver a la portada
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Logo />
            Vincimia Agenda
          </Link>
        </div>
      </header>
      <main className="py-8">
        <Suspense fallback={<p className="p-6 text-center text-slate-500">Cargando…</p>}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
