// Bandeja de equipo + editor visual de flujos — costo $0.
// Stack actual, sin suscripciones nuevas y sin paquetes externos:
// Next.js + TypeScript + Tailwind (componentes propios con divs,
// sin React Flow) + Supabase (tablas + RLS, migración 006) +
// API oficial de WhatsApp / Meta (Fase 2). Los datos demo viven en
// localStorage, igual que el resto del panel; las tablas de la
// migración 006 son el destino en la nube cuando se aplique.

export type InboxChannel = "whatsapp" | "facebook" | "instagram";
export type ConversationStatus = "abierta" | "asignada" | "resuelta";
export type AssigneeRole = "recepcionista" | "admin";

export interface InboxMessage {
  id: string;
  conversationId: string;
  from: "paciente" | "equipo" | "bot";
  text: string;
  createdAt: string;
  /** true = solo borrador local, todavía NO se envió por WhatsApp. */
  draft?: boolean;
}

export interface Conversation {
  id: string;
  organizationId: string;
  contactName: string;
  contactPhone: string | null;
  /** PSID (Messenger) o IGSID (Instagram) de quien escribe. null en
   *  WhatsApp (ahí el destinatario es el teléfono) y en los ejemplos. */
  metaSenderId?: string | null;
  channel: InboxChannel;
  status: ConversationStatus;
  assignedTo: string | null;
  assignedRole: AssigneeRole | null;
  lastMessage: string;
  updatedAt: string;
  messages: InboxMessage[];
}

export type FlowNodeType =
  | "mensaje"
  | "pregunta"
  | "condicion"
  | "agendar"
  | "confirmar"
  | "transferir";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  title: string;
  text: string;
  /** Id del nodo siguiente, o null si es el final del flujo. */
  nextId: string | null;
  x: number;
  y: number;
}

export interface Flow {
  id: string;
  organizationId: string;
  name: string;
  active: boolean;
  nodes: FlowNode[];
  updatedAt: string;
}

export const INBOX_CHANNELS: { id: InboxChannel; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
];

export const FLOW_NODE_TYPES: { id: FlowNodeType; label: string; hint: string }[] = [
  { id: "mensaje", label: "Mensaje", hint: "Manda un texto al paciente." },
  { id: "pregunta", label: "Pregunta", hint: "Pregunta algo y espera la respuesta." },
  { id: "condicion", label: "Condición", hint: "Si responde X, sigue por un camino; si no, por otro." },
  { id: "agendar", label: "Agendar", hint: "Propone horarios libres con el anti-empalme." },
  { id: "confirmar", label: "Confirmar", hint: "Confirma la cita (pasa a Confirmada)." },
  { id: "transferir", label: "Transferir a humano", hint: "Pasa la conversación a una persona del equipo." },
];

export const NODE_COLORS: Record<FlowNodeType, string> = {
  mensaje: "bg-blue-50 border-blue-300",
  pregunta: "bg-amber-50 border-amber-300",
  condicion: "bg-purple-50 border-purple-300",
  agendar: "bg-green-50 border-green-300",
  confirmar: "bg-teal-50 border-teal-300",
  transferir: "bg-rose-50 border-rose-300",
};

