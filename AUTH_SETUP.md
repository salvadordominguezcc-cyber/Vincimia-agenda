# Auth — lo que Salvador debe configurar en Supabase

El código del login ya está en la app (correo + contraseña con Supabase
Auth). Solo falta esta configuración en el panel de Supabase, una vez.
Sin ella, los enlaces de confirmación y recuperación apuntan al sitio
equivocado y el registro no entra al panel.

Proyecto: **vincimia-agenda** (ref `ktqhsmerzxukrsxqalnk`) — el mismo de
siempre, con el correo salvadordominguezcc@gmail.com.

## 1. Site URL y Redirect URLs

Supabase → tu proyecto **vincimia-agenda** → **Authentication → URL
Configuration**:

- **Site URL:** `https://vincimia-agenda.pages.dev`
- **Redirect URLs:** agrega esta línea (pulsa Add URL si hace falta):
  - `https://vincimia-agenda.pages.dev/**`

Guarda con **Save**. Sin esto, el enlace de confirmación del correo
puede devolver a `localhost` o a la URL de Supabase y el login no se
completa.

## 2. Correo habilitado

En **Authentication → Providers → Email**, verifica que **Email** esté
habilitado (Enable Email provider). Es el proveedor que usa el login,
el registro y la recuperación de contraseña.

Opcional, si quieres que el registro entre directo sin confirmar el
correo: en la misma pantalla apaga **Confirm email**. Si lo dejas
encendido (recomendado), el usuario nuevo recibe un enlace, lo pulsa y
entra. El código maneja los dos casos.

## 3. Nada de llaves nuevas

No hay que pegar ninguna llave nueva en Cloudflare. Las 4 variables que
ya están en Production (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`) son las que usa el Auth. La ruta
`/api/auth/membership` usa la `service_role` que ya está guardada.

## Cómo probar (después del despliegue automático)

1. Abre https://vincimia-agenda.pages.dev/login
2. Crea una cuenta con tu correo. Si la confirmación está encendida,
   revisa tu correo y pulsa el enlace: debe volver a `/login` y entrar
   al panel solo.
3. Entra a https://vincimia-agenda.pages.dev/dashboard sin sesión: debe
   redirigir a `/login`.
4. Abre https://vincimia-agenda.pages.dev/reserva/clinica-sonrisa sin
   sesión: debe abrir normal, sin pedir login.
5. En el panel, pulsa **Cerrar sesión**: debe volver a `/login`.

## Qué hace el código

- `/login` — entrar, crear cuenta y recuperar contraseña (tres modos en
  la misma pantalla). Tras entrar o registrarse, llama a
  `/api/auth/membership` para dar acceso a la Org #1 piloto.
- `/auth/reset` — destino del enlace de recuperación; ahí se pone la
  contraseña nueva.
- `/dashboard/*` — guard en el layout: con Supabase configurado exige
  sesión y redirige a `/login`; sin Supabase configurado sigue en modo
  demo local (sin login), como antes.
- `/api/auth/membership` — ruta de servidor (edge) que valida el token
  del usuario y le crea la membresía a la Org #1 si no tiene ninguna.
  Es necesaria porque el esquema tiene RLS en `memberships` sin
  política INSERT: el navegador no puede insertar su propia membresía.
- Decisión piloto documentada en `src/lib/auth.ts`: los usuarios nuevos
  entran a la Org #1 (Clínica Dental Sonrisa). Con la Fase 4 (SaaS) cada
  negocio creará su propia organización al registrarse.
