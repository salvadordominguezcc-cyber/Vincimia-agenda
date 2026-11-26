// Creador de contenido — stack, temas y límites por plan.
// Gratis para empezar: Gemini + Groq (textos), Gemini Nano Banana
// (fotos y Dr. Denti), Ideogram (carteles con texto), Leonardo
// (estilos variados), Pollinations (rápidas) y Canva (diseño final).
// Publicación directa con la API de Meta, sin intermediarios.
// Leonardo solo NO basta: no escribe bien el texto en la imagen ni
// mantiene igual al personaje; por eso se combina con Gemini e
// Ideogram. Sin llaves de Gemini/Groq, la página usa las plantillas
// locales de abajo y no inventa nada.

export type ContentChannel = "facebook" | "instagram" | "whatsapp";
export type ContentStatus =
  | "borrador"
  | "aprobado"
  | "programado"
  | "publicado"
  | "pausado";

export interface ContentPost {
  id: string;
  topic: string;
  title: string;
  caption: string;
  imagePrompt: string;
  channels: ContentChannel[];
  status: ContentStatus;
  scheduledAt: string | null;
  createdAt: string;
}

export interface ContentTemplate {
  topic: string;
  title: string;
  captions: string[];
  imagePrompt: string;
}

// Temas de dolor dental de Dentiplus (los 7 de la serie).
export const CONTENT_TOPICS: ContentTemplate[] = [
  {
    topic: "limpieza",
    title: "Limpieza dental",
    captions: [
      "¿Tus encías sangran al cepillarte? Puede ser gingivitis. Agenda tu limpieza y cuida tu sonrisa. Escríbenos por WhatsApp.",
      "Una limpieza a tiempo te evita problemas más grandes. Agenda hoy tu limpieza dental.",
      "¿Cuándo fue tu última limpieza? Si ya pasó más de 6 meses, es hora de agendar.",
    ],
    imagePrompt:
      "Dentista sonriente haciendo limpieza dental, consultorio limpio y luminoso",
  },
  {
    topic: "blanqueamiento",
    title: "Blanqueamiento dental",
    captions: [
      "¿Tus dientes se ven amarillos o manchados? El blanqueamiento te devuelve la sonrisa. Agenda tu valoración.",
      "Sonríe sin pena: el blanqueamiento es rápido y seguro. Pregunta por tu valoración.",
      "¿Quieres una sonrisa más blanca para esa foto? Agenda tu blanqueamiento hoy.",
    ],
    imagePrompt: "Sonrisa blanca y brillante, consultorio dental moderno",
  },
  {
    topic: "dolor-muela",
    title: "Dolor de muela",
    captions: [
      "¿Te duele la muela? No esperes a que empeore. Agenda tu valoración urgente, hoy mismo.",
      "El dolor de muela no se quita solo. Ven a revisión y te decimos qué es.",
      "¿Despertaste con dolor de muela? Escríbenos por WhatsApp y te buscamos lugar hoy.",
    ],
    imagePrompt: "Paciente con dolor de muela, dentista revisando con cuidado",
  },
  {
    topic: "ortodoncia",
    title: "Ortodoncia",
    captions: [
      "¿Quieres enderezar tus dientes? La ortodoncia es para todas las edades. Agenda tu valoración.",
      "Una sonrisa derecha cambia todo. Pregunta por ortodoncia en tu próxima visita.",
      "¿Brackets o alineadores? Te decimos cuál te conviene en tu valoración.",
    ],
    imagePrompt: "Sonrisa con brackets, adolescente sonriendo",
  },
  {
    topic: "implante",
    title: "Implante dental",
    captions: [
      "¿Te falta un diente? El implante te devuelve comer y sonreír con confianza. Agenda tu valoración.",
      "No te acostumbres a que te falte un diente. El implante es la solución fija. Pregunta hoy.",
      "¿Te da pena sonreír por un diente faltante? Ven, te explicamos el implante sin compromiso.",
    ],
    imagePrompt: "Implante dental, sonrisa completa y natural",
  },
  {
    topic: "caries",
    title: "Caries",
    captions: [
      "¿Tienes una caries? Entre más pronto se atienda, más sencillo es. Agenda tu revisión.",
      "Una caries pequeña hoy es un dolor grande mañana. Ven a revisión.",
      "¿Te duele al morder o con lo dulce? Puede ser caries. Agenda tu revisión.",
    ],
    imagePrompt: "Dentista revisando una muela con espejo dental",
  },
  {
    topic: "sensibilidad",
    title: "Sensibilidad dental",
    captions: [
      "¿Te duelen los dientes con lo frío o caliente? Puede ser sensibilidad. Agenda tu revisión.",
      "¿No puedes tomar helado sin que te duela? Ven a revisión, tiene solución.",
      "La sensibilidad no es normal: se atiende. Agenda tu revisión hoy.",
    ],
    imagePrompt: "Persona tomando bebida fría, dentista al lado",
  },
];

export const CONTENT_CHANNELS: { id: ContentChannel; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
];

// Límites SaaS: Básico $400/mes = 8 publicaciones al mes.
// Pro $700/mes = ilimitado + videos + WhatsApp + reportes.
export type ContentPlan = "basico" | "pro";
export const CONTENT_PLAN_LIMITS: Record<ContentPlan, number | null> = {
  basico: 8,
  pro: null,
};

export function contentMonthlyLimit(plan: ContentPlan): number | null {
  return CONTENT_PLAN_LIMITS[plan];
}

export function contentCanCreate(
  plan: ContentPlan,
  usedThisMonth: number
): boolean {
  const limit = CONTENT_PLAN_LIMITS[plan];
  return limit === null || usedThisMonth < limit;
}

// Proveedores del stack, con su costo gratis y su límite.
export const CONTENT_PROVIDERS = [
  { name: "Gemini / Groq", use: "Textos y guiones", free: "Gratis con tus llaves", paid: "$0" },
  { name: "Gemini Nano Banana", use: "Fotos reales y Dr. Denti", free: "Gratis", paid: "$0" },
  { name: "Ideogram", use: "Carteles con texto legible", free: "30 créditos/semana", paid: "Plus $20 USD/mes" },
  { name: "Leonardo AI", use: "Estilos variados de imagen", free: "150 tokens/día", paid: "Essential $12 USD/mes" },
  { name: "Pollinations", use: "Imágenes rápidas sin cuenta", free: "Gratis", paid: "$0" },
  { name: "Canva", use: "Diseño final con logo y precios", free: "Gratis", paid: "Pro $15–18 USD/mes" },
  { name: "API de Meta", use: "Publicar en Facebook, Instagram y WhatsApp", free: "Sin intermediario", paid: "Solo lo que cobra Meta por mensaje" },
] as const;
