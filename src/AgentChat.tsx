"use client";

/**
 * Widget de chat embebible (F3) — UI clara y premium.
 *
 * Portable: estilos propios en línea, sin depender de CSS externo. Se mete en
 * cualquier app Next.js. NO conoce el appToken — habla con un endpoint del
 * propio host (por defecto /api/agent) que inyecta el token en el servidor.
 *
 * Al montar, hace un GET al mismo `endpoint` para leer metadatos públicos de
 * la app (nombre, ícono, color, si permite imágenes/voz) configurados desde
 * el panel admin — así el widget se auto-configura sin que el host tenga que
 * pasar cada prop a mano. Si el GET falla, usa los props/defaults.
 *
 * Uso mínimo:
 *   <AgentChat />
 *   <AgentChat endpoint="/api/agent" title="Soporte" accent="#363a52" />
 *
 * ⚠️ Al usar estilos en línea hay que declarar TODAS las propiedades que la
 * app anfitriona pueda tocar con selectores de etiqueta. Por ejemplo, un
 * `button { padding: 12px 20px }` global se cuela en los botones del widget:
 * con `box-sizing: border-box` deja el contenido en pocos píxeles y los
 * iconos se ven como puntos (o desaparecen). Por eso cada botón fija su
 * propio `padding`.
 */

// `React` explícito, no solo los hooks: Next.js lo resuelve solo con su
// runtime automático de JSX, pero si algún día este archivo se empaqueta o
// se prueba fuera de Next (como aquí, con tsx/esbuild), hace falta el
// nombre en el ámbito — más portable, que es justo lo que se le pide a un
// widget pensado para copiarse en cualquier proyecto.
import React, { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

type Role = "user" | "assistant";
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string };
type Message = {
  role: Role;
  content: string | ContentPart[];
  /** Mensaje que llegó solo (recomendación proactiva), sin que el usuario preguntara. */
  suggestion?: boolean;
};

type Meta = {
  name: string;
  avatarEmoji: string;
  accentColor: string;
  allowImages: boolean;
  allowVoice: boolean;
  /** Animaciones de "vida" activadas desde el panel. */
  idleAnimations?: string[];
};

export type AgentChatProps = {
  endpoint?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  accent?: string;
  avatarEmoji?: string;
  greeting?: string;
  defaultOpen?: boolean;
  context?: unknown;
  /**
   * Identifica al usuario/sesión para dirigirle las recomendaciones
   * proactivas (F4). Normalmente el id de usuario de tu app.
   */
  sessionKey?: string;
  /**
   * Muestra el engranaje de configuración en la cabecera del chat. El
   * widget NUNCA decide esto solo — no tiene forma de saber quién es
   * administrador en tu app. Lo calculas tú, en el servidor o con tu
   * propio sistema de roles, y lo pasas aquí.
   */
  showSettings?: boolean;
  /** Qué hacer al pulsar el engranaje — normalmente, abrir tu propio modal. */
  onOpenSettings?: () => void;
};

/* ==========================================================================
   Formato ligero de la respuesta del asistente

   El texto llega como una cadena plana (así habla el streaming) y se
   mostraba literal, con `white-space: pre-wrap` haciendo que los saltos de
   línea ya se vieran bien. Esto añade **negrita**, *cursiva*, `código`,
   [enlaces](url) e ![imágenes](url) — sin tocar ese comportamiento base: un
   mensaje sin ninguna de estas marcas se ve exactamente igual que antes.

   Todo se arma como elementos de React, nunca con `dangerouslySetInnerHTML`:
   no hay HTML que interpretar, así que no hay manera de inyectar uno.

   Aproximado a propósito, no un parser completo de Markdown: es una
   expresión regular por pasada, pensada para lo que un modelo realmente
   escribe en un chat, no para documentos. Mientras el texto llega en
   streaming, una marca a medio escribir (un "**" sin cerrar) se ve como
   texto suelto hasta que termina de llegar — se corrige solo, no hay que
   hacer nada.
   ========================================================================== */

/** Nunca acepta `javascript:` ni similares — solo http(s), y data: para imágenes. */
export function urlSegura(u: string, permitirData = false): string | null {
  const p = u.trim();
  if (/^https?:\/\//i.test(p)) return p;
  if (permitirData && /^data:image\//i.test(p)) return p;
  return null;
}

/**
 * Trocea una línea con negrita, cursiva, código entre comillas invertidas,
 * enlaces y una imagen. El orden de las alternativas en el regex importa:
 * la marca de negrita va antes que la de cursiva porque comparten el símbolo.
 */
export function conFormato(texto: string, key: string): ReactNode[] {
  const RE =
    /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(texto))) {
    if (m.index > ultimo) nodos.push(texto.slice(ultimo, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      const src = urlSegura(m[2], true);
      nodos.push(
        src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={src} alt={m[1]} style={S.msgImg} />
        ) : (
          m[0]
        ),
      );
    } else if (m[3] !== undefined) {
      const href = urlSegura(m[4]);
      nodos.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer" style={S.mdLink}>
            {m[3]}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[5] !== undefined) {
      nodos.push(<strong key={k}>{m[5]}</strong>);
    } else if (m[6] !== undefined) {
      nodos.push(
        <code key={k} style={S.mdCode}>
          {m[6]}
        </code>,
      );
    } else if (m[7] !== undefined) {
      nodos.push(<em key={k}>{m[7]}</em>);
    } else if (m[8] !== undefined) {
      nodos.push(<em key={k}>{m[8]}</em>);
    }
    ultimo = RE.lastIndex;
  }
  if (ultimo < texto.length) nodos.push(texto.slice(ultimo));
  return nodos;
}

/**
 * Agrupa líneas `- algo` / `1. algo` consecutivas en listas de verdad; el
 * resto del texto se une con SALTO DE LÍNEA (no espacio), para que el
 * `white-space: pre-wrap` del contenedor lo siga mostrando igual que hoy.
 */
export function bloques(texto: string, keyBase: string): ReactNode[] {
  const salida: ReactNode[] = [];
  let normales: string[] = [];
  let lista: { tipo: "ul" | "ol"; items: string[] } | null = null;

  const cerrarNormales = () => {
    if (normales.length === 0) return;
    salida.push(
      <span key={`${keyBase}-t${salida.length}`}>
        {conFormato(normales.join("\n"), `${keyBase}-t${salida.length}`)}
      </span>,
    );
    normales = [];
  };
  const cerrarLista = () => {
    if (!lista) return;
    const { tipo, items } = lista;
    const Tag = tipo;
    salida.push(
      <Tag key={`${keyBase}-l${salida.length}`} style={S.mdList}>
        {items.map((it, idx) => (
          <li key={idx}>{conFormato(it, `${keyBase}-l${salida.length}-${idx}`)}</li>
        ))}
      </Tag>,
    );
    lista = null;
  };

  for (const linea of texto.split("\n")) {
    const bullet = /^\s*[-*]\s+(.+)/.exec(linea);
    const numerada = /^\s*\d+[.)]\s+(.+)/.exec(linea);
    if (bullet) {
      cerrarNormales();
      if (!lista || lista.tipo !== "ul") {
        cerrarLista();
        lista = { tipo: "ul", items: [] };
      }
      lista.items.push(bullet[1]);
    } else if (numerada) {
      cerrarNormales();
      if (!lista || lista.tipo !== "ol") {
        cerrarLista();
        lista = { tipo: "ol", items: [] };
      }
      lista.items.push(numerada[1]);
    } else {
      cerrarLista();
      normales.push(linea);
    }
  }
  cerrarLista();
  cerrarNormales();
  return salida;
}

/**
 * Sugerencias rápidas: una app puede instruir a su modelo (en el
 * systemPrompt) a terminar con una línea `%% Opción uno | Opción dos`, y el
 * widget la separa del texto y la ofrece como botones — al pulsar uno, se
 * manda como si el usuario lo hubiera escrito.
 *
 * `%%` al INICIO de la última línea, nada más: es una secuencia rara en
 * prosa normal (a diferencia de, por ejemplo, un simple `%`), así que no
 * dispara por accidente con un mensaje que hable de porcentajes.
 */
const RE_SUGERENCIAS = /\n?%%[ \t]*(.+)\s*$/;

