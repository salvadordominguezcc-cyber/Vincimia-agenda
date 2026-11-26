# Creador de contenido — Vincimia Agenda

Módulo para crear publicaciones para Facebook, Instagram y WhatsApp
sin pagar otra app. Usa el mismo stack gratis del proyecto y publica
directo con la API de Meta, sin intermediarios como respond.io.

## Stack (todo gratis para empezar)

| Para qué | Herramienta gratis | Para qué sirve aquí | Si se paga |
|---|---|---|---|
| Textos y guiones | Gemini + Groq (llaves que ya tienes) | Textos, ideas y guiones de publicaciones | $0 en plan gratis |
| Imágenes con tus fotos | Gemini Nano Banana | Edita tus fotos reales y mantiene a Dr. Denti igual en cada anuncio | $0 en plan gratis |
| Carteles con texto | Ideogram gratis | Carteles con precio y promoción con texto legible | 30 créditos/semana gratis; Plus $20 USD/mes |
| Estilos variados | Leonardo AI gratis | Imágenes con otros estilos | 150 tokens/día gratis; Essential $12 USD/mes |
| Imágenes rápidas | Pollinations | Imágenes rápidas sin cuenta | $0 |
| Diseño final | Canva gratis | Pone texto, logo y precios perfectos, en tamaño para cada red | $0; Pro $15–18 USD/mes |
| Publicación | API oficial de Meta | Publica en Facebook, Instagram y WhatsApp, sin intermediario | Solo lo que cobra Meta por mensaje |
| Generación aquí | Muse | Te genera textos e imágenes en el chat, con tus fotos de referencia | $0 extra aquí |

Leonardo solo no es suficiente: no escribe bien el texto dentro de
la imagen y no mantiene igual a Dr. Denti. Por eso el stack combina
Gemini (foto y personaje), Ideogram (texto) y Canva (diseño final).

## Proceso del cliente (en palabras normales)

1. **Se registra:** correo y contraseña, crea su negocio (nombre,
   logo, colores, WhatsApp). 14 días gratis, sin tarjeta.
2. **Conecta sus redes:** Facebook, Instagram y WhatsApp Business,
   con permiso una sola vez.
3. **Crea su contenido:** elige un tema (limpieza, blanqueamiento,
   dolor de muela, ortodoncia, implante, caries, sensibilidad). La
   herramienta le da 3 textos y 3 ideas de imagen; elige una.
4. **Aprueba y programa:** ve la publicación antes de publicar,
   elige día y hora, y se publica sola.
5. **Ve qué funcionó:** vistas, mensajes y citas que llegaron de
   esa publicación.
6. **Paga su plan:** al terminar los 14 días, Básico $400 o Pro
   $700 al mes, con Stripe México o Mercado Pago. Si no paga, se
   pausa, no se borra nada.

## Proceso interno (lo que hace el código)

```
Tema → textos (Gemini/Groq) → imagen (Gemini/Ideogram/Leonardo)
  → diseño (Canva) → borrador → aprobado → programado → publicado
  → métricas (vistas, mensajes, citas)
```

Estados de una publicación: `borrador → aprobado → programado →
publicado`. También puede quedar `pausado`.

## Planes SaaS (contenido)

| Plan | Precio | Contenido |
|---|---|---|
| Básico | $400 MXN/mes | 8 publicaciones al mes, textos e imágenes con IA, publicar en Facebook e Instagram |
| Pro | $700 MXN/mes | Publicaciones ilimitadas, videos cortos, programar toda la semana, WhatsApp Business y reportes de qué publicación trajo citas |

Cada negocio ve solo su contenido: `organization_id` + RLS en
Supabase (ver `supabase/migrations/005_content_creator.sql`). Nada
se mezcla entre clínicas.

## Qué hay en el código

- `src/lib/content.ts` — temas, plantillas de texto, límites por
  plan (Básico 8/mes, Pro ilimitado) y proveedores.
- `src/app/dashboard/contenido/page.tsx` — página **Contenido** en
  el panel: elige tema, genera 3 textos, guarda borrador, aprueba y
  marca como programado/publicado. Los datos viven en localStorage
  en modo demo, igual que el resto del panel.
- `supabase/migrations/005_content_creator.sql` — tablas
  `content_posts` y `content_templates` con RLS por organización.
- `.env.example` — llaves opcionales `GEMINI_API_KEY` y
  `GROQ_API_KEY` (las que ya tienes para la Fase 2). Sin ellas, la
  página usa las plantillas locales y no se inventa nada.

## Pendiente (no simulado)

- Publicación automática real a Meta: necesita los tokens de
  Facebook/Instagram conectados por cada negocio y una ruta
  `/api/content/publish`. Hoy la página guarda borrador/aprobado/
  programado y el usuario publica con el texto e imagen generados.
- Videos cortos (Pro): se generan como clips de ~10 segundos y se
  editan en CapCut, igual que los anuncios de Dentiplus.
- Métricas reales: necesitan leer los mensajes y citas que llegan
  de cada publicación, no solo contar publicaciones.
