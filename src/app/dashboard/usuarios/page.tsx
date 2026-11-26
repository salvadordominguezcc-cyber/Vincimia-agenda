// Usuarios — crear accesos para entrar con correo y usuario, igual que
// en el POS de EL RODEO. Solo el admin (Salvador) puede gestionar
// usuarios: la ruta /api/users lo verifica en el servidor.
// - Crear: correo o usuario (al menos uno), contraseña, rol.
//   Sin correo real se crea `<usuario>@vincimia.local` y esa persona
//   entra solo con su usuario y contraseña.
// - Cambiar: nombre de usuario, rol, activar/desactivar y restablecer
//   contraseña. No se puede cambiar la propia cuenta ni la del admin
//   principal (salvo el nombre de usuario, que es solo un alias).
"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AppUser = {
  id: string;
  email: string | null;
  username: string | null;
  internal_email: boolean;
  role: "owner" | "admin" | "member";
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

async function usersApi(method: string, body?: unknown) {
  const client = supabaseBrowser();
  const { data: { session } } = await client!.auth.getSession();
  const res = await fetch("/api/users", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "No se pudo completar la acción.");
  return data;
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "member" });
  const [editUsername, setEditUsername] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await usersApi("GET");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(""); setMsg(""); setBusy(true);
    try {
      const data = await usersApi("POST", {
        email: form.email.trim() || undefined,
        username: form.username.trim() || undefined,
        password: form.password,
        role: form.role,
      });
      setMsg(form.username.trim() ? `Usuario @${form.username.trim().toLowerCase()} creado. Ya puede entrar con su usuario y contraseña.` : `Usuario ${form.email.trim()} creado. Ya puede entrar con su correo.`);
      setForm({ email: "", username: "", password: "", role: "member" });
      await load();
      void data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el usuario.");
    } finally { setBusy(false); }
  };

  const saveUsername = async (u: AppUser) => {
    setError(""); setMsg(""); setBusy(true);
    try {
      await usersApi("PATCH", { id: u.id, username: (editUsername[u.id] ?? u.username ?? "").trim() });
      setMsg(`Nombre de usuario actualizado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el usuario.");
    } finally { setBusy(false); }
  };

  const toggleBan = async (u: AppUser) => {
    setError(""); setMsg(""); setBusy(true);
    try {
      await usersApi("PATCH", { id: u.id, banned: !u.banned_until });
      setMsg(u.banned_until ? "Usuario activado." : "Usuario desactivado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el usuario.");
    } finally { setBusy(false); }
  };

  const resetPassword = async (u: AppUser) => {
    const next = window.prompt(`Nueva contraseña para ${u.username ? `@${u.username}` : u.email}: (mínimo 6 caracteres)`, "");
    if (!next) return;
    setError(""); setMsg(""); setBusy(true);
    try {
      await usersApi("PATCH", { id: u.id, action: "reset_password", password: next });
      setMsg("Contraseña restablecida. Ya puede entrar con la nueva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restablecer la contraseña.");
    } finally { setBusy(false); }
  };

  const remove = async (u: AppUser) => {
    if (!window.confirm(`¿Eliminar a ${u.username ? `@${u.username}` : u.email}? Esta acción no se puede deshacer.`)) return;
    setError(""); setMsg(""); setBusy(true);
    try {
      await usersApi("DELETE", { id: u.id });
      setMsg("Usuario eliminado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el usuario.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="text-slate-600">
          Crea accesos para entrar con correo o con nombre de usuario, igual que en el POS.
          Si no pones correo, la persona entra solo con su usuario y contraseña.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {msg && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Crear acceso</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Correo (opcional si hay usuario)</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tu@correo.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Nombre de usuario (opcional si hay correo)</label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ej. recepcion1" />
          </div>
          <div>
            <label className="text-sm font-medium">Contraseña *</label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label className="text-sm font-medium">Rol</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="member">Miembro</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={create} disabled={busy}>Crear acceso</Button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Accesos ({users.length})</h2>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Cargando…</p>
        ) : users.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No hay usuarios para mostrar.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {users.map((u) => (
              <li key={u.id} className="rounded-lg border p-3">
                <p className="text-sm">
                  <strong>{u.username ? `@${u.username}` : u.email || "Sin correo"}</strong>
                  {u.username && !u.internal_email ? ` · ${u.email}` : ""}
                  {u.internal_email ? " · correo interno, solo entra con su usuario" : ""}
                  {` · ${u.role === "owner" ? "Dueño" : u.role === "admin" ? "Admin" : "Miembro"}`}
                  {u.banned_until ? " · Desactivado" : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-[200px]"
                    placeholder="Usuario, ej. recepcion1"
                    value={editUsername[u.id] ?? u.username ?? ""}
                    onChange={(e) => setEditUsername((v) => ({ ...v, [u.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" disabled={busy || (editUsername[u.id] ?? u.username ?? "") === (u.username ?? "")} onClick={() => saveUsername(u)}>
                    Guardar usuario
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => resetPassword(u)}>Restablecer contraseña</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => toggleBan(u)}>
                    {u.banned_until ? "Activar" : "Desactivar"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(u)}>Eliminar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