export function separarSugerencias(texto: string): { texto: string; opciones: string[] } {
  const m = RE_SUGERENCIAS.exec(texto);
  if (!m) return { texto, opciones: [] };
  const opciones = m[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (opciones.length === 0) return { texto, opciones: [] };
  return { texto: texto.slice(0, m.index), opciones };
}

/* ==========================================================================
   Fechas del historial

   La gente no busca "27/7/2026", busca "lo de ayer". Por eso las
   conversaciones se agrupan por cercanía y la hora se muestra en relativo.
   ========================================================================== */

/** Días completos de diferencia, ignorando la hora. */
function diasDesde(iso: string): number {
  const d = new Date(iso);
  const hoy = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function tiempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;

  const dias = diasDesde(iso);
  if (dias === 0) {
    const h = Math.floor(min / 60);
    return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  }
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

type ConvResumen = {
  id: string;
  title: string;
  updatedAt: string;
  mensajes: number;
};

/** Reparte en "Hoy", "Ayer", "Esta semana" y "Más antiguas". */
export function agruparPorFecha(
  convs: ConvResumen[],
): { etiqueta: string; items: ConvResumen[] }[] {
  const grupos: Record<string, ConvResumen[]> = {};
  const orden = ["Hoy", "Ayer", "Esta semana", "Más antiguas"];

  for (const c of convs) {
    const d = diasDesde(c.updatedAt);
    const clave =
      d <= 0 ? "Hoy" : d === 1 ? "Ayer" : d < 7 ? "Esta semana" : "Más antiguas";
    (grupos[clave] ??= []).push(c);
  }

  return orden
    .filter((k) => grupos[k]?.length)
    .map((k) => ({ etiqueta: k, items: grupos[k] }));
}

/** Convierte "#6d5efc" en rgba, para fondos tenues del color del agente. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function withQuery(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return url + (url.includes("?") ? "&" : "?") + qs;
}

// Reconocimiento de voz del navegador (sin dependencias, sin costo de API).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: unknown) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as new () => SpeechRecognitionLike) ||
    (w.webkitSpeechRecognition as new () => SpeechRecognitionLike) ||
    null
  );
}

/* ---------- utilidades de color (sin depender de color-mix, poco soportado) --- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [54, 58, 82]; // fallback: acento por defecto
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla un color hacia blanco. amount=0 → color original, amount=1 → blanco. */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Mezcla un color hacia negro. amount=0 → original, amount=1 → negro. */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/**
 * Si el color elegido es demasiado claro (p. ej. blanco), el widget quedaría
 * invisible sobre el panel blanco. Por seguridad, si la luminosidad es muy
 * alta, cae a un color con contraste garantizado.
 */
function ensureVisibleAccent(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.82 ? "#363a52" : hex;
}

export function AgentChat({
  endpoint = "/api/agent",
  title = "Asistente",
  subtitle = "En línea",
  placeholder = "Escribe tu mensaje…",
  accent = "#363a52",
  avatarEmoji = "💬",
  greeting,
  defaultOpen = false,
  context,
  sessionKey,
  showSettings,
  onOpenSettings,
}: AgentChatProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>(
    greeting ? [{ role: "assistant", content: greeting }] : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  /** El admin apagó este agente: el widget no se muestra. */
  const [apagado, setApagado] = useState(false);

  /* ---------- Historial (F8) ----------
     `convId` es la conversación abierta. Se recuerda en este navegador para
     que al recargar la página se siga hablando de lo mismo. El contenido no
     se guarda aquí: vive en el gateway, atado al usuario que identifique el
     servidor de tu app. */
  const [convId, setConvId] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [convs, setConvs] = useState<
    { id: string; title: string; updatedAt: string; mensajes: number }[] | null
  >(null);
  /** Por qué la lista está vacía, si no es simplemente que no hay nada. */
  const [histError, setHistError] = useState<string | null>(null);
  const claveConv = `agc-conv-${endpoint}`;

  const guardarConv = useCallback(
    (id: string | null) => {
      setConvId(id);
      try {
        if (id) localStorage.setItem(claveConv, id);
        else localStorage.removeItem(claveConv);
      } catch {
        /* sin almacenamiento: el hilo dura lo que la pestaña */
      }
    },
    [claveConv],
  );

  useEffect(() => {
    try {
      setConvId(localStorage.getItem(claveConv));
    } catch {
      /* sin almacenamiento */
    }
  }, [claveConv]);
  const [image, setImage] = useState<string | null>(null); // base64 data URL
  const [listening, setListening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Panel de configuración PROPIO del widget — solo cuando no hay `onOpenSettings`. */
  const [panelPropio, setPanelPropio] = useState(false);
  const [unread, setUnread] = useState(0);
  /** Sugerencia asomada sobre el botón, sin abrir el chat. */
  const [peek, setPeek] = useState<string | null>(null);
  /** Alegría pasajera al recibir una sugerencia. */
  const [celebra, setCelebra] = useState(false);
  /** Animación de "vida" en curso (duerme, come, estudia…). */
  const [vida, setVida] = useState<OrbMood | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const effTitle = meta?.name ?? title;
  const effEmoji = meta?.avatarEmoji ?? avatarEmoji;
  // Salvaguarda: un acento demasiado claro (p. ej. blanco) haría desaparecer
  // el botón flotante y los degradados sobre el panel blanco — se corrige solo.
  const effAccent = ensureVisibleAccent(meta?.accentColor ?? accent);
  const allowImages = meta?.allowImages ?? false;
  const allowVoice = meta?.allowVoice ?? false;
  const speechSupported = getSpeechRecognition() !== null;

  const grad = `linear-gradient(135deg, ${effAccent}, ${lighten(effAccent, 0.45)})`;
  const ring = lighten(effAccent, 0.82);
  // Fondo del botón "+": suave, pero con suficiente contraste para que el
  // icono no se pierda (antes era casi blanco sobre blanco).
  const accentTint = lighten(effAccent, 0.86);
  const iconColor = darken(effAccent, 0.12);

  // Expresión del orbe. Lo que está pasando manda sobre las animaciones
  // de "vida", que solo salen cuando no hay nada en curso.
  const mood: OrbMood = celebra
    ? "happy"
    : busy
      ? messages[messages.length - 1]?.content
        ? "talking" // ya está llegando texto
        : "thinking" // aún pensando
      : (vida ?? "idle");

  // Auto-configuración: lee nombre/ícono/color/permisos del backend.
  useEffect(() => {
    fetch(endpoint, { method: "GET" })
      .then(async (r) => {
        // 403 = el administrador apagó este agente. Se oculta el widget en vez
        // de dejar una burbuja que no responde.
        if (r.status === 403) {
          setApagado(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => d && setMeta(d))
      .catch(() => {
        /* si falla, se usan los props/defaults */
      });
  }, [endpoint]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Sugerencias proactivas (F4): el servidor empuja recomendaciones por SSE.
  // Se escucha aunque el chat esté cerrado, para poder avisar con el contador.
  useEffect(() => {
    const url = withQuery(endpoint, {
      sse: "1",
      ...(sessionKey ? { session: sessionKey } : {}),
    });

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      return; // entorno sin EventSource
    }

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type !== "suggestion" || !data.message) return;

        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.message, suggestion: true },
        ]);
        setUnread((n) => n + 1);
        setCelebra(true);
        setTimeout(() => setCelebra(false), 2600);

        // Con el chat cerrado, la sugerencia "asoma" sobre el botón para que
        // se lea sin tener que abrir nada. Solo pasa con las proactivas.
        setOpen((isOpen) => {
          if (!isOpen) {
            setPeek(data.message);
            if (peekTimer.current) clearTimeout(peekTimer.current);
            peekTimer.current = setTimeout(() => setPeek(null), 20000);
          }
          return isOpen;
        });
      } catch {
        /* mensaje malformado: ignorar */
      }
    };
    // onerror: EventSource reconecta solo, no hace falta actuar.

    return () => es.close();
  }, [endpoint, sessionKey]);

  // Al abrir el chat, se dan por leídas las sugerencias y se retira la nubecita.
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    setPeek(null);
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, [open, messages.length]);

  // Limpieza del temporizador al desmontar.
  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);

  /**
   * Animaciones de "vida": cada cierto tiempo, si el chat está cerrado y en
   * reposo, el orbe hace algo por su cuenta (dormir, comer, estudiar…).
   * Las activa el administrador por app.
   */
  const permitidas = meta?.idleAnimations ?? [];
  const permitidasKey = permitidas.join(",");

  useEffect(() => {
    const opciones = permitidasKey.split(",").filter(Boolean) as OrbMood[];
    if (opciones.length === 0 || open || busy) {
      setVida(null);
      return;
    }

    let vivo = true;
    let tFin: ReturnType<typeof setTimeout>;

    const programar = () => {
      // Espera entre 25 y 60 segundos antes de la siguiente.
      const espera = 25000 + Math.random() * 35000;
      const tIni = setTimeout(() => {
        if (!vivo) return;
        const elegida = opciones[Math.floor(Math.random() * opciones.length)];
        setVida(elegida);
        // Dormir dura más; el resto son gestos cortos.
        const duracion = elegida === "sleeping" ? 12000 : 6000;
        tFin = setTimeout(() => {
          if (!vivo) return;
          setVida(null);
          programar();
        }, duracion);
      }, espera);
      return tIni;
    };

    const primero = programar();
    return () => {
      vivo = false;
      clearTimeout(primero);
      clearTimeout(tFin);
      setVida(null);
    };
  }, [permitidasKey, open, busy]);

  // Cierra el menú de "+" al hacer clic fuera de él.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function pickImage() {
    setMenuOpen(false);
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function toggleListen() {
    setMenuOpen(false);
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    if (listening) {
      recRef.current?.stop();
      return;
    }

    const rec = new Ctor();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: unknown) => {
      const ev = e as { results: { 0: { transcript: string } }[] };
      const transcript = ev.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  /**
   * El envío de verdad, separado de `send` para poder dispararlo también
   * desde un botón de sugerencia rápida (sin pasar por el formulario ni por
   * el estado `input`).
   */
  async function enviarTexto(text: string, imagenAdjunta: string | null) {
    if ((!text && !imagenAdjunta) || busy) return;

    const content: string | ContentPart[] = imagenAdjunta
      ? [
          ...(text ? [{ type: "text" as const, text }] : []),
          { type: "image" as const, image: imagenAdjunta },
        ]
      : text;

    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // conversationId enlaza este mensaje con lo hablado antes. Quién es el
        // usuario lo pone el servidor de tu app, no esto.
        body: JSON.stringify({ messages: next, context, conversationId: convId }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Error");
        patchLast(`⚠️ ${res.status}: ${errText}`);
        return;
      }

      // El gateway devuelve el id de la conversación (nueva o continuada).
      const id = res.headers.get("x-conversation-id");
      if (id && id !== convId) guardarConv(id);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patchLast(acc);
      }
    } catch (err) {
      patchLast(`⚠️ Error de red: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  /** El formulario de siempre: lee `input`/`image`, limpia y delega. */
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !image) || busy) return;
    const imagenAdjunta = image;
    setInput("");
    setImage(null);
    await enviarTexto(text, imagenAdjunta);
  }

  /* ---------- Historial: listar, abrir, borrar ---------- */

  async function abrirHistorial() {
    setVerHistorial(true);
    setConvs(null);
    setHistError(null);
    try {
      const r = await fetch(withQuery(endpoint, { conversations: "1" }));
      if (r.ok) {
        setConvs((await r.json()).conversaciones ?? []);
        return;
      }
      // Una lista vacía no puede significar tres cosas distintas: aquí se
      // distingue "no hay nada" de "esto no está bien configurado".
      setConvs([]);
      if (r.status === 409) {
        setHistError("El historial está desactivado para este asistente.");
      } else if (r.status === 400) {
        setHistError(
          "Falta identificar al usuario: tu servidor debe enviar la cabecera x-user-key.",
        );
      } else {
        setHistError(`No se pudo cargar el historial (error ${r.status}).`);
      }
    } catch {
      setConvs([]);
      setHistError("No se pudo conectar para cargar el historial.");
    }
  }

  async function cargarConversacion(id: string) {
    try {
      const r = await fetch(withQuery(endpoint, { conversation: id }));
      if (!r.ok) return;
      const d = await r.json();
      setMessages(
        (d.mensajes ?? []).map(
          (m: { role: "user" | "assistant"; content: string }) => ({
            role: m.role,
            content: m.content,
          }),
        ),
      );
      guardarConv(id);
      setVerHistorial(false);
    } catch {
      /* si falla, se queda donde estaba */
    }
  }

  async function borrarConversacion(id: string) {
    try {
      await fetch(withQuery(endpoint, { conversation: id }), {
        method: "DELETE",
      });
    } catch {
      /* se refresca igual: si no se borró, seguirá en la lista */
    }
    if (id === convId) {
      guardarConv(null);
      setMessages([]);
    }
    abrirHistorial();
  }

  /** Empezar de cero, sin borrar lo anterior. */
  function nuevaConversacion() {
    guardarConv(null);
    setMessages([]);
    setVerHistorial(false);
  }

  function patchLast(content: string) {
    setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = { role: "assistant", content };
      return copy;
    });
  }

  // Agente apagado desde el panel: no se pinta nada en la web del cliente.
  if (apagado) return null;

  return (
    <div style={S.root}>
      <style>{`
        @keyframes agc-peek-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        /* Borrar es irreversible: el icono va en rojo y se enciende al pasar
           por encima. Va aquí y no en el objeto de estilos porque los estilos
           inline no admiten :hover. */
        .agc-trash svg path { stroke: #e0a0a0; transition: stroke .14s; }
        .agc-trash:hover { background: #fdeeee; }
        .agc-trash:hover svg path { stroke: #d64545; }
        .agc-trash:focus-visible {
          outline: 2px solid #d64545;
          outline-offset: -2px;
        }

        /* En ratón la papelera se atenúa hasta que haces hover: la lista se
           lee mejor sin un icono rojo en cada fila. */
        .agc-trash { opacity: .45; transition: opacity .14s, background .14s; }
        .agc-hist-item:hover .agc-trash,
        .agc-trash:focus-visible { opacity: 1; }

        /* En táctil no hay hover, así que ahí siempre se ve. */
        @media (hover: none) {
          .agc-trash { opacity: 1; }
        }

        .agc-hist-item {
          transition: border-color .14s, box-shadow .14s, transform .14s;
        }
        .agc-hist-item:hover {
          box-shadow: 0 6px 18px rgba(30, 25, 80, .10);
          transform: translateY(-1px);
        }

        /* --- La burbuja cerrada: discreta en reposo, presente al acercarse ---
           Vive en un rincón de la web de OTRO, así que en reposo se hace
           pequeña y translúcida. Al acercar el ratón crece y se ve entera.
           El área de clic NO cambia: el botón mantiene su tamaño real y solo
           se escala visualmente, así no hay que apuntar a un blanco diminuto. */
        .agc-fab {
          transition: transform .24s cubic-bezier(.2,.9,.3,1.2), opacity .24s ease;
          transform-origin: center;
        }
        .agc-fab:not(.abierto) {
          opacity: .55;
          transform: scale(.78);
        }
        .agc-fab:not(.abierto):hover,
        .agc-fab:not(.abierto):focus-visible {
          opacity: 1;
          transform: scale(1.06);
        }
        /* Con una sugerencia sin leer se queda visible: ahí sí reclama atención */
        .agc-fab.reclama {
          opacity: 1;
          transform: scale(1);
        }
        .agc-fab.reclama:hover {
          transform: scale(1.06);
        }

        /* En pantallas táctiles no hay ratón al que acercarse: se deja visible */
        @media (hover: none) {
          .agc-fab:not(.abierto) {
            opacity: .9;
            transform: scale(.95);
          }
        }

        /* Respeta a quien pidió menos animación en su sistema. */
        @media (prefers-reduced-motion: reduce) {
          .agc-hist-item { transition: none; }
          .agc-hist-item:hover { transform: none; }
          .agc-fab { transition: opacity .2s ease; }
          .agc-fab:not(.abierto) { transform: none; opacity: .7; }
          .agc-fab:not(.abierto):hover { transform: none; opacity: 1; }
        }
      `}</style>

      {open && (
        <div style={S.panel}>
          {/* Cabecera */}
          <div style={S.header}>
            <div style={S.avatarSlot}>
              <AgentOrb size={38} accent={effAccent} mood={mood} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.title}>{effTitle}</div>
              <div style={S.subtitle}>
                <span style={S.dot} /> {subtitle}
              </div>
            </div>
            {/* Engranaje: la app anfitriona decide si se muestra
                (showSettings) — el widget nunca lo decide solo. Al pulsarlo:
                si la app dio `onOpenSettings`, manda ahí (su propia
                interfaz, a su manera). Si no, el widget abre SU PROPIO
                panel — habla con `${endpoint}/config` y compañía, que monta
                `bivoo-agent-widget/server` con una línea. Sin `showSettings`
                no aparece nada: el widget se ve igual que antes de esto. */}
            {showSettings && (
              <button
                aria-label="Configurar Bi-voo Agents"
                title="Configurar Bi-voo Agents"
                onClick={() => (onOpenSettings ? onOpenSettings() : setPanelPropio(true))}
                style={S.close}
              >
                <GearGlyph color="#6b7085" />
              </button>
            )}
            <button
              aria-label="Conversaciones anteriores"
              title="Conversaciones anteriores"
              onClick={() => (verHistorial ? setVerHistorial(false) : abrirHistorial())}
              style={S.close}
            >
              <HistoryGlyph color={verHistorial ? effAccent : "#6b7085"} />
            </button>
            <button aria-label="Cerrar" onClick={() => setOpen(false)} style={S.close}>
              <CloseGlyph color="#6b7085" />
            </button>
          </div>

          {/* Historial: se superpone a los mensajes mientras está abierto */}
          {verHistorial && (
            <div style={S.histPanel}>
              <button
                onClick={nuevaConversacion}
                style={{ ...S.histNueva, background: grad }}
              >
                <PlusGlyph color="#fff" />
                Nueva conversación
              </button>

              {convs === null && (
                <div style={S.histCargando}>
                  <AgentOrb size={40} accent={effAccent} mood="thinking" />
                  Buscando tus conversaciones…
                </div>
              )}

              {convs?.length === 0 && !histError && (
                <div style={S.histVacio}>
                  <AgentOrb size={46} accent={effAccent} mood="idle" />
                  <strong>Todavía no hay nada guardado</strong>
                  <span>
                    Cuando escribas, tus conversaciones quedarán aquí para que
                    puedas retomarlas cuando quieras.
                  </span>
                </div>
              )}

              {histError && <div style={S.histError}>{histError}</div>}

              {/* Agrupadas por fecha: es como la gente busca "lo de ayer". */}
              {convs &&
                convs.length > 0 &&
                agruparPorFecha(convs).map((grupo) => (
                  <div key={grupo.etiqueta} style={S.histGrupo}>
                    <div style={S.histGrupoTitulo}>{grupo.etiqueta}</div>

                    {grupo.items.map((c) => {
                      const actual = c.id === convId;
                      return (
                        <div
                          key={c.id}
                          className="agc-hist-item"
                          style={{
                            ...S.histItem,
                            ...(actual
                              ? {
                                  borderColor: effAccent,
                                  background: hexToRgba(effAccent, 0.05),
                                }
                              : null),
                          }}
                        >
                          {/* Barra lateral: marca la conversación abierta sin
                              robar sitio al texto. */}
                          <span
                            style={{
                              ...S.histBarra,
                              background: actual ? effAccent : "transparent",
                            }}
                          />

                          <button
                            onClick={() => cargarConversacion(c.id)}
                            style={S.histAbrir}
                          >
                            <span style={S.histTitulo}>{c.title}</span>
                            <span style={S.histMeta}>
                              {actual && (
                                <span
                                  style={{ ...S.histActual, color: effAccent }}
                                >
                                  En curso
                                </span>
                              )}
                              {c.mensajes}{" "}
                              {c.mensajes === 1 ? "mensaje" : "mensajes"} ·{" "}
                              {tiempoRelativo(c.updatedAt)}
                            </span>
                          </button>

                          <button
                            className="agc-trash"
                            aria-label={`Borrar la conversación "${c.title}"`}
                            title="Borrar"
                            onClick={() => borrarConversacion(c.id)}
                            style={S.histBorrar}
                          >
                            <TrashGlyph />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}

          {/* Mensajes (ocultos mientras se mira el historial) */}
          <div style={{ ...S.messages, ...(verHistorial ? S.oculto : null) }}>
            {messages.length === 0 && (
              <div style={S.empty}>
                <AgentOrb size={54} accent={effAccent} mood={mood} />
                ¿En qué te puedo ayudar?
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  ...S.bubble,
                  ...(m.role === "user"
                    ? { ...S.user, background: grad }
                    : S.assistant),
                  ...(m.suggestion ? S.suggestionBubble : null),
                }}
              >
                {m.suggestion && (
                  <div style={{ ...S.suggestionBadge, color: effAccent }}>
                    <SparkGlyph color={effAccent} /> Sugerencia
                  </div>
                )}
                <MessageContent
                  content={m.content}
                  role={m.role}
                  accent={effAccent}
                  // Solo el último mensaje puede ofrecer botones, y solo si
                  // no hay una respuesta en curso — un mensaje antiguo no
                  // debe poder "reactivarse" con un click tardío.
                  onQuickReply={
                    i === messages.length - 1 && !busy
                      ? (texto) => enviarTexto(texto, null)
                      : undefined
                  }
                />
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Preview de imagen adjunta */}
          {image && (
            <div style={S.imgPreviewRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="adjunto" style={S.imgPreview} />
              <button
                type="button"
                onClick={() => setImage(null)}
                style={S.imgRemove}
                aria-label="Quitar imagen"
              >
                <CloseGlyph color="#6b7085" />
              </button>
              <span style={S.imgHint}>Imagen lista para enviar</span>
            </div>
          )}

          {/* Input */}
          <form onSubmit={send} style={S.form}>
            {(allowImages || (allowVoice && speechSupported)) && (
              <div style={S.menuWrap} ref={menuRef}>
                {allowImages && (
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    style={{ display: "none" }}
                  />
                )}

                {menuOpen && (
                  <div style={S.popupMenu}>
                    {allowImages && (
                      <button type="button" onClick={pickImage} style={S.menuItem}>
                        <AttachGlyph color="#2a2c3a" /> Adjuntar imagen
                      </button>
                    )}
                    {allowVoice && speechSupported && (
                      <button type="button" onClick={toggleListen} style={S.menuItem}>
                        <MicGlyph color="#2a2c3a" /> Dictar por voz
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => (listening ? toggleListen() : setMenuOpen((v) => !v))}
                  style={{
                    ...S.iconBtn,
                    background: listening ? "#fee2e2" : accentTint,
                    borderColor: listening ? "#f7b8b8" : lighten(effAccent, 0.62),
                    color: listening ? "#dc2626" : iconColor,
                  }}
                  aria-label={
                    listening ? "Detener dictado" : menuOpen ? "Cerrar opciones" : "Más opciones"
                  }
                  title={listening ? "Detener dictado" : "Adjuntar o dictar"}
                >
                  {listening ? (
                    <MicGlyph pulsing color="#dc2626" />
                  ) : (
                    <PlusGlyph rotated={menuOpen} color={iconColor} />
                  )}
                </button>
              </div>
            )}

            <input
              style={{
                ...S.input,
                // Siempre presente: si se quitara al vaciar el campo, React
                // avisaría de que se retira una propiedad en pleno rerender.
                borderColor: input ? ring : "#e9eaf2",
              }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Escuchando…" : placeholder}
              disabled={busy}
            />
            {(() => {
              const inactivo = busy || (!input.trim() && !image);
              return (
                <button
                  type="submit"
                  aria-label="Enviar"
                  disabled={inactivo}
                  style={{
                    ...S.sendBtn,
                    // Inactivo: gris sólido en vez de degradado desvaído, así
                    // se lee como "aún no" y no como un botón roto.
                    background: inactivo ? "#e9eaf2" : grad,
                    cursor: inactivo ? "default" : "pointer",
                  }}
                >
                  <SendGlyph color={inactivo ? "#a9adbe" : "#fff"} />
                </button>
              );
            })()}
          </form>
        </div>
      )}

      {/* Nubecita: la sugerencia asoma sobre el botón, sin abrir el chat */}
      {!open && peek && (
        <div style={S.peekWrap} role="status">
          <div style={S.peekBubble} onClick={() => setOpen(true)}>
            <div style={{ ...S.peekHead, color: effAccent }}>
              <SparkGlyph color={effAccent} />
              <span style={{ flex: 1 }}>{effTitle}</span>
              <button
                aria-label="Descartar"
                onClick={(e) => {
                  e.stopPropagation();
                  setPeek(null);
                }}
                style={S.peekClose}
              >
                <CloseGlyph color="#9296a8" />
              </button>
            </div>
            <div style={S.peekText}>{peek}</div>
            <div style={{ ...S.peekCta, color: effAccent }}>
              Toca para responder
            </div>
          </div>
          <div style={S.peekTail} />
        </div>
      )}

      <div style={{ position: "relative" }}>
        <button
          /* En reposo se queda pequeño y tenue para no estorbar en la web del
             cliente; al acercar el ratón crece y se ve entero. Si hay una
             sugerencia sin leer NO se atenúa: ahí sí quiere que la mires. */
          className={[
            "agc-fab",
            open ? "abierto" : "",
            !open && (unread > 0 || peek) ? "reclama" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={open ? "Cerrar chat" : "Abrir chat"}
          onClick={() => setOpen((v) => !v)}
          style={{
            ...S.fab,
            // Cerrado: el orbe es el botón. Abierto: círculo con la X.
            background: open ? grad : "transparent",
            boxShadow: open ? S.fab.boxShadow : "none",
          }}
        >
          {open ? (
            <CloseGlyph color="#fff" />
          ) : (
            // Algo menor que el botón para que el halo no quede recortado.
            <AgentOrb size={52} accent={effAccent} mood={mood} />
          )}
        </button>
        {!open && unread > 0 && (
          <span style={S.unreadBadge} aria-label={`${unread} sugerencias nuevas`}>
            {unread}
          </span>
        )}
      </div>

      {panelPropio && (
        <SettingsPanel endpoint={endpoint} accent={effAccent} onClose={() => setPanelPropio(false)} />
      )}
    </div>
  );
}

/* ---------- render de contenido (texto o texto+imagen) ---------- */

function MessageContent({
  content,
  role,
  accent,
  onQuickReply,
}: {
  content: string | ContentPart[];
  role: Role;
  /** Color de los botones de sugerencia. Solo hace falta si `onQuickReply` está. */
  accent?: string;
  /** Presente = este es el último mensaje y se puede responder con un click.
   *  undefined = no se ofrecen botones (mensajes antiguos, o mientras responde). */
  onQuickReply?: (texto: string) => void;
}) {
  if (typeof content === "string") {
    if (!content) return <TypingDots />;
    // El texto del usuario se muestra literal, siempre: no tiene sentido
    // interpretarle Markdown a lo que él mismo escribió.
    if (role !== "assistant") return <>{content}</>;

    const { texto, opciones } = separarSugerencias(content);
    return (
      <>
        {bloques(texto, "m")}
        {onQuickReply && opciones.length > 0 && (
          <div style={S.quickReplies}>
            {opciones.map((op, idx) => (
              <button
                key={idx}
                type="button"
                style={{ ...S.quickReplyBtn, color: accent }}
                onClick={() => onQuickReply(op)}
              >
                {op}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }
  const text = content.find((p) => p.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  const image = content.find((p) => p.type === "image") as
    | { type: "image"; image: string }
    | undefined;
  return (
    <>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.image} alt="adjunto" style={S.msgImg} />
      )}
      {text?.text}
    </>
  );
}

/* ==========================================================================
   Panel de configuración incorporado

   Se usa cuando el engranaje está encendido (`showSettings`) pero la app
   anfitriona NO dio su propio `onOpenSettings` — es la vía de "cero código":
   instalas el widget, apuntas `endpoint` a una ruta montada con
   `createAgentRoutes()` (paquete `bivoo-agent-widget/server`), y ya hay
   panel de Conexión y de Herramientas, sin construir ni un formulario.

   Si la app SÍ da `onOpenSettings`, este componente ni se monta — la app
   tiene entonces control total (su propio look, sus propios pasos extra de
   verificación, etc.). Las dos vías conviven a propósito: una es "ya
   funciona", la otra es "a mi manera".

   Habla con `${endpoint}/config`, `/test-connection` y `/sync-tools` — los
   mismos sub-caminos que ya monta `createAgentRoutes()` bajo el mismo
   `endpoint` que usa el chat. Si el host no usa ese paquete de servidor,
   estas llamadas simplemente devuelven 404 y el panel lo dice con claridad
   en vez de fallar en silencio.
   ========================================================================== */

type ConexionMostrada = {
  enabled: boolean;
  gatewayUrl: string;
  appToken: string;
  hasAppToken: boolean;
  hasToolSecret: boolean;
};

function SettingsPanel({
  endpoint,
  accent,
  onClose,
}: {
  endpoint: string;
  accent: string;
  onClose: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [appToken, setAppToken] = useState("");
  // Sin `setEnabled`: se MUESTRA, no se edita desde aquí. Editable solo
  // fuera del widget (ver el aviso donde se pinta más abajo) — si este
  // panel pudiera apagar al agente, se escondería a sí mismo con él.
  const [enabled, setEnabled_] = useState(true);
  const [hasAppToken, setHasAppToken] = useState(false);

  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; detalle: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msgGuardar, setMsgGuardar] = useState("");

  const [specUrl, setSpecUrl] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<{ ok: boolean; detalle: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`${endpoint}/config`);
      if (r.status === 404) {
        setNoDisponible(true);
        return;
      }
      if (!r.ok) return; // 401/501: sin permiso o sin requireAdmin — se ve en resultadoPrueba al intentar algo
      const d = await r.json();
      const c: ConexionMostrada | null = d?.conexion ?? null;
      if (c) {
        setGatewayUrl(c.gatewayUrl ?? "");
        setEnabled_(c.enabled ?? true);
        setHasAppToken(Boolean(c.hasAppToken));
      }
    } catch {
      setNoDisponible(true);
    } finally {
      setCargando(false);
    }
  }, [endpoint]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function probar() {
    setProbando(true);
    setResultadoPrueba(null);
    try {
      const r = await fetch(`${endpoint}/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayUrl, appToken: appToken || undefined }),
      });
      setResultadoPrueba(await r.json());
    } catch {
      setResultadoPrueba({ ok: false, detalle: "No se pudo conectar" });
    } finally {
      setProbando(false);
    }
  }

  async function guardarConexion(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMsgGuardar("");
    try {
      // Sin `enabled`: apagarlo desde aquí escondería el propio panel que lo
      // reactivaría. Para eso está la app anfitriona (fuera del widget), o
      // el propio panel del gateway.
      const r = await fetch(`${endpoint}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayUrl, appToken: appToken || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsgGuardar(d?.detalle || "No se pudo guardar");
        return;
      }
      setAppToken(""); // el campo vuelve a quedar vacío: lo guardado ya no hace falta reescribirlo
      setMsgGuardar("Guardado.");
      cargar();
    } catch {
      setMsgGuardar("No se pudo conectar");
    } finally {
      setGuardando(false);
    }
  }

  async function sincronizar(e: React.FormEvent) {
    e.preventDefault();
    setSincronizando(true);
    setResultadoSync(null);
    try {
      const r = await fetch(`${endpoint}/sync-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specUrl }),
      });
      setResultadoSync(await r.json());
    } catch {
      setResultadoSync({ ok: false, detalle: "No se pudo conectar" });
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div style={S.settingsBackdrop} onClick={onClose}>
      <div style={S.settingsCard} onClick={(e) => e.stopPropagation()}>
        <div style={S.settingsHead}>
          <h3 style={S.settingsTitle}>Configuración del agente</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
          >
            <CloseGlyph color="#8b8fa3" />
          </button>
        </div>

        {cargando ? (
          <TypingDots />
        ) : noDisponible ? (
          <p style={S.settingsHint}>
            Este widget no encontró <code>{endpoint}/config</code>. Si tu servidor no usa{" "}
            <code>bivoo-agent-widget/server</code>, este panel no tiene con qué hablar — usa{" "}
            <code>onOpenSettings</code> para mostrar tu propia interfaz en su lugar.
          </p>
        ) : (
          <>
            <form onSubmit={guardarConexion} style={S.settingsSection}>
              <h4 style={S.settingsSectionTitle}>Conexión</h4>

              <div style={S.settingsField}>
                <label style={S.settingsLabel}>URL del gateway</label>
                <input
                  style={S.settingsInput}
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  placeholder="https://agente.tu-dominio.com"
                />
              </div>

              <div style={S.settingsField}>
                <label style={S.settingsLabel}>App Token</label>
                <input
                  style={S.settingsInput}
                  type="password"
                  value={appToken}
                  onChange={(e) => setAppToken(e.target.value)}
                  placeholder={hasAppToken ? "•••••••••••••••• (sin cambios)" : "app_..."}
                  autoComplete="off"
                />
                <p style={S.settingsHint}>
                  {hasAppToken
                    ? "Ya hay uno guardado. Déjalo en blanco para conservarlo."
                    : "Lo consigues en tu panel del gateway → el agente → Desarrollo → appToken."}
                </p>
              </div>

              {/* Se muestra, no se edita: encender/apagar el agente desde
                  ESTE panel escondería el propio panel junto con él. Se
                  cambia desde fuera del widget — la app anfitriona o el
                  panel del gateway. */}
              <div style={{ ...S.settingsRow, marginBottom: 12, justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, color: "#4b4f63" }}>
                  {enabled ? "🟢 Agente activo" : "⚪ Agente apagado"}
                </span>
                <span style={{ fontSize: 11.5, color: "#8b8fa3" }}>Se cambia fuera de aquí</span>
              </div>

              <div style={S.settingsRow}>
                <button
                  type="button"
                  onClick={probar}
                  disabled={probando || !gatewayUrl}
                  style={{ ...S.settingsBtnGhost, opacity: probando || !gatewayUrl ? 0.6 : 1 }}
                >
                  {probando ? "Probando…" : "Probar conexión"}
                </button>
                <button
                  type="submit"
                  disabled={guardando || !gatewayUrl}
                  style={{ ...S.settingsBtn, background: accent, opacity: guardando ? 0.7 : 1 }}
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>

              {resultadoPrueba && (
                <div style={resultadoPrueba.ok ? S.settingsResultOk : S.settingsResultErr}>
                  {resultadoPrueba.detalle}
                </div>
              )}
              {msgGuardar && (
                <p style={S.settingsHint}>{msgGuardar}</p>
              )}
            </form>

            {hasAppToken && (
              <form onSubmit={sincronizar} style={S.settingsSection}>
                <h4 style={S.settingsSectionTitle}>Herramientas</h4>
                <div style={S.settingsField}>
                  <label style={S.settingsLabel}>URL de tu Swagger/OpenAPI (JSON)</label>
                  <input
                    style={S.settingsInput}
                    value={specUrl}
                    onChange={(e) => setSpecUrl(e.target.value)}
                    placeholder="https://tu-dominio.com/api/openapi"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sincronizando || !specUrl}
                  style={{ ...S.settingsBtn, background: accent, opacity: sincronizando ? 0.7 : 1 }}
                >
                  {sincronizando ? "Sincronizando…" : "Sincronizar"}
                </button>
                {resultadoSync && (
                  <div style={resultadoSync.ok ? S.settingsResultOk : S.settingsResultErr}>
                    {resultadoSync.detalle}
                    {resultadoSync.ok && (
                      <>
                        <br />
                        Recién importadas quedan desactivadas salvo que sean de solo lectura — actívalas desde el
                        panel del gateway.
                      </>
                    )}
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- iconos (SVG inline, sin dependencias) ---------- */

function CloseGlyph({ color = "#4b4f63" }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Reloj con flecha atrás: el icono habitual de "conversaciones anteriores". */
function HistoryGlyph({ color = "#4b4f63" }: { color?: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12a9 9 0 1 0 3-6.7L3 8"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 4v4h4" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.5V12l3 1.8" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Papelera. El color lo pone la clase `.agc-trash` del <style> del widget, no
 * un prop: así puede cambiar en :hover, que los estilos inline no permiten.
 */
function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendGlyph({ color = "#fff" }: { color?: string }) {
  // Flecha hacia arriba: es el gesto de "enviar" más reconocible y se lee
  // bien incluso a tamaño pequeño.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 20V5" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="M5.5 11.5 12 5l6.5 6.5"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Engranaje de configuración — visible solo si la app anfitriona lo decide. */
function GearGlyph({ color = "#4b4f63" }: { color?: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusGlyph({ rotated, color = "#363a52" }: { rotated?: boolean; color?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transition: "transform 0.18s",
        transform: rotated ? "rotate(45deg)" : "none",
      }}
    >
      <path
        d="M12 5.5v13M5.5 12h13"
        stroke={color}
        strokeWidth="2.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- Orbe animado del asistente ---------- */

export type OrbMood =
  | "idle"
  | "thinking"
  | "talking"
  | "happy"
  // --- animaciones de "vida" cuando nadie lo usa ---
  | "sleeping"
  | "eating"
  | "chatting" // habla solo
  | "studying";

/** Las que se pueden activar desde el panel. */
export const IDLE_MOODS = ["sleeping", "eating", "chatting", "studying"] as const;

/**
 * Avatar del agente: una esfera con ojos que siguen el puntero, parpadean y
 * cambian de expresión según lo que esté haciendo.
 *
 * Se usa tanto en el botón flotante como en la cabecera, para que las
 * expresiones no se pierdan al abrir el chat.
 */
/**
 * Avatar del agente.
 *
 * Geometría: lienzo 120×120, esfera centrada en (60,62) con radio 38.
 * Las manos se dibujan DESPUÉS del cuerpo para que nunca queden ocultas
 * detrás de él (antes desaparecían al acercarlas a la cara).
 */
export function AgentOrb({
  size,
  accent,
  mood = "idle",
  animDelay,
}: {
  size: number;
  accent: string;
  mood?: OrbMood;
  animDelay?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0, dx: 0, dy: 0 });
  const [cerca, setCerca] = useState(false);
  const [blink, setBlink] = useState(false);
  const id = useId().replace(/:/g, "");

  // Seguimiento del puntero: la mirada llega más lejos que antes y, si el
  // puntero se acerca, el agente intenta atraparlo con las manos.
  useEffect(() => {
    function move(clientX: number, clientY: number) {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const alcance = Math.min(1, dist / 170); // se satura antes: reacciona más
      const max = 6.5; // recorrido del ojo dentro del lienzo
      setLook({
        x: (dx / dist) * max * alcance,
        y: (dy / dist) * max * alcance,
        dx: dx / dist,
        dy: dy / dist,
      });
      // "Cerca" en proporción al tamaño dibujado, no en píxeles fijos.
      setCerca(dist < Math.max(90, r.width * 1.25));
    }
    const onMouse = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, []);

  // Parpadeo a intervalos irregulares.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const programar = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 130);
          programar();
        },
        2600 + Math.random() * 3800,
      );
    };
    programar();
    return () => clearTimeout(t);
  }, []);

  const claro = lighten(accent, 0.55);
  const muyClaro = lighten(accent, 0.82);
  const oscuro = darken(accent, 0.3);

  const dormido = mood === "sleeping";
  const comiendo = mood === "eating";
  const pensando = mood === "thinking";
  const estudiando = mood === "studying";
  const hablando = mood === "talking" || mood === "chatting";
  const contento = mood === "happy";
  /** Intenta atrapar el puntero: solo en reposo, para no pisar otras animaciones. */
  const atrapando = cerca && (mood === "idle" || contento);

  // Hacia dónde miran los ojos.
  const mirada = pensando
    ? { x: 3, y: -3.4 } // hacia arriba, recordando
    : estudiando
      ? { x: 0, y: 3.4 } // al libro
      : comiendo
        ? { x: -2, y: 2.4 } // a la crispeta
        : look;

  const ojosCerrados = blink || dormido;
  const ojosFelices = (contento || comiendo) && !blink;
  const ojoAlto = ojosCerrados ? 3 : 19; // más grandes que antes
  const ojoAncho = 8;

  const ANIMACIONES: Record<OrbMood, string> = {
    idle: "agc-orb-idle 5s ease-in-out infinite",
    thinking: "agc-orb-think 2.6s ease-in-out infinite",
    talking: "agc-orb-talk 0.9s ease-in-out infinite",
    happy: "agc-orb-party 0.7s ease-in-out infinite",
    sleeping: "agc-orb-sleep 4.5s ease-in-out infinite",
    eating: "agc-orb-idle 3s ease-in-out infinite",
    chatting: "agc-orb-talk 1.1s ease-in-out infinite",
    studying: "agc-orb-study 3.2s ease-in-out infinite",
  };

  /* ---------- manos ---------- */

  // En reposo descansan a los lados; si el puntero se acerca, se estiran
  // hacia él como si fueran a agarrarlo.
  const alcanceX = atrapando ? look.dx * 16 : 0;
  const alcanceY = atrapando ? look.dy * 16 : 0;

  const manoIzq = dormido
    ? { x: 26, y: 98, r: 24 }
    : comiendo
      ? { x: 26, y: 92, r: 0 } // sujeta el balde
      : estudiando
        ? { x: 34, y: 100, r: 16 } // sostiene el libro
        : contento
          ? { x: 20, y: 52, r: -34 } // brazo arriba
          : { x: 20 + alcanceX, y: 84 + alcanceY, r: atrapando ? -18 : 0 };

  const manoDer = dormido
    ? { x: 94, y: 98, r: -24 }
    : pensando
      ? { x: 88, y: 30, r: -20 } // rascándose la cabeza
      : estudiando
        ? { x: 86, y: 100, r: -16 }
        : contento
          ? { x: 100, y: 52, r: 34 }
          : { x: 100 + alcanceX, y: 84 + alcanceY, r: atrapando ? 18 : 0 };

  const animIzq = contento
    ? "agc-wave-l 0.45s ease-in-out infinite"
    : hablando
      ? "agc-gesture-l 0.9s ease-in-out infinite"
      : "none";

  const animDer = contento
    ? "agc-wave-r 0.45s ease-in-out infinite"
    : pensando
      ? "agc-scratch 0.7s ease-in-out infinite"
      : hablando
        ? "agc-gesture-r 1.1s ease-in-out infinite"
        : "none";

  const Mano = ({
    p,
    anim,
    origen,
  }: {
    p: { x: number; y: number; r: number };
    anim: string;
    origen: string;
  }) => (
    <g style={{ animation: anim, transformOrigin: origen }}>
      <ellipse
        cx={p.x}
        cy={p.y}
        rx="9"
        ry="8.5"
        fill={`url(#hand${id})`}
        transform={`rotate(${p.r} ${p.x} ${p.y})`}
        style={{ transition: "cx 0.25s ease-out, cy 0.25s ease-out" }}
      />
    </g>
  );

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ display: "block", animation: ANIMACIONES[mood], animationDelay: animDelay ?? "0s", overflow: "visible" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes agc-orb-idle {
          0%,100% { transform: translateY(0)     scale(1); }
          50%     { transform: translateY(-2.5%) scale(1.02); }
        }
        @keyframes agc-orb-think {
          0%,100% { transform: rotate(-3deg); }
          50%     { transform: rotate(3deg); }
        }
        @keyframes agc-orb-talk {
          0%,100% { transform: scale(1)          rotate(0deg); }
          30%     { transform: scale(1.04,0.97)  rotate(-2deg); }
          60%     { transform: scale(0.98,1.03)  rotate(2deg); }
        }
        /* feliz: salta y se contonea con todo el cuerpo */
        @keyframes agc-orb-party {
          0%,100% { transform: translateY(0)    rotate(-6deg) scale(1); }
          25%     { transform: translateY(-11%) rotate(0deg)  scale(1.06); }
          50%     { transform: translateY(0)    rotate(6deg)  scale(0.97); }
          75%     { transform: translateY(-7%)  rotate(0deg)  scale(1.03); }
        }
        @keyframes agc-orb-sleep {
          0%,100% { transform: translateY(0)  scale(1); }
          50%     { transform: translateY(4%) scale(0.97,1.03); }
        }
        @keyframes agc-orb-study {
          0%,100% { transform: rotate(-5deg); }
          50%     { transform: rotate(5deg); }
        }

        /* --- manos --- */
        @keyframes agc-scratch {
          0%,100% { transform: translate(0,0)      rotate(0deg); }
          50%     { transform: translate(-4%,2%)   rotate(-14deg); }
        }
        @keyframes agc-wave-l {
          0%,100% { transform: rotate(-16deg); }
          50%     { transform: rotate(10deg); }
        }
        @keyframes agc-wave-r {
          0%,100% { transform: rotate(16deg); }
          50%     { transform: rotate(-10deg); }
        }
        @keyframes agc-gesture-l {
          0%,100% { transform: translateY(0)   rotate(0deg); }
          50%     { transform: translateY(-7%) rotate(-12deg); }
        }
        @keyframes agc-gesture-r {
          0%,100% { transform: translateY(-5%) rotate(8deg); }
          50%     { transform: translateY(0)   rotate(-6deg); }
        }

        /* --- comer: coge crispeta, la lleva a la boca, mastica --- */
        @keyframes agc-eat-hand {
          0%,  18% { transform: translate(0, 0); }          /* en el balde */
          38%, 62% { transform: translate(26px, -14px); }   /* en la boca */
          82%,100% { transform: translate(0, 0); }
        }
        @keyframes agc-eat-kernel {
          0%,  14% { opacity: 0; }
          20%, 55% { opacity: 1; }
          60%,100% { opacity: 0; }                          /* se la come */
        }
        @keyframes agc-chew {
          0%,  45% { transform: scaleY(0.55); }
          60%      { transform: scaleY(1.25); }
          72%      { transform: scaleY(0.6); }
          85%      { transform: scaleY(1.15); }
          95%,100% { transform: scaleY(0.55); }
        }

        /* --- hablar: boca y ojos en movimiento --- */
        @keyframes agc-mouth-talk {
          0%,100% { transform: scaleY(0.4); }
          50%     { transform: scaleY(1.4); }
        }
        @keyframes agc-eyes-dart {
          0%,100% { transform: translateX(0); }
          25%     { transform: translateX(-2.5px); }
          65%     { transform: translateX(2.5px); }
        }

        /* --- dormir --- */
        @keyframes agc-z {
          0%   { opacity: 0;   transform: translate(0,6px)     scale(0.6) rotate(-8deg); }
          25%  { opacity: 1; }
          100% { opacity: 0;   transform: translate(14px,-26px) scale(1.5) rotate(10deg); }
        }

        /* --- estudiar: pasar páginas --- */
        @keyframes agc-page {
          0%,  55% { transform: scaleX(1);    opacity: 1; }
          75%      { transform: scaleX(0.05); opacity: 0.85; }
          80%,100% { transform: scaleX(1);    opacity: 1; }
        }
        @keyframes agc-cloud-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-8%); }
        }
        @keyframes agc-code-cycle {
          0%, 32%   { opacity: 1; }
          34%, 100% { opacity: 0; }
        }
        @keyframes agc-study-blink {
          0%,100% { opacity: 0.25; }
          50%     { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          [style*="agc-"] { animation: none !important; }
        }
      `}</style>

      <defs>
        <radialGradient id={`body${id}`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="34%" stopColor={claro} />
          <stop offset="76%" stopColor={accent} />
          <stop offset="100%" stopColor={accent} />
        </radialGradient>
        <radialGradient id={`base${id}`} cx="50%" cy="88%" r="52%">
          <stop offset="0%" stopColor={muyClaro} stopOpacity="0.9" />
          <stop offset="100%" stopColor={muyClaro} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`hand${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={lighten(accent, 0.65)} />
          <stop offset="100%" stopColor={accent} />
        </radialGradient>
        <clipPath id={`clip${id}`}>
          <circle cx="60" cy="62" r="38" />
        </clipPath>
      </defs>

      <circle cx="60" cy="64" r="45" fill={`url(#glow${id})`} />

      {/* ---------- cuerpo ---------- */}
      <circle cx="60" cy="62" r="38" fill={`url(#body${id})`} />
      <circle cx="60" cy="62" r="38" fill={`url(#base${id})`} clipPath={`url(#clip${id})`} />
      <ellipse cx="48" cy="43" rx="13" ry="9" fill="#fff" opacity="0.55" transform="rotate(-25 48 43)" />

      {/* ---------- ojos ---------- */}
      <g
        transform={`translate(${mirada.x} ${mirada.y})`}
        style={{
          transition: "transform 0.13s ease-out",
          animation: hablando ? "agc-eyes-dart 1.4s ease-in-out infinite" : "none",
        }}
      >
        {ojosFelices ? (
          <>
            <path d="M41 65 Q49 55 57 65" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" fill="none" />
            <path d="M63 65 Q71 55 79 65" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" fill="none" />
          </>
        ) : dormido ? (
          <>
            <path d="M41 60 Q49 68 57 60" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M63 60 Q71 68 79 60" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            {[45, 67].map((x) => (
              <rect
                key={x}
                x={x}
                y={62 - ojoAlto / 2}
                width={ojoAncho}
                height={ojoAlto}
                rx={ojoAncho / 2}
                fill="#fff"
                style={{ transition: "height 0.09s, y 0.09s" }}
              />
            ))}
          </>
        )}
      </g>

      {/* ---------- boca ---------- */}
      {(comiendo || hablando) && (
        <ellipse
          cx="60"
          cy="82"
          rx={comiendo ? 7.5 : 5.5}
          ry={comiendo ? 5.5 : 4}
          fill="#fff"
          opacity="0.92"
          style={{
            animation: comiendo
              ? "agc-chew 1.9s ease-in-out infinite"
              : "agc-mouth-talk 0.4s ease-in-out infinite",
            transformOrigin: "60px 82px",
          }}
        />
      )}

      {/* ---------- manos (delante del cuerpo: nunca se esconden) ---------- */}
      {!comiendo && (
        <>
          <Mano p={manoIzq} anim={animIzq} origen={`${manoIzq.x}px ${manoIzq.y}px`} />
          <Mano p={manoDer} anim={animDer} origen={`${manoDer.x}px ${manoDer.y}px`} />
        </>
      )}

      {/* ---------- comiendo: balde + dos manos ---------- */}
      {comiendo && (
        <>
          {/* balde de crispetas */}
          <g>
            <circle cx="16" cy="86" r="4.2" fill="#fff8e1" />
            <circle cx="23" cy="83" r="4.8" fill="#fffdf5" />
            <circle cx="30" cy="86" r="3.8" fill="#fff8e1" />
            <path d="M11 88 L15 106 L31 106 L35 88 Z" fill="#e94b4b" />
            <path d="M18.4 88 L20.6 106 L24.2 106 L22.8 88 Z" fill="#fff" opacity="0.95" />
            <path d="M28.5 88 L27 106 L29.6 106 L32 88 Z" fill="#fff" opacity="0.95" />
            <rect x="10" y="86" width="26" height="4" rx="1.6" fill="#c93b3b" />
          </g>

          {/* mano izquierda: delante del balde, se ve que lo sujeta */}
          <Mano p={{ x: 14, y: 100, r: 12 }} anim="none" origen="14px 100px" />

          {/* mano derecha: va del balde a la boca, una crispeta cada vez */}
          <g style={{ animation: "agc-eat-hand 1.9s ease-in-out infinite" }}>
            <ellipse cx="36" cy="90" rx="9" ry="8.5" fill={`url(#hand${id})`} />
            <circle
              cx="38"
              cy="83"
              r="3.6"
              fill="#fff8e1"
              style={{ animation: "agc-eat-kernel 1.9s ease-in-out infinite" }}
            />
          </g>
        </>
      )}

      {/* ---------- zZz al dormir (en su color, bien visibles) ---------- */}
      {dormido && (
        <g fill={oscuro} fontWeight="800" fontFamily={FONT}>
          <text x="90" y="36" fontSize="20" style={{ animation: "agc-z 3s ease-out infinite" }}>z</text>
          <text x="99" y="26" fontSize="15" style={{ animation: "agc-z 3s ease-out 1s infinite" }}>z</text>
          <text x="106" y="18" fontSize="11" style={{ animation: "agc-z 3s ease-out 2s infinite" }}>z</text>
        </g>
      )}

      {/* ---------- nubecita al pensar ---------- */}
      {pensando && <Nube id={id} color={oscuro} contenido="codigo" />}

      {/* ---------- estudiar: nubecita + libro con páginas ---------- */}
      {estudiando && (
        <>
          <Nube id={id} color={oscuro} contenido="idea" />
          <g>
            {/* tapas */}
            <path d="M38 100 L60 96 L60 114 L38 118 Z" fill="#fff" />
            <path d="M82 100 L60 96 L60 114 L82 118 Z" fill="#f1f1f7" />
            {/* página que se pasa */}
            <path
              d="M60 96 L80 100 L80 113 L60 110 Z"
              fill="#fafafe"
              style={{ animation: "agc-page 2.6s ease-in-out infinite", transformOrigin: "60px 104px" }}
            />
            <path d="M60 96 L60 114" stroke={oscuro} strokeWidth="1.5" opacity="0.55" />
            <path d="M43 105 H55 M43 109 H54" stroke={oscuro} strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
          </g>
        </>
      )}
    </svg>
  );
}

/** Nubecita de pensamiento sobre la cabeza. */
function Nube({
  id,
  color,
  contenido,
}: {
  id: string;
  color: string;
  contenido: "codigo" | "idea";
}) {
  return (
    <g style={{ animation: "agc-cloud-float 2.6s ease-in-out infinite" }}>
      <circle cx="86" cy="36" r="2.6" fill="#fff" opacity="0.9" />
      <circle cx="93" cy="28" r="3.6" fill="#fff" opacity="0.95" />
      <g>
        <ellipse cx="98" cy="14" rx="16" ry="10.5" fill="#fff" />
        <ellipse cx="86" cy="17" rx="8" ry="6.5" fill="#fff" />
        <ellipse cx="110" cy="17" rx="7.5" ry="6" fill="#fff" />
      </g>

      {contenido === "codigo" ? (
        <g fontFamily="ui-monospace, monospace" fontSize="9.5" fontWeight="700" fill={color}>
          <text x="98" y="17.5" textAnchor="middle" style={{ animation: "agc-code-cycle 1.8s steps(1) infinite" }}>
            {"</>"}
          </text>
          <text x="98" y="17.5" textAnchor="middle" opacity="0" style={{ animation: "agc-code-cycle 1.8s steps(1) 0.6s infinite" }}>
            {"{ }"}
          </text>
          <text x="98" y="17.5" textAnchor="middle" opacity="0" style={{ animation: "agc-code-cycle 1.8s steps(1) 1.2s infinite" }}>
            {"01"}
          </text>
        </g>
      ) : (
        /* bombilla de idea */
        <g style={{ animation: "agc-study-blink 1.8s ease-in-out infinite" }}>
          <circle cx="98" cy="12" r="5" fill="#f5b93c" />
          <rect x="95.6" y="16.5" width="4.8" height="3.4" rx="1.2" fill={color} opacity="0.75" />
          <path d="M98 4.5 V1.5 M92 7 L90 5 M104 7 L106 5" stroke="#f5b93c" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function SparkGlyph({ color = "#363a52" }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4L12 3z"
        fill={color}
      />
    </svg>
  );
}

function AttachGlyph({ color = "#2a2c3a" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M17.5 8.5 9.4 16.6a3 3 0 0 1-4.24-4.24l8.1-8.1a2 2 0 0 1 2.83 2.83l-7.6 7.6a1 1 0 0 1-1.42-1.41l6.9-6.9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicGlyph({ pulsing, color = "#2a2c3a" }: { pulsing?: boolean; color?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={pulsing ? { animation: "agc-pulse 1.1s infinite" } : undefined}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth="2" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <style>{`@keyframes agc-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </svg>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#c3c6d4",
            display: "inline-block",
            animation: `agc-bounce 1s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes agc-bounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </span>
  );
}

const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const S: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 2147483000,
    fontFamily: FONT,
  },
  fab: {
    padding: 0,
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(80, 60, 200, 0.36)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "absolute",
    right: 0,
    bottom: 74,
    width: 374,
    maxWidth: "calc(100vw - 44px)",
    height: 560,
    maxHeight: "calc(100vh - 130px)",
    background: "#ffffff",
    color: "#1b1c28",
    border: "1px solid #ecedf5",
    borderRadius: 20,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 24px 60px rgba(30, 25, 80, 0.22)",
  },
  header: {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 11,
    borderBottom: "1px solid #f0f1f7",
    background: "#ffffff",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 19,
    boxShadow: "0 4px 12px rgba(80, 60, 200, 0.28)",
  },
  /** Hueco del orbe en la cabecera (sin fondo: el orbe ya es la figura). */
  avatarSlot: {
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1b1c28",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subtitle: {
    fontSize: 12,
    color: "#8a8fa3",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#22c55e",
    display: "inline-block",
  },
  close: {
    padding: 0,
    background: "#f4f5fb",
    border: "none",
    color: "#6b7085",
    width: 30,
    height: 30,
    borderRadius: 9,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#fbfbfe",
  },
  empty: {
    color: "#8a8fa3",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },
  // OJO: las cuatro esquinas van SUELTAS, sin usar `borderRadius`.
  //
  // Las burbujas del usuario y del agente pisan una esquina cada una para
  // hacer el "pico". Si la base usara la forma corta `borderRadius`, al
  // cambiar el papel de una burbuja entre renders React vería desaparecer la
  // esquina suelta mientras la corta sigue puesta, y avisa de que eso produce
  // estilos impredecibles. Es la misma trampa que ya nos pasó con `border` y
  // `borderColor` en el input.
  bubble: {
    padding: "10px 13px",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    // El borde también suelto y siempre presente: la burbuja de sugerencia
    // solo cambia `borderStyle`, y si la base usara `border` esa propiedad
    // aparecería y desaparecería entre renders.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    maxWidth: "86%",
    wordBreak: "break-word",
  },
  user: {
    color: "#fff",
    alignSelf: "flex-end",
    borderBottomRightRadius: 5,
    boxShadow: "0 6px 16px rgba(80, 60, 200, 0.24)",
  },
  assistant: {
    background: "#ffffff",
    borderColor: "#ecedf5",
    color: "#2a2c3a",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 5,
    boxShadow: "0 3px 12px rgba(30, 25, 80, 0.05)",
  },
  msgImg: {
    display: "block",
    maxWidth: "100%",
    borderRadius: 10,
    marginBottom: 6,
  },
  mdList: {
    margin: "4px 0",
    paddingLeft: 20,
  },
  mdCode: {
    background: "rgba(0,0,0,0.06)",
    borderRadius: 4,
    padding: "1px 5px",
    fontSize: "0.92em",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  mdLink: {
    color: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  // --- sugerencias rápidas (%% opción | opción) ---
  quickReplies: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  quickReplyBtn: {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1.5px solid currentColor",
    background: "transparent",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.3,
  },
  // --- panel de configuración incorporado (gear sin onOpenSettings) ---
  settingsBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 20, 40, 0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2147483000, // por encima de casi cualquier cosa de la página anfitriona
    padding: 16,
  },
  settingsCard: {
    width: 400,
    maxWidth: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(20, 20, 50, 0.28)",
    padding: 22,
  },
  settingsHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: 750,
    color: "#1b1c28",
    margin: 0,
  },
  settingsSection: {
    marginBottom: 18,
  },
  settingsSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#8b8fa3",
    margin: "0 0 10px",
  },
  settingsLabel: {
    display: "block",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#4b4f63",
    marginBottom: 5,
  },
  settingsField: {
    marginBottom: 12,
  },
  settingsInput: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid #e2e3ee",
    fontSize: 13.5,
    fontFamily: "inherit",
    color: "#1b1c28",
    background: "#fbfbfd",
    boxSizing: "border-box",
  },
  settingsHint: {
    fontSize: 11.5,
    color: "#8b8fa3",
    margin: "5px 0 0",
    lineHeight: 1.5,
  },
  settingsRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  settingsBtn: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
  },
  settingsBtnGhost: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid #e2e3ee",
    background: "#fff",
    color: "#4b4f63",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
  },
  settingsResultOk: {
    marginTop: 10,
    padding: "8px 11px",
    borderRadius: 10,
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
    fontSize: 12.5,
    lineHeight: 1.5,
  },
  settingsResultErr: {
    marginTop: 10,
    padding: "8px 11px",
    borderRadius: 10,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 12.5,
    lineHeight: 1.5,
  },
  suggestionBubble: {
    borderStyle: "dashed",
    background: "#fcfcff",
  },
  suggestionBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 5,
  },
  // --- nubecita de sugerencia sobre el botón ---
  peekWrap: {
    position: "absolute",
    right: 0,
    bottom: 72,
    width: 300,
    maxWidth: "calc(100vw - 44px)",
    animation: "agc-peek-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2)",
  },
  peekBubble: {
    background: "#fff",
    border: "1px solid #ecedf5",
    borderRadius: 16,
    padding: "12px 14px",
    boxShadow: "0 14px 36px rgba(30, 25, 80, 0.20)",
    cursor: "pointer",
  },
  peekHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 6,
  },
  peekClose: {
    background: "transparent",
    border: "none",
    padding: 0,
    width: 18,
    height: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  peekText: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "#2a2c3a",
    // Si el mensaje es largo, se recorta: el resto se lee al abrir el chat.
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  peekCta: {
    fontSize: 11.5,
    fontWeight: 600,
    marginTop: 8,
  },
  peekTail: {
    position: "absolute",
    right: 22,
    bottom: -6,
    width: 12,
    height: 12,
    background: "#fff",
    borderRight: "1px solid #ecedf5",
    borderBottom: "1px solid #ecedf5",
    transform: "rotate(45deg)",
  },
  unreadBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 21,
    height: 21,
    padding: "0 6px",
    borderRadius: 999,
    background: "#dc2626",
    color: "#fff",
    fontSize: 11.5,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid #fff",
    pointerEvents: "none",
  },
  imgPreviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 13px",
    borderTop: "1px solid #f0f1f7",
    background: "#fbfbfe",
  },
  imgPreview: {
    width: 40,
    height: 40,
    objectFit: "cover",
    borderRadius: 8,
    border: "1px solid #e9eaf2",
  },
  imgRemove: {
    padding: 0,
    background: "#f4f5fb",
    border: "none",
    color: "#6b7085",
    width: 24,
    height: 24,
    borderRadius: 7,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  imgHint: {
    fontSize: 12,
    color: "#8a8fa3",
  },

  /* ---------- Historial (F8) ---------- */
  oculto: { display: "none" },
  histPanel: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "#fafaff",
  },
  histNueva: {
    padding: "11px 14px",
    color: "#fff",
    border: "none",
    borderRadius: 13,
    fontSize: 13.5,
    fontWeight: 650,
    cursor: "pointer",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 6,
    boxShadow: "0 4px 14px rgba(60, 50, 160, .22)",
  },
  histGrupo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 8,
  },
  histGrupoTitulo: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "#9aa0b4",
    padding: "0 2px",
  },
  histItem: {
    display: "flex",
    alignItems: "stretch",
    background: "#fff",
    // Suelto: la conversación en curso sobrescribe solo el color.
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "#ebecf4",
    borderRadius: 13,
    overflow: "hidden",
  },
  /** Barra de color a la izquierda: marca la conversación abierta. */
  histBarra: {
    width: 3,
    flexShrink: 0,
  },
  histAbrir: {
    flex: 1,
    minWidth: 0,
    padding: "11px 6px 11px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  histTitulo: {
    fontSize: 13,
    fontWeight: 600,
    color: "#2b2d3c",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    lineHeight: 1.35,
  },
  histMeta: {
    fontSize: 11,
    color: "#9095a8",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  histActual: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
  },
  histCargando: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "34px 10px",
    fontSize: 12.5,
    color: "#8a8fa3",
  },
  histVacio: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 7,
    padding: "30px 18px",
    fontSize: 12,
    lineHeight: 1.55,
    color: "#8a8fa3",
  },
  histError: {
    padding: "12px 14px",
    background: "#fdf3f3",
    border: "1px solid #f3d4d4",
    borderRadius: 12,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "#9b3a3a",
  },
  histBorrar: {
    padding: 0,
    width: 36,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 0,
  },
  form: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderTop: "1px solid #f0f1f7",
    background: "#fff",
  },
  iconBtn: {
    padding: 0,
    background: "#f4f5fb",
    // Separadas, porque el color de borde se sobrescribe según el estado.
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "#e9eaf2",
    color: "#6b7085",
    borderRadius: 13,
    width: 46,
    height: 46,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuWrap: {
    position: "relative",
    flexShrink: 0,
  },
  popupMenu: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: 0,
    background: "#fff",
    border: "1px solid #ecedf5",
    borderRadius: 14,
    boxShadow: "0 12px 28px rgba(20, 20, 40, 0.16)",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 190,
  },
  menuItem: {
    background: "transparent",
    border: "none",
    boxShadow: "none",
    color: "#2a2c3a",
    fontSize: 13.5,
    fontWeight: 500,
    padding: "9px 10px",
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  input: {
    flex: 1,
    height: 46,
    background: "#f4f5fb",
    color: "#1b1c28",
    // Propiedades separadas en vez del atajo `border`: el color cambia al
    // escribir, y mezclar el atajo con una propiedad concreta provoca avisos
    // de React y estilos impredecibles cuando el valor se retira.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e9eaf2",
    borderRadius: 13,
    padding: "0 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  sendBtn: {
    padding: 0,
    border: "none",
    borderRadius: 13,
    color: "#fff",
    width: 46,
    height: 46,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};

export default AgentChat;