export function newNodeId(): string {
  return `nodo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Flujo de ejemplo: paciente escribe → pregunta servicio →
 *  propone horarios → confirma → recordatorio. */
export function exampleFlow(organizationId: string): Flow {
  const nodes: FlowNode[] = [
    { id: "nodo-1", type: "mensaje", title: "Saludo", text: "Hola, soy Vincimia Agenda de Dentiplus. ¿En qué te ayudo?", nextId: "nodo-2", x: 20, y: 20 },
    { id: "nodo-2", type: "pregunta", title: "Pregunta servicio", text: "¿Qué servicio necesitas: limpieza, blanqueamiento, ortodoncia o revisión?", nextId: "nodo-3", x: 20, y: 180 },
    { id: "nodo-3", type: "agendar", title: "Propone horarios", text: "Te propongo los horarios libres del doctor, sin empalmes.", nextId: "nodo-4", x: 20, y: 340 },
    { id: "nodo-4", type: "confirmar", title: "Confirma cita", text: "Tu cita quedó confirmada. Te recomendamos llegar 15 minutos antes si es tu primera vez.", nextId: "nodo-5", x: 20, y: 500 },
    { id: "nodo-5", type: "mensaje", title: "Recordatorio", text: "Te recordamos tu cita de mañana. Responde Confirmo si vas a venir, o Cancelar si no puedes.", nextId: null, x: 20, y: 660 },
  ];
  return {
    id: "flujo-ejemplo",
    organizationId,
    name: "Reserva por WhatsApp (ejemplo)",
    active: true,
    nodes,
    updatedAt: new Date().toISOString(),
  };
}

/** Conversaciones de ejemplo, con los contactos demo de la agenda
 *  (Laura Méndez, Luis Soto, Sofía Castro, Mariana Torres y
 *  Roberto Gómez). No son mensajes reales: son datos de ejemplo
 *  para probar la bandeja sin cuentas. */
export function exampleConversations(organizationId: string): Conversation[] {
  const now = new Date().toISOString();
  const msg = (
    id: string, conversationId: string, from: InboxMessage["from"], text: string
  ): InboxMessage => ({ id, conversationId, from, text, createdAt: now });
  return [
    {
      id: "conv-laura", organizationId, contactName: "Laura Méndez",
      contactPhone: "+52 686 987 6543", channel: "whatsapp", status: "abierta",
      assignedTo: null, assignedRole: null,
      lastMessage: "Hola, quiero agendar una limpieza", updatedAt: now,
      messages: [
        msg("m1", "conv-laura", "paciente", "Hola, quiero agendar una limpieza"),
        msg("m2", "conv-laura", "bot", "Hola, soy Vincimia Agenda de Dentiplus. ¿Qué día te queda bien?"),
      ],
    },
    {
      id: "conv-luis", organizationId, contactName: "Luis Soto",
      contactPhone: "+52 686 555 0199", channel: "whatsapp", status: "asignada",
      assignedTo: "Recepción", assignedRole: "recepcionista",
      lastMessage: "Confirmo mi cita de las 10:15", updatedAt: now,
      messages: [
        msg("m3", "conv-luis", "paciente", "Confirmo mi cita de las 10:15"),
        msg("m4", "conv-luis", "bot", "Listo, tu cita quedó confirmada."),
      ],
    },
    {
      id: "conv-sofia", organizationId, contactName: "Sofía Castro",
      contactPhone: "+52 686 777 8899", metaSenderId: "psid-demo-sofia",
      channel: "facebook", status: "abierta",
      assignedTo: null, assignedRole: null,
      lastMessage: "¿Cuánto cuesta el blanqueamiento?", updatedAt: now,
      messages: [
        msg("m5", "conv-sofia", "paciente", "¿Cuánto cuesta el blanqueamiento?"),
      ],
    },
    {
      id: "conv-mariana", organizationId, contactName: "Mariana Torres",
      contactPhone: "+52 686 222 3344", metaSenderId: "igsid-demo-mariana",
      channel: "instagram", status: "resuelta",
      assignedTo: "Admin", assignedRole: "admin",
      lastMessage: "Gracias, ya agendé", updatedAt: now,
      messages: [
        msg("m6", "conv-mariana", "paciente", "¿Tienen lugar el sábado?"),
        msg("m7", "conv-mariana", "equipo", "Sí, a las 11:30. ¿Te lo aparto?"),
        msg("m8", "conv-mariana", "paciente", "Gracias, ya agendé"),
      ],
    },
    {
      id: "conv-roberto", organizationId, contactName: "Roberto Gómez",
      contactPhone: "+52 686 123 4567", channel: "whatsapp", status: "abierta",
      assignedTo: null, assignedRole: null,
      lastMessage: "¿Me pueden mover mi cita?", updatedAt: now,
      messages: [
        msg("m9", "conv-roberto", "paciente", "¿Me pueden mover mi cita?"),
      ],
    },
  ];
}
