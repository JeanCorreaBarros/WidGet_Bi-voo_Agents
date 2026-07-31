// src/MultiAgentChat.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { usePathname } from "next/navigation";

// src/AgentChat.tsx
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function urlSegura(u, permitirData = false) {
  const p = u.trim();
  if (/^https?:\/\//i.test(p)) return p;
  if (permitirData && /^data:image\//i.test(p)) return p;
  return null;
}
function conFormato(texto, key) {
  const RE = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  const nodos = [];
  let ultimo = 0;
  let i = 0;
  let m;
  while (m = RE.exec(texto)) {
    if (m.index > ultimo) nodos.push(texto.slice(ultimo, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== void 0) {
      const src = urlSegura(m[2], true);
      nodos.push(
        src ? (
          // eslint-disable-next-line @next/next/no-img-element
          /* @__PURE__ */ jsx("img", { src, alt: m[1], style: S.msgImg }, k)
        ) : m[0]
      );
    } else if (m[3] !== void 0) {
      const href = urlSegura(m[4]);
      nodos.push(
        href ? /* @__PURE__ */ jsx("a", { href, target: "_blank", rel: "noopener noreferrer", style: S.mdLink, children: m[3] }, k) : m[0]
      );
    } else if (m[5] !== void 0) {
      nodos.push(/* @__PURE__ */ jsx("strong", { children: m[5] }, k));
    } else if (m[6] !== void 0) {
      nodos.push(
        /* @__PURE__ */ jsx("code", { style: S.mdCode, children: m[6] }, k)
      );
    } else if (m[7] !== void 0) {
      nodos.push(/* @__PURE__ */ jsx("em", { children: m[7] }, k));
    } else if (m[8] !== void 0) {
      nodos.push(/* @__PURE__ */ jsx("em", { children: m[8] }, k));
    }
    ultimo = RE.lastIndex;
  }
  if (ultimo < texto.length) nodos.push(texto.slice(ultimo));
  return nodos;
}
function bloques(texto, keyBase) {
  const salida = [];
  let normales = [];
  let lista = null;
  const cerrarNormales = () => {
    if (normales.length === 0) return;
    salida.push(
      /* @__PURE__ */ jsx("span", { children: conFormato(normales.join("\n"), `${keyBase}-t${salida.length}`) }, `${keyBase}-t${salida.length}`)
    );
    normales = [];
  };
  const cerrarLista = () => {
    if (!lista) return;
    const { tipo, items } = lista;
    const Tag = tipo;
    salida.push(
      /* @__PURE__ */ jsx(Tag, { style: S.mdList, children: items.map((it, idx) => /* @__PURE__ */ jsx("li", { children: conFormato(it, `${keyBase}-l${salida.length}-${idx}`) }, idx)) }, `${keyBase}-l${salida.length}`)
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
var RE_SUGERENCIAS = /\n?%%[ \t]*(.+)\s*$/;
function separarSugerencias(texto) {
  const m = RE_SUGERENCIAS.exec(texto);
  if (!m) return { texto, opciones: [] };
  const opciones = m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (opciones.length === 0) return { texto, opciones: [] };
  return { texto: texto.slice(0, m.index), opciones };
}
function diasDesde(iso) {
  const d = new Date(iso);
  const hoy = /* @__PURE__ */ new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((b - a) / 864e5);
}
function tiempoRelativo(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 6e4);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const dias = diasDesde(iso);
  if (dias === 0) {
    const h = Math.floor(min / 60);
    return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  }
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} d\xEDas`;
  return new Date(iso).toLocaleDateString(void 0, {
    day: "numeric",
    month: "short"
  });
}
function agruparPorFecha(convs) {
  var _a;
  const grupos = {};
  const orden = ["Hoy", "Ayer", "Esta semana", "M\xE1s antiguas"];
  for (const c of convs) {
    const d = diasDesde(c.updatedAt);
    const clave = d <= 0 ? "Hoy" : d === 1 ? "Ayer" : d < 7 ? "Esta semana" : "M\xE1s antiguas";
    ((_a = grupos[clave]) != null ? _a : grupos[clave] = []).push(c);
  }
  return orden.filter((k) => {
    var _a2;
    return (_a2 = grupos[k]) == null ? void 0 : _a2.length;
  }).map((k) => ({ etiqueta: k, items: grupos[k] }));
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16
  );
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
}
function withQuery(url, params) {
  const qs = new URLSearchParams(params).toString();
  return url + (url.includes("?") ? "&" : "?") + qs;
}
function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const w = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [54, 58, 82];
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c) => Math.round(c * (1 - amount));
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
function ensureVisibleAccent(hex) {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.82 ? "#363a52" : hex;
}
function AgentChat({
  endpoint = "/api/agent",
  title = "Asistente",
  subtitle = "En l\xEDnea",
  placeholder = "Escribe tu mensaje\u2026",
  accent = "#363a52",
  avatarEmoji = "\u{1F4AC}",
  greeting,
  defaultOpen = false,
  context,
  sessionKey,
  showSettings,
  onOpenSettings
}) {
  var _a, _b, _c, _d, _e, _f, _g;
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState(
    greeting ? [{ role: "assistant", content: greeting }] : []
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState(null);
  const [apagado, setApagado] = useState(false);
  const [convId, setConvId] = useState(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [convs, setConvs] = useState(null);
  const [histError, setHistError] = useState(null);
  const claveConv = `agc-conv-${endpoint}`;
  const guardarConv = useCallback(
    (id) => {
      setConvId(id);
      try {
        if (id) localStorage.setItem(claveConv, id);
        else localStorage.removeItem(claveConv);
      } catch {
      }
    },
    [claveConv]
  );
  useEffect(() => {
    try {
      setConvId(localStorage.getItem(claveConv));
    } catch {
    }
  }, [claveConv]);
  const [image, setImage] = useState(null);
  const [listening, setListening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelPropio, setPanelPropio] = useState(false);
  const [unread, setUnread] = useState(0);
  const [peek, setPeek] = useState(null);
  const [celebra, setCelebra] = useState(false);
  const [vida, setVida] = useState(null);
  const endRef = useRef(null);
  const peekTimer = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const menuRef = useRef(null);
  const effTitle = (_a = meta == null ? void 0 : meta.name) != null ? _a : title;
  const effEmoji = (_b = meta == null ? void 0 : meta.avatarEmoji) != null ? _b : avatarEmoji;
  const effAccent = ensureVisibleAccent((_c = meta == null ? void 0 : meta.accentColor) != null ? _c : accent);
  const allowImages = (_d = meta == null ? void 0 : meta.allowImages) != null ? _d : false;
  const allowVoice = (_e = meta == null ? void 0 : meta.allowVoice) != null ? _e : false;
  const speechSupported = getSpeechRecognition() !== null;
  const grad = `linear-gradient(135deg, ${effAccent}, ${lighten(effAccent, 0.45)})`;
  const ring = lighten(effAccent, 0.82);
  const accentTint = lighten(effAccent, 0.86);
  const iconColor = darken(effAccent, 0.12);
  const mood = celebra ? "happy" : busy ? ((_f = messages[messages.length - 1]) == null ? void 0 : _f.content) ? "talking" : "thinking" : vida != null ? vida : "idle";
  useEffect(() => {
    fetch(endpoint, { method: "GET" }).then(async (r) => {
      if (r.status === 403) {
        setApagado(true);
        return null;
      }
      return r.ok ? r.json() : null;
    }).then((d) => d && setMeta(d)).catch(() => {
    });
  }, [endpoint]);
  useEffect(() => {
    var _a2;
    (_a2 = endRef.current) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);
  useEffect(() => {
    const url = withQuery(endpoint, {
      sse: "1",
      ...sessionKey ? { session: sessionKey } : {}
    });
    let es;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if ((data == null ? void 0 : data.type) !== "suggestion" || !data.message) return;
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.message, suggestion: true }
        ]);
        setUnread((n) => n + 1);
        setCelebra(true);
        setTimeout(() => setCelebra(false), 2600);
        setOpen((isOpen) => {
          if (!isOpen) {
            setPeek(data.message);
            if (peekTimer.current) clearTimeout(peekTimer.current);
            peekTimer.current = setTimeout(() => setPeek(null), 2e4);
          }
          return isOpen;
        });
      } catch {
      }
    };
    return () => es.close();
  }, [endpoint, sessionKey]);
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    setPeek(null);
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, [open, messages.length]);
  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);
  const permitidas = (_g = meta == null ? void 0 : meta.idleAnimations) != null ? _g : [];
  const permitidasKey = permitidas.join(",");
  useEffect(() => {
    const opciones = permitidasKey.split(",").filter(Boolean);
    if (opciones.length === 0 || open || busy) {
      setVida(null);
      return;
    }
    let vivo = true;
    let tFin;
    const programar = () => {
      const espera = 25e3 + Math.random() * 35e3;
      const tIni = setTimeout(() => {
        if (!vivo) return;
        const elegida = opciones[Math.floor(Math.random() * opciones.length)];
        setVida(elegida);
        const duracion = elegida === "sleeping" ? 12e3 : 6e3;
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
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);
  function pickImage() {
    var _a2;
    setMenuOpen(false);
    (_a2 = fileRef.current) == null ? void 0 : _a2.click();
  }
  function onFileChange(e) {
    var _a2;
    const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  }
  function toggleListen() {
    var _a2;
    setMenuOpen(false);
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (listening) {
      (_a2 = recRef.current) == null ? void 0 : _a2.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      var _a3, _b2, _c2, _d2;
      const ev = e;
      const transcript = (_d2 = (_c2 = (_b2 = (_a3 = ev.results) == null ? void 0 : _a3[0]) == null ? void 0 : _b2[0]) == null ? void 0 : _c2.transcript) != null ? _d2 : "";
      if (transcript) setInput((prev) => prev ? `${prev} ${transcript}` : transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }
  async function enviarTexto(text, imagenAdjunta) {
    if (!text && !imagenAdjunta || busy) return;
    const content = imagenAdjunta ? [
      ...text ? [{ type: "text", text }] : [],
      { type: "image", image: imagenAdjunta }
    ] : text;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // conversationId enlaza este mensaje con lo hablado antes. Quién es el
        // usuario lo pone el servidor de tu app, no esto.
        body: JSON.stringify({ messages: next, context, conversationId: convId })
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Error");
        patchLast(`\u26A0\uFE0F ${res.status}: ${errText}`);
        return;
      }
      const id = res.headers.get("x-conversation-id");
      if (id && id !== convId) guardarConv(id);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patchLast(acc);
      }
    } catch (err) {
      patchLast(`\u26A0\uFE0F Error de red: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }
  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !image || busy) return;
    const imagenAdjunta = image;
    setInput("");
    setImage(null);
    await enviarTexto(text, imagenAdjunta);
  }
  async function abrirHistorial() {
    var _a2;
    setVerHistorial(true);
    setConvs(null);
    setHistError(null);
    try {
      const r = await fetch(withQuery(endpoint, { conversations: "1" }));
      if (r.ok) {
        setConvs((_a2 = (await r.json()).conversaciones) != null ? _a2 : []);
        return;
      }
      setConvs([]);
      if (r.status === 409) {
        setHistError("El historial est\xE1 desactivado para este asistente.");
      } else if (r.status === 400) {
        setHistError(
          "Falta identificar al usuario: tu servidor debe enviar la cabecera x-user-key."
        );
      } else {
        setHistError(`No se pudo cargar el historial (error ${r.status}).`);
      }
    } catch {
      setConvs([]);
      setHistError("No se pudo conectar para cargar el historial.");
    }
  }
  async function cargarConversacion(id) {
    var _a2;
    try {
      const r = await fetch(withQuery(endpoint, { conversation: id }));
      if (!r.ok) return;
      const d = await r.json();
      setMessages(
        ((_a2 = d.mensajes) != null ? _a2 : []).map(
          (m) => ({
            role: m.role,
            content: m.content
          })
        )
      );
      guardarConv(id);
      setVerHistorial(false);
    } catch {
    }
  }
  async function borrarConversacion(id) {
    try {
      await fetch(withQuery(endpoint, { conversation: id }), {
        method: "DELETE"
      });
    } catch {
    }
    if (id === convId) {
      guardarConv(null);
      setMessages([]);
    }
    abrirHistorial();
  }
  function nuevaConversacion() {
    guardarConv(null);
    setMessages([]);
    setVerHistorial(false);
  }
  function patchLast(content) {
    setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = { role: "assistant", content };
      return copy;
    });
  }
  if (apagado) return null;
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    /* @__PURE__ */ jsx("style", { children: `
        @keyframes agc-peek-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        /* Borrar es irreversible: el icono va en rojo y se enciende al pasar
           por encima. Va aqu\xED y no en el objeto de estilos porque los estilos
           inline no admiten :hover. */
        .agc-trash svg path { stroke: #e0a0a0; transition: stroke .14s; }
        .agc-trash:hover { background: #fdeeee; }
        .agc-trash:hover svg path { stroke: #d64545; }
        .agc-trash:focus-visible {
          outline: 2px solid #d64545;
          outline-offset: -2px;
        }

        /* En rat\xF3n la papelera se aten\xFAa hasta que haces hover: la lista se
           lee mejor sin un icono rojo en cada fila. */
        .agc-trash { opacity: .45; transition: opacity .14s, background .14s; }
        .agc-hist-item:hover .agc-trash,
        .agc-trash:focus-visible { opacity: 1; }

        /* En t\xE1ctil no hay hover, as\xED que ah\xED siempre se ve. */
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
           Vive en un rinc\xF3n de la web de OTRO, as\xED que en reposo se hace
           peque\xF1a y transl\xFAcida. Al acercar el rat\xF3n crece y se ve entera.
           El \xE1rea de clic NO cambia: el bot\xF3n mantiene su tama\xF1o real y solo
           se escala visualmente, as\xED no hay que apuntar a un blanco diminuto. */
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
        /* Con una sugerencia sin leer se queda visible: ah\xED s\xED reclama atenci\xF3n */
        .agc-fab.reclama {
          opacity: 1;
          transform: scale(1);
        }
        .agc-fab.reclama:hover {
          transform: scale(1.06);
        }

        /* En pantallas t\xE1ctiles no hay rat\xF3n al que acercarse: se deja visible */
        @media (hover: none) {
          .agc-fab:not(.abierto) {
            opacity: .9;
            transform: scale(.95);
          }
        }

        /* Respeta a quien pidi\xF3 menos animaci\xF3n en su sistema. */
        @media (prefers-reduced-motion: reduce) {
          .agc-hist-item { transition: none; }
          .agc-hist-item:hover { transform: none; }
          .agc-fab { transition: opacity .2s ease; }
          .agc-fab:not(.abierto) { transform: none; opacity: .7; }
          .agc-fab:not(.abierto):hover { transform: none; opacity: 1; }
        }
      ` }),
    open && /* @__PURE__ */ jsxs("div", { style: S.panel, children: [
      /* @__PURE__ */ jsxs("div", { style: S.header, children: [
        /* @__PURE__ */ jsx("div", { style: S.avatarSlot, children: /* @__PURE__ */ jsx(AgentOrb, { size: 38, accent: effAccent, mood }) }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsx("div", { style: S.title, children: effTitle }),
          /* @__PURE__ */ jsxs("div", { style: S.subtitle, children: [
            /* @__PURE__ */ jsx("span", { style: S.dot }),
            " ",
            subtitle
          ] })
        ] }),
        showSettings && /* @__PURE__ */ jsx(
          "button",
          {
            "aria-label": "Configurar Bi-voo Agents",
            title: "Configurar Bi-voo Agents",
            onClick: () => onOpenSettings ? onOpenSettings() : setPanelPropio(true),
            style: S.close,
            children: /* @__PURE__ */ jsx(GearGlyph, { color: "#6b7085" })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            "aria-label": "Conversaciones anteriores",
            title: "Conversaciones anteriores",
            onClick: () => verHistorial ? setVerHistorial(false) : abrirHistorial(),
            style: S.close,
            children: /* @__PURE__ */ jsx(HistoryGlyph, { color: verHistorial ? effAccent : "#6b7085" })
          }
        ),
        /* @__PURE__ */ jsx("button", { "aria-label": "Cerrar", onClick: () => setOpen(false), style: S.close, children: /* @__PURE__ */ jsx(CloseGlyph, { color: "#6b7085" }) })
      ] }),
      verHistorial && /* @__PURE__ */ jsxs("div", { style: S.histPanel, children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: nuevaConversacion,
            style: { ...S.histNueva, background: grad },
            children: [
              /* @__PURE__ */ jsx(PlusGlyph, { color: "#fff" }),
              "Nueva conversaci\xF3n"
            ]
          }
        ),
        convs === null && /* @__PURE__ */ jsxs("div", { style: S.histCargando, children: [
          /* @__PURE__ */ jsx(AgentOrb, { size: 40, accent: effAccent, mood: "thinking" }),
          "Buscando tus conversaciones\u2026"
        ] }),
        (convs == null ? void 0 : convs.length) === 0 && !histError && /* @__PURE__ */ jsxs("div", { style: S.histVacio, children: [
          /* @__PURE__ */ jsx(AgentOrb, { size: 46, accent: effAccent, mood: "idle" }),
          /* @__PURE__ */ jsx("strong", { children: "Todav\xEDa no hay nada guardado" }),
          /* @__PURE__ */ jsx("span", { children: "Cuando escribas, tus conversaciones quedar\xE1n aqu\xED para que puedas retomarlas cuando quieras." })
        ] }),
        histError && /* @__PURE__ */ jsx("div", { style: S.histError, children: histError }),
        convs && convs.length > 0 && agruparPorFecha(convs).map((grupo) => /* @__PURE__ */ jsxs("div", { style: S.histGrupo, children: [
          /* @__PURE__ */ jsx("div", { style: S.histGrupoTitulo, children: grupo.etiqueta }),
          grupo.items.map((c) => {
            const actual = c.id === convId;
            return /* @__PURE__ */ jsxs(
              "div",
              {
                className: "agc-hist-item",
                style: {
                  ...S.histItem,
                  ...actual ? {
                    borderColor: effAccent,
                    background: hexToRgba(effAccent, 0.05)
                  } : null
                },
                children: [
                  /* @__PURE__ */ jsx(
                    "span",
                    {
                      style: {
                        ...S.histBarra,
                        background: actual ? effAccent : "transparent"
                      }
                    }
                  ),
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      onClick: () => cargarConversacion(c.id),
                      style: S.histAbrir,
                      children: [
                        /* @__PURE__ */ jsx("span", { style: S.histTitulo, children: c.title }),
                        /* @__PURE__ */ jsxs("span", { style: S.histMeta, children: [
                          actual && /* @__PURE__ */ jsx(
                            "span",
                            {
                              style: { ...S.histActual, color: effAccent },
                              children: "En curso"
                            }
                          ),
                          c.mensajes,
                          " ",
                          c.mensajes === 1 ? "mensaje" : "mensajes",
                          " \xB7",
                          " ",
                          tiempoRelativo(c.updatedAt)
                        ] })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "agc-trash",
                      "aria-label": `Borrar la conversaci\xF3n "${c.title}"`,
                      title: "Borrar",
                      onClick: () => borrarConversacion(c.id),
                      style: S.histBorrar,
                      children: /* @__PURE__ */ jsx(TrashGlyph, {})
                    }
                  )
                ]
              },
              c.id
            );
          })
        ] }, grupo.etiqueta))
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...S.messages, ...verHistorial ? S.oculto : null }, children: [
        messages.length === 0 && /* @__PURE__ */ jsxs("div", { style: S.empty, children: [
          /* @__PURE__ */ jsx(AgentOrb, { size: 54, accent: effAccent, mood }),
          "\xBFEn qu\xE9 te puedo ayudar?"
        ] }),
        messages.map((m, i) => /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              ...S.bubble,
              ...m.role === "user" ? { ...S.user, background: grad } : S.assistant,
              ...m.suggestion ? S.suggestionBubble : null
            },
            children: [
              m.suggestion && /* @__PURE__ */ jsxs("div", { style: { ...S.suggestionBadge, color: effAccent }, children: [
                /* @__PURE__ */ jsx(SparkGlyph, { color: effAccent }),
                " Sugerencia"
              ] }),
              /* @__PURE__ */ jsx(
                MessageContent,
                {
                  content: m.content,
                  role: m.role,
                  accent: effAccent,
                  onQuickReply: i === messages.length - 1 && !busy ? (texto) => enviarTexto(texto, null) : void 0
                }
              )
            ]
          },
          i
        )),
        /* @__PURE__ */ jsx("div", { ref: endRef })
      ] }),
      image && /* @__PURE__ */ jsxs("div", { style: S.imgPreviewRow, children: [
        /* @__PURE__ */ jsx("img", { src: image, alt: "adjunto", style: S.imgPreview }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setImage(null),
            style: S.imgRemove,
            "aria-label": "Quitar imagen",
            children: /* @__PURE__ */ jsx(CloseGlyph, { color: "#6b7085" })
          }
        ),
        /* @__PURE__ */ jsx("span", { style: S.imgHint, children: "Imagen lista para enviar" })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: send, style: S.form, children: [
        (allowImages || allowVoice && speechSupported) && /* @__PURE__ */ jsxs("div", { style: S.menuWrap, ref: menuRef, children: [
          allowImages && /* @__PURE__ */ jsx(
            "input",
            {
              ref: fileRef,
              type: "file",
              accept: "image/*",
              onChange: onFileChange,
              style: { display: "none" }
            }
          ),
          menuOpen && /* @__PURE__ */ jsxs("div", { style: S.popupMenu, children: [
            allowImages && /* @__PURE__ */ jsxs("button", { type: "button", onClick: pickImage, style: S.menuItem, children: [
              /* @__PURE__ */ jsx(AttachGlyph, { color: "#2a2c3a" }),
              " Adjuntar imagen"
            ] }),
            allowVoice && speechSupported && /* @__PURE__ */ jsxs("button", { type: "button", onClick: toggleListen, style: S.menuItem, children: [
              /* @__PURE__ */ jsx(MicGlyph, { color: "#2a2c3a" }),
              " Dictar por voz"
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => listening ? toggleListen() : setMenuOpen((v) => !v),
              style: {
                ...S.iconBtn,
                background: listening ? "#fee2e2" : accentTint,
                borderColor: listening ? "#f7b8b8" : lighten(effAccent, 0.62),
                color: listening ? "#dc2626" : iconColor
              },
              "aria-label": listening ? "Detener dictado" : menuOpen ? "Cerrar opciones" : "M\xE1s opciones",
              title: listening ? "Detener dictado" : "Adjuntar o dictar",
              children: listening ? /* @__PURE__ */ jsx(MicGlyph, { pulsing: true, color: "#dc2626" }) : /* @__PURE__ */ jsx(PlusGlyph, { rotated: menuOpen, color: iconColor })
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            style: {
              ...S.input,
              // Siempre presente: si se quitara al vaciar el campo, React
              // avisaría de que se retira una propiedad en pleno rerender.
              borderColor: input ? ring : "#e9eaf2"
            },
            value: input,
            onChange: (e) => setInput(e.target.value),
            placeholder: listening ? "Escuchando\u2026" : placeholder,
            disabled: busy
          }
        ),
        (() => {
          const inactivo = busy || !input.trim() && !image;
          return /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              "aria-label": "Enviar",
              disabled: inactivo,
              style: {
                ...S.sendBtn,
                // Inactivo: gris sólido en vez de degradado desvaído, así
                // se lee como "aún no" y no como un botón roto.
                background: inactivo ? "#e9eaf2" : grad,
                cursor: inactivo ? "default" : "pointer"
              },
              children: /* @__PURE__ */ jsx(SendGlyph, { color: inactivo ? "#a9adbe" : "#fff" })
            }
          );
        })()
      ] })
    ] }),
    !open && peek && /* @__PURE__ */ jsxs("div", { style: S.peekWrap, role: "status", children: [
      /* @__PURE__ */ jsxs("div", { style: S.peekBubble, onClick: () => setOpen(true), children: [
        /* @__PURE__ */ jsxs("div", { style: { ...S.peekHead, color: effAccent }, children: [
          /* @__PURE__ */ jsx(SparkGlyph, { color: effAccent }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: effTitle }),
          /* @__PURE__ */ jsx(
            "button",
            {
              "aria-label": "Descartar",
              onClick: (e) => {
                e.stopPropagation();
                setPeek(null);
              },
              style: S.peekClose,
              children: /* @__PURE__ */ jsx(CloseGlyph, { color: "#9296a8" })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { style: S.peekText, children: peek }),
        /* @__PURE__ */ jsx("div", { style: { ...S.peekCta, color: effAccent }, children: "Toca para responder" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: S.peekTail })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          className: [
            "agc-fab",
            open ? "abierto" : "",
            !open && (unread > 0 || peek) ? "reclama" : ""
          ].filter(Boolean).join(" "),
          "aria-label": open ? "Cerrar chat" : "Abrir chat",
          onClick: () => setOpen((v) => !v),
          style: {
            ...S.fab,
            // Cerrado: el orbe es el botón. Abierto: círculo con la X.
            background: open ? grad : "transparent",
            boxShadow: open ? S.fab.boxShadow : "none"
          },
          children: open ? /* @__PURE__ */ jsx(CloseGlyph, { color: "#fff" }) : (
            // Algo menor que el botón para que el halo no quede recortado.
            /* @__PURE__ */ jsx(AgentOrb, { size: 52, accent: effAccent, mood })
          )
        }
      ),
      !open && unread > 0 && /* @__PURE__ */ jsx("span", { style: S.unreadBadge, "aria-label": `${unread} sugerencias nuevas`, children: unread })
    ] }),
    panelPropio && /* @__PURE__ */ jsx(SettingsPanel, { endpoint, accent: effAccent, onClose: () => setPanelPropio(false) })
  ] });
}
function MessageContent({
  content,
  role,
  accent,
  onQuickReply
}) {
  if (typeof content === "string") {
    if (!content) return /* @__PURE__ */ jsx(TypingDots, {});
    if (role !== "assistant") return /* @__PURE__ */ jsx(Fragment, { children: content });
    const { texto, opciones } = separarSugerencias(content);
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      bloques(texto, "m"),
      onQuickReply && opciones.length > 0 && /* @__PURE__ */ jsx("div", { style: S.quickReplies, children: opciones.map((op, idx) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          style: { ...S.quickReplyBtn, color: accent },
          onClick: () => onQuickReply(op),
          children: op
        },
        idx
      )) })
    ] });
  }
  const text = content.find((p) => p.type === "text");
  const image = content.find((p) => p.type === "image");
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    image && // eslint-disable-next-line @next/next/no-img-element
    /* @__PURE__ */ jsx("img", { src: image.image, alt: "adjunto", style: S.msgImg }),
    text == null ? void 0 : text.text
  ] });
}
function SettingsPanel({
  endpoint,
  accent,
  onClose
}) {
  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [appToken, setAppToken] = useState("");
  const [enabled, setEnabled_] = useState(true);
  const [hasAppToken, setHasAppToken] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msgGuardar, setMsgGuardar] = useState("");
  const [specUrl, setSpecUrl] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState(null);
  const cargar = useCallback(async () => {
    var _a, _b, _c;
    setCargando(true);
    try {
      const r = await fetch(`${endpoint}/config`);
      if (r.status === 404) {
        setNoDisponible(true);
        return;
      }
      if (!r.ok) return;
      const d = await r.json();
      const c = (_a = d == null ? void 0 : d.conexion) != null ? _a : null;
      if (c) {
        setGatewayUrl((_b = c.gatewayUrl) != null ? _b : "");
        setEnabled_((_c = c.enabled) != null ? _c : true);
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
        body: JSON.stringify({ gatewayUrl, appToken: appToken || void 0 })
      });
      setResultadoPrueba(await r.json());
    } catch {
      setResultadoPrueba({ ok: false, detalle: "No se pudo conectar" });
    } finally {
      setProbando(false);
    }
  }
  async function guardarConexion(e) {
    e.preventDefault();
    setGuardando(true);
    setMsgGuardar("");
    try {
      const r = await fetch(`${endpoint}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayUrl, appToken: appToken || void 0 })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsgGuardar((d == null ? void 0 : d.detalle) || "No se pudo guardar");
        return;
      }
      setAppToken("");
      setMsgGuardar("Guardado.");
      cargar();
    } catch {
      setMsgGuardar("No se pudo conectar");
    } finally {
      setGuardando(false);
    }
  }
  async function sincronizar(e) {
    e.preventDefault();
    setSincronizando(true);
    setResultadoSync(null);
    try {
      const r = await fetch(`${endpoint}/sync-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specUrl })
      });
      setResultadoSync(await r.json());
    } catch {
      setResultadoSync({ ok: false, detalle: "No se pudo conectar" });
    } finally {
      setSincronizando(false);
    }
  }
  return /* @__PURE__ */ jsx("div", { style: S.settingsBackdrop, onClick: onClose, children: /* @__PURE__ */ jsxs("div", { style: S.settingsCard, onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs("div", { style: S.settingsHead, children: [
      /* @__PURE__ */ jsx("h3", { style: S.settingsTitle, children: "Configuraci\xF3n del agente" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          "aria-label": "Cerrar",
          onClick: onClose,
          style: { background: "transparent", border: "none", padding: 4, cursor: "pointer" },
          children: /* @__PURE__ */ jsx(CloseGlyph, { color: "#8b8fa3" })
        }
      )
    ] }),
    cargando ? /* @__PURE__ */ jsx(TypingDots, {}) : noDisponible ? /* @__PURE__ */ jsxs("p", { style: S.settingsHint, children: [
      "Este widget no encontr\xF3 ",
      /* @__PURE__ */ jsxs("code", { children: [
        endpoint,
        "/config"
      ] }),
      ". Si tu servidor no usa",
      " ",
      /* @__PURE__ */ jsx("code", { children: "bivoo-agent-widget/server" }),
      ", este panel no tiene con qu\xE9 hablar \u2014 usa",
      " ",
      /* @__PURE__ */ jsx("code", { children: "onOpenSettings" }),
      " para mostrar tu propia interfaz en su lugar."
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("form", { onSubmit: guardarConexion, style: S.settingsSection, children: [
        /* @__PURE__ */ jsx("h4", { style: S.settingsSectionTitle, children: "Conexi\xF3n" }),
        /* @__PURE__ */ jsxs("div", { style: S.settingsField, children: [
          /* @__PURE__ */ jsx("label", { style: S.settingsLabel, children: "URL del gateway" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              style: S.settingsInput,
              value: gatewayUrl,
              onChange: (e) => setGatewayUrl(e.target.value),
              placeholder: "https://agente.tu-dominio.com"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: S.settingsField, children: [
          /* @__PURE__ */ jsx("label", { style: S.settingsLabel, children: "App Token" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              style: S.settingsInput,
              type: "password",
              value: appToken,
              onChange: (e) => setAppToken(e.target.value),
              placeholder: hasAppToken ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (sin cambios)" : "app_...",
              autoComplete: "off"
            }
          ),
          /* @__PURE__ */ jsx("p", { style: S.settingsHint, children: hasAppToken ? "Ya hay uno guardado. D\xE9jalo en blanco para conservarlo." : "Lo consigues en tu panel del gateway \u2192 el agente \u2192 Desarrollo \u2192 appToken." })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { ...S.settingsRow, marginBottom: 12, justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx("span", { style: { fontSize: 12.5, color: "#4b4f63" }, children: enabled ? "\u{1F7E2} Agente activo" : "\u26AA Agente apagado" }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 11.5, color: "#8b8fa3" }, children: "Se cambia fuera de aqu\xED" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: S.settingsRow, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: probar,
              disabled: probando || !gatewayUrl,
              style: { ...S.settingsBtnGhost, opacity: probando || !gatewayUrl ? 0.6 : 1 },
              children: probando ? "Probando\u2026" : "Probar conexi\xF3n"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              disabled: guardando || !gatewayUrl,
              style: { ...S.settingsBtn, background: accent, opacity: guardando ? 0.7 : 1 },
              children: guardando ? "Guardando\u2026" : "Guardar"
            }
          )
        ] }),
        resultadoPrueba && /* @__PURE__ */ jsx("div", { style: resultadoPrueba.ok ? S.settingsResultOk : S.settingsResultErr, children: resultadoPrueba.detalle }),
        msgGuardar && /* @__PURE__ */ jsx("p", { style: S.settingsHint, children: msgGuardar })
      ] }),
      hasAppToken && /* @__PURE__ */ jsxs("form", { onSubmit: sincronizar, style: S.settingsSection, children: [
        /* @__PURE__ */ jsx("h4", { style: S.settingsSectionTitle, children: "Herramientas" }),
        /* @__PURE__ */ jsxs("div", { style: S.settingsField, children: [
          /* @__PURE__ */ jsx("label", { style: S.settingsLabel, children: "URL de tu Swagger/OpenAPI (JSON)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              style: S.settingsInput,
              value: specUrl,
              onChange: (e) => setSpecUrl(e.target.value),
              placeholder: "https://tu-dominio.com/api/openapi"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "submit",
            disabled: sincronizando || !specUrl,
            style: { ...S.settingsBtn, background: accent, opacity: sincronizando ? 0.7 : 1 },
            children: sincronizando ? "Sincronizando\u2026" : "Sincronizar"
          }
        ),
        resultadoSync && /* @__PURE__ */ jsxs("div", { style: resultadoSync.ok ? S.settingsResultOk : S.settingsResultErr, children: [
          resultadoSync.detalle,
          resultadoSync.ok && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("br", {}),
            "Reci\xE9n importadas quedan desactivadas salvo que sean de solo lectura \u2014 act\xEDvalas desde el panel del gateway."
          ] })
        ] })
      ] })
    ] })
  ] }) });
}
function CloseGlyph({ color = "#4b4f63" }) {
  return /* @__PURE__ */ jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsx(
    "path",
    {
      d: "M18 6 6 18M6 6l12 12",
      stroke: color,
      strokeWidth: "2.4",
      strokeLinecap: "round"
    }
  ) });
}
function HistoryGlyph({ color = "#4b4f63" }) {
  return /* @__PURE__ */ jsxs("svg", { width: "19", height: "19", viewBox: "0 0 24 24", fill: "none", children: [
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M3 12a9 9 0 1 0 3-6.7L3 8",
        stroke: color,
        strokeWidth: "2.1",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ jsx("path", { d: "M3 4v4h4", stroke: color, strokeWidth: "2.1", strokeLinecap: "round", strokeLinejoin: "round" }),
    /* @__PURE__ */ jsx("path", { d: "M12 7.5V12l3 1.8", stroke: color, strokeWidth: "2.1", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}
function TrashGlyph() {
  return /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsx(
    "path",
    {
      d: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
function SendGlyph({ color = "#fff" }) {
  return /* @__PURE__ */ jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", children: [
    /* @__PURE__ */ jsx("path", { d: "M12 20V5", stroke: color, strokeWidth: "2.8", strokeLinecap: "round" }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M5.5 11.5 12 5l6.5 6.5",
        stroke: color,
        strokeWidth: "2.8",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    )
  ] });
}
function GearGlyph({ color = "#4b4f63" }) {
  return /* @__PURE__ */ jsxs("svg", { width: "19", height: "19", viewBox: "0 0 24 24", fill: "none", children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3", stroke: color, strokeWidth: "2" }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
        stroke: color,
        strokeWidth: "1.8",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    )
  ] });
}
function PlusGlyph({ rotated, color = "#363a52" }) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      style: {
        transition: "transform 0.18s",
        transform: rotated ? "rotate(45deg)" : "none"
      },
      children: /* @__PURE__ */ jsx(
        "path",
        {
          d: "M12 5.5v13M5.5 12h13",
          stroke: color,
          strokeWidth: "2.9",
          strokeLinecap: "round"
        }
      )
    }
  );
}
function AgentOrb({
  size,
  accent,
  mood = "idle",
  animDelay
}) {
  const ref = useRef(null);
  const [look, setLook] = useState({ x: 0, y: 0, dx: 0, dy: 0 });
  const [cerca, setCerca] = useState(false);
  const [blink, setBlink] = useState(false);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    function move(clientX, clientY) {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const alcance = Math.min(1, dist / 170);
      const max = 6.5;
      setLook({
        x: dx / dist * max * alcance,
        y: dy / dist * max * alcance,
        dx: dx / dist,
        dy: dy / dist
      });
      setCerca(dist < Math.max(90, r.width * 1.25));
    }
    const onMouse = (e) => move(e.clientX, e.clientY);
    const onTouch = (e) => {
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
  useEffect(() => {
    let t;
    const programar = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 130);
          programar();
        },
        2600 + Math.random() * 3800
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
  const atrapando = cerca && (mood === "idle" || contento);
  const mirada = pensando ? { x: 3, y: -3.4 } : estudiando ? { x: 0, y: 3.4 } : comiendo ? { x: -2, y: 2.4 } : look;
  const ojosCerrados = blink || dormido;
  const ojosFelices = (contento || comiendo) && !blink;
  const ojoAlto = ojosCerrados ? 3 : 19;
  const ojoAncho = 8;
  const ANIMACIONES = {
    idle: "agc-orb-idle 5s ease-in-out infinite",
    thinking: "agc-orb-think 2.6s ease-in-out infinite",
    talking: "agc-orb-talk 0.9s ease-in-out infinite",
    happy: "agc-orb-party 0.7s ease-in-out infinite",
    sleeping: "agc-orb-sleep 4.5s ease-in-out infinite",
    eating: "agc-orb-idle 3s ease-in-out infinite",
    chatting: "agc-orb-talk 1.1s ease-in-out infinite",
    studying: "agc-orb-study 3.2s ease-in-out infinite"
  };
  const alcanceX = atrapando ? look.dx * 16 : 0;
  const alcanceY = atrapando ? look.dy * 16 : 0;
  const manoIzq = dormido ? { x: 26, y: 98, r: 24 } : comiendo ? { x: 26, y: 92, r: 0 } : estudiando ? { x: 34, y: 100, r: 16 } : contento ? { x: 20, y: 52, r: -34 } : { x: 20 + alcanceX, y: 84 + alcanceY, r: atrapando ? -18 : 0 };
  const manoDer = dormido ? { x: 94, y: 98, r: -24 } : pensando ? { x: 88, y: 30, r: -20 } : estudiando ? { x: 86, y: 100, r: -16 } : contento ? { x: 100, y: 52, r: 34 } : { x: 100 + alcanceX, y: 84 + alcanceY, r: atrapando ? 18 : 0 };
  const animIzq = contento ? "agc-wave-l 0.45s ease-in-out infinite" : hablando ? "agc-gesture-l 0.9s ease-in-out infinite" : "none";
  const animDer = contento ? "agc-wave-r 0.45s ease-in-out infinite" : pensando ? "agc-scratch 0.7s ease-in-out infinite" : hablando ? "agc-gesture-r 1.1s ease-in-out infinite" : "none";
  const Mano = ({
    p,
    anim,
    origen
  }) => /* @__PURE__ */ jsx("g", { style: { animation: anim, transformOrigin: origen }, children: /* @__PURE__ */ jsx(
    "ellipse",
    {
      cx: p.x,
      cy: p.y,
      rx: "9",
      ry: "8.5",
      fill: `url(#hand${id})`,
      transform: `rotate(${p.r} ${p.x} ${p.y})`,
      style: { transition: "cx 0.25s ease-out, cy 0.25s ease-out" }
    }
  ) });
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      ref,
      width: size,
      height: size,
      viewBox: "0 0 120 120",
      style: { display: "block", animation: ANIMACIONES[mood], animationDelay: animDelay != null ? animDelay : "0s", overflow: "visible" },
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx("style", { children: `
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

        /* --- estudiar: pasar p\xE1ginas --- */
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
      ` }),
        /* @__PURE__ */ jsxs("defs", { children: [
          /* @__PURE__ */ jsxs("radialGradient", { id: `body${id}`, cx: "34%", cy: "28%", r: "78%", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: "#ffffff", stopOpacity: "0.95" }),
            /* @__PURE__ */ jsx("stop", { offset: "34%", stopColor: claro }),
            /* @__PURE__ */ jsx("stop", { offset: "76%", stopColor: accent }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: accent })
          ] }),
          /* @__PURE__ */ jsxs("radialGradient", { id: `base${id}`, cx: "50%", cy: "88%", r: "52%", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: muyClaro, stopOpacity: "0.9" }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: muyClaro, stopOpacity: "0" })
          ] }),
          /* @__PURE__ */ jsxs("radialGradient", { id: `glow${id}`, cx: "50%", cy: "50%", r: "50%", children: [
            /* @__PURE__ */ jsx("stop", { offset: "60%", stopColor: accent, stopOpacity: "0.35" }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: accent, stopOpacity: "0" })
          ] }),
          /* @__PURE__ */ jsxs("radialGradient", { id: `hand${id}`, cx: "35%", cy: "30%", r: "75%", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: lighten(accent, 0.65) }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: accent })
          ] }),
          /* @__PURE__ */ jsx("clipPath", { id: `clip${id}`, children: /* @__PURE__ */ jsx("circle", { cx: "60", cy: "62", r: "38" }) })
        ] }),
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "64", r: "45", fill: `url(#glow${id})` }),
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "62", r: "38", fill: `url(#body${id})` }),
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "62", r: "38", fill: `url(#base${id})`, clipPath: `url(#clip${id})` }),
        /* @__PURE__ */ jsx("ellipse", { cx: "48", cy: "43", rx: "13", ry: "9", fill: "#fff", opacity: "0.55", transform: "rotate(-25 48 43)" }),
        /* @__PURE__ */ jsx(
          "g",
          {
            transform: `translate(${mirada.x} ${mirada.y})`,
            style: {
              transition: "transform 0.13s ease-out",
              animation: hablando ? "agc-eyes-dart 1.4s ease-in-out infinite" : "none"
            },
            children: ojosFelices ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("path", { d: "M41 65 Q49 55 57 65", stroke: "#fff", strokeWidth: "5.5", strokeLinecap: "round", fill: "none" }),
              /* @__PURE__ */ jsx("path", { d: "M63 65 Q71 55 79 65", stroke: "#fff", strokeWidth: "5.5", strokeLinecap: "round", fill: "none" })
            ] }) : dormido ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("path", { d: "M41 60 Q49 68 57 60", stroke: "#fff", strokeWidth: "5", strokeLinecap: "round", fill: "none" }),
              /* @__PURE__ */ jsx("path", { d: "M63 60 Q71 68 79 60", stroke: "#fff", strokeWidth: "5", strokeLinecap: "round", fill: "none" })
            ] }) : /* @__PURE__ */ jsx(Fragment, { children: [45, 67].map((x) => /* @__PURE__ */ jsx(
              "rect",
              {
                x,
                y: 62 - ojoAlto / 2,
                width: ojoAncho,
                height: ojoAlto,
                rx: ojoAncho / 2,
                fill: "#fff",
                style: { transition: "height 0.09s, y 0.09s" }
              },
              x
            )) })
          }
        ),
        (comiendo || hablando) && /* @__PURE__ */ jsx(
          "ellipse",
          {
            cx: "60",
            cy: "82",
            rx: comiendo ? 7.5 : 5.5,
            ry: comiendo ? 5.5 : 4,
            fill: "#fff",
            opacity: "0.92",
            style: {
              animation: comiendo ? "agc-chew 1.9s ease-in-out infinite" : "agc-mouth-talk 0.4s ease-in-out infinite",
              transformOrigin: "60px 82px"
            }
          }
        ),
        !comiendo && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Mano, { p: manoIzq, anim: animIzq, origen: `${manoIzq.x}px ${manoIzq.y}px` }),
          /* @__PURE__ */ jsx(Mano, { p: manoDer, anim: animDer, origen: `${manoDer.x}px ${manoDer.y}px` })
        ] }),
        comiendo && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("g", { children: [
            /* @__PURE__ */ jsx("circle", { cx: "16", cy: "86", r: "4.2", fill: "#fff8e1" }),
            /* @__PURE__ */ jsx("circle", { cx: "23", cy: "83", r: "4.8", fill: "#fffdf5" }),
            /* @__PURE__ */ jsx("circle", { cx: "30", cy: "86", r: "3.8", fill: "#fff8e1" }),
            /* @__PURE__ */ jsx("path", { d: "M11 88 L15 106 L31 106 L35 88 Z", fill: "#e94b4b" }),
            /* @__PURE__ */ jsx("path", { d: "M18.4 88 L20.6 106 L24.2 106 L22.8 88 Z", fill: "#fff", opacity: "0.95" }),
            /* @__PURE__ */ jsx("path", { d: "M28.5 88 L27 106 L29.6 106 L32 88 Z", fill: "#fff", opacity: "0.95" }),
            /* @__PURE__ */ jsx("rect", { x: "10", y: "86", width: "26", height: "4", rx: "1.6", fill: "#c93b3b" })
          ] }),
          /* @__PURE__ */ jsx(Mano, { p: { x: 14, y: 100, r: 12 }, anim: "none", origen: "14px 100px" }),
          /* @__PURE__ */ jsxs("g", { style: { animation: "agc-eat-hand 1.9s ease-in-out infinite" }, children: [
            /* @__PURE__ */ jsx("ellipse", { cx: "36", cy: "90", rx: "9", ry: "8.5", fill: `url(#hand${id})` }),
            /* @__PURE__ */ jsx(
              "circle",
              {
                cx: "38",
                cy: "83",
                r: "3.6",
                fill: "#fff8e1",
                style: { animation: "agc-eat-kernel 1.9s ease-in-out infinite" }
              }
            )
          ] })
        ] }),
        dormido && /* @__PURE__ */ jsxs("g", { fill: oscuro, fontWeight: "800", fontFamily: FONT, children: [
          /* @__PURE__ */ jsx("text", { x: "90", y: "36", fontSize: "20", style: { animation: "agc-z 3s ease-out infinite" }, children: "z" }),
          /* @__PURE__ */ jsx("text", { x: "99", y: "26", fontSize: "15", style: { animation: "agc-z 3s ease-out 1s infinite" }, children: "z" }),
          /* @__PURE__ */ jsx("text", { x: "106", y: "18", fontSize: "11", style: { animation: "agc-z 3s ease-out 2s infinite" }, children: "z" })
        ] }),
        pensando && /* @__PURE__ */ jsx(Nube, { id, color: oscuro, contenido: "codigo" }),
        estudiando && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Nube, { id, color: oscuro, contenido: "idea" }),
          /* @__PURE__ */ jsxs("g", { children: [
            /* @__PURE__ */ jsx("path", { d: "M38 100 L60 96 L60 114 L38 118 Z", fill: "#fff" }),
            /* @__PURE__ */ jsx("path", { d: "M82 100 L60 96 L60 114 L82 118 Z", fill: "#f1f1f7" }),
            /* @__PURE__ */ jsx(
              "path",
              {
                d: "M60 96 L80 100 L80 113 L60 110 Z",
                fill: "#fafafe",
                style: { animation: "agc-page 2.6s ease-in-out infinite", transformOrigin: "60px 104px" }
              }
            ),
            /* @__PURE__ */ jsx("path", { d: "M60 96 L60 114", stroke: oscuro, strokeWidth: "1.5", opacity: "0.55" }),
            /* @__PURE__ */ jsx("path", { d: "M43 105 H55 M43 109 H54", stroke: oscuro, strokeWidth: "1.2", opacity: "0.4", strokeLinecap: "round" })
          ] })
        ] })
      ]
    }
  );
}
function Nube({
  id,
  color,
  contenido
}) {
  return /* @__PURE__ */ jsxs("g", { style: { animation: "agc-cloud-float 2.6s ease-in-out infinite" }, children: [
    /* @__PURE__ */ jsx("circle", { cx: "86", cy: "36", r: "2.6", fill: "#fff", opacity: "0.9" }),
    /* @__PURE__ */ jsx("circle", { cx: "93", cy: "28", r: "3.6", fill: "#fff", opacity: "0.95" }),
    /* @__PURE__ */ jsxs("g", { children: [
      /* @__PURE__ */ jsx("ellipse", { cx: "98", cy: "14", rx: "16", ry: "10.5", fill: "#fff" }),
      /* @__PURE__ */ jsx("ellipse", { cx: "86", cy: "17", rx: "8", ry: "6.5", fill: "#fff" }),
      /* @__PURE__ */ jsx("ellipse", { cx: "110", cy: "17", rx: "7.5", ry: "6", fill: "#fff" })
    ] }),
    contenido === "codigo" ? /* @__PURE__ */ jsxs("g", { fontFamily: "ui-monospace, monospace", fontSize: "9.5", fontWeight: "700", fill: color, children: [
      /* @__PURE__ */ jsx("text", { x: "98", y: "17.5", textAnchor: "middle", style: { animation: "agc-code-cycle 1.8s steps(1) infinite" }, children: "</>" }),
      /* @__PURE__ */ jsx("text", { x: "98", y: "17.5", textAnchor: "middle", opacity: "0", style: { animation: "agc-code-cycle 1.8s steps(1) 0.6s infinite" }, children: "{ }" }),
      /* @__PURE__ */ jsx("text", { x: "98", y: "17.5", textAnchor: "middle", opacity: "0", style: { animation: "agc-code-cycle 1.8s steps(1) 1.2s infinite" }, children: "01" })
    ] }) : (
      /* bombilla de idea */
      /* @__PURE__ */ jsxs("g", { style: { animation: "agc-study-blink 1.8s ease-in-out infinite" }, children: [
        /* @__PURE__ */ jsx("circle", { cx: "98", cy: "12", r: "5", fill: "#f5b93c" }),
        /* @__PURE__ */ jsx("rect", { x: "95.6", y: "16.5", width: "4.8", height: "3.4", rx: "1.2", fill: color, opacity: "0.75" }),
        /* @__PURE__ */ jsx("path", { d: "M98 4.5 V1.5 M92 7 L90 5 M104 7 L106 5", stroke: "#f5b93c", strokeWidth: "1.6", strokeLinecap: "round" })
      ] })
    )
  ] });
}
function SparkGlyph({ color = "#363a52" }) {
  return /* @__PURE__ */ jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsx(
    "path",
    {
      d: "M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4L12 3z",
      fill: color
    }
  ) });
}
function AttachGlyph({ color = "#2a2c3a" }) {
  return /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsx(
    "path",
    {
      d: "M17.5 8.5 9.4 16.6a3 3 0 0 1-4.24-4.24l8.1-8.1a2 2 0 0 1 2.83 2.83l-7.6 7.6a1 1 0 0 1-1.42-1.41l6.9-6.9",
      stroke: color,
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
function MicGlyph({ pulsing, color = "#2a2c3a" }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      style: pulsing ? { animation: "agc-pulse 1.1s infinite" } : void 0,
      children: [
        /* @__PURE__ */ jsx("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3", stroke: color, strokeWidth: "2" }),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M5 11a7 7 0 0 0 14 0M12 18v3",
            stroke: color,
            strokeWidth: "2",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ jsx("style", { children: `@keyframes agc-pulse{0%,100%{opacity:1}50%{opacity:.4}}` })
      ]
    }
  );
}
function TypingDots() {
  return /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", gap: 4, padding: "2px 0" }, children: [
    [0, 1, 2].map((i) => /* @__PURE__ */ jsx(
      "span",
      {
        style: {
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#c3c6d4",
          display: "inline-block",
          animation: `agc-bounce 1s ${i * 0.15}s infinite ease-in-out`
        }
      },
      i
    )),
    /* @__PURE__ */ jsx("style", { children: `@keyframes agc-bounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}` })
  ] });
}
var FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
var S = {
  root: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 2147483e3,
    fontFamily: FONT
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
    justifyContent: "center"
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
    boxShadow: "0 24px 60px rgba(30, 25, 80, 0.22)"
  },
  header: {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 11,
    borderBottom: "1px solid #f0f1f7",
    background: "#ffffff"
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
    boxShadow: "0 4px 12px rgba(80, 60, 200, 0.28)"
  },
  /** Hueco del orbe en la cabecera (sin fondo: el orbe ya es la figura). */
  avatarSlot: {
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1b1c28",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  subtitle: {
    fontSize: 12,
    color: "#8a8fa3",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 1
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#22c55e",
    display: "inline-block"
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
    flexShrink: 0
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#fbfbfe"
  },
  empty: {
    color: "#8a8fa3",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22
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
    wordBreak: "break-word"
  },
  user: {
    color: "#fff",
    alignSelf: "flex-end",
    borderBottomRightRadius: 5,
    boxShadow: "0 6px 16px rgba(80, 60, 200, 0.24)"
  },
  assistant: {
    background: "#ffffff",
    borderColor: "#ecedf5",
    color: "#2a2c3a",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 5,
    boxShadow: "0 3px 12px rgba(30, 25, 80, 0.05)"
  },
  msgImg: {
    display: "block",
    maxWidth: "100%",
    borderRadius: 10,
    marginBottom: 6
  },
  mdList: {
    margin: "4px 0",
    paddingLeft: 20
  },
  mdCode: {
    background: "rgba(0,0,0,0.06)",
    borderRadius: 4,
    padding: "1px 5px",
    fontSize: "0.92em",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  mdLink: {
    color: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: 2
  },
  // --- sugerencias rápidas (%% opción | opción) ---
  quickReplies: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8
  },
  quickReplyBtn: {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1.5px solid currentColor",
    background: "transparent",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.3
  },
  // --- panel de configuración incorporado (gear sin onOpenSettings) ---
  settingsBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 20, 40, 0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2147483e3,
    // por encima de casi cualquier cosa de la página anfitriona
    padding: 16
  },
  settingsCard: {
    width: 400,
    maxWidth: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(20, 20, 50, 0.28)",
    padding: 22
  },
  settingsHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: 750,
    color: "#1b1c28",
    margin: 0
  },
  settingsSection: {
    marginBottom: 18
  },
  settingsSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#8b8fa3",
    margin: "0 0 10px"
  },
  settingsLabel: {
    display: "block",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#4b4f63",
    marginBottom: 5
  },
  settingsField: {
    marginBottom: 12
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
    boxSizing: "border-box"
  },
  settingsHint: {
    fontSize: 11.5,
    color: "#8b8fa3",
    margin: "5px 0 0",
    lineHeight: 1.5
  },
  settingsRow: {
    display: "flex",
    gap: 8,
    alignItems: "center"
  },
  settingsBtn: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer"
  },
  settingsBtnGhost: {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid #e2e3ee",
    background: "#fff",
    color: "#4b4f63",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer"
  },
  settingsResultOk: {
    marginTop: 10,
    padding: "8px 11px",
    borderRadius: 10,
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
    fontSize: 12.5,
    lineHeight: 1.5
  },
  settingsResultErr: {
    marginTop: 10,
    padding: "8px 11px",
    borderRadius: 10,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 12.5,
    lineHeight: 1.5
  },
  suggestionBubble: {
    borderStyle: "dashed",
    background: "#fcfcff"
  },
  suggestionBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 5
  },
  // --- nubecita de sugerencia sobre el botón ---
  peekWrap: {
    position: "absolute",
    right: 0,
    bottom: 72,
    width: 300,
    maxWidth: "calc(100vw - 44px)",
    animation: "agc-peek-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2)"
  },
  peekBubble: {
    background: "#fff",
    border: "1px solid #ecedf5",
    borderRadius: 16,
    padding: "12px 14px",
    boxShadow: "0 14px 36px rgba(30, 25, 80, 0.20)",
    cursor: "pointer"
  },
  peekHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 6
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
    flexShrink: 0
  },
  peekText: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "#2a2c3a",
    // Si el mensaje es largo, se recorta: el resto se lee al abrir el chat.
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  },
  peekCta: {
    fontSize: 11.5,
    fontWeight: 600,
    marginTop: 8
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
    transform: "rotate(45deg)"
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
    pointerEvents: "none"
  },
  imgPreviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 13px",
    borderTop: "1px solid #f0f1f7",
    background: "#fbfbfe"
  },
  imgPreview: {
    width: 40,
    height: 40,
    objectFit: "cover",
    borderRadius: 8,
    border: "1px solid #e9eaf2"
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
    flexShrink: 0
  },
  imgHint: {
    fontSize: 12,
    color: "#8a8fa3"
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
    background: "#fafaff"
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
    boxShadow: "0 4px 14px rgba(60, 50, 160, .22)"
  },
  histGrupo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 8
  },
  histGrupoTitulo: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "#9aa0b4",
    padding: "0 2px"
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
    overflow: "hidden"
  },
  /** Barra de color a la izquierda: marca la conversación abierta. */
  histBarra: {
    width: 3,
    flexShrink: 0
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
    gap: 3
  },
  histTitulo: {
    fontSize: 13,
    fontWeight: 600,
    color: "#2b2d3c",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    lineHeight: 1.35
  },
  histMeta: {
    fontSize: 11,
    color: "#9095a8",
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  histActual: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase"
  },
  histCargando: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "34px 10px",
    fontSize: 12.5,
    color: "#8a8fa3"
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
    color: "#8a8fa3"
  },
  histError: {
    padding: "12px 14px",
    background: "#fdf3f3",
    border: "1px solid #f3d4d4",
    borderRadius: 12,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "#9b3a3a"
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
    borderRadius: 0
  },
  form: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderTop: "1px solid #f0f1f7",
    background: "#fff"
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
    flexShrink: 0
  },
  menuWrap: {
    position: "relative",
    flexShrink: 0
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
    minWidth: 190
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
    whiteSpace: "nowrap"
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
    boxSizing: "border-box"
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
    flexShrink: 0
  }
};

// src/shared/agentes-ruta.ts
function dentroDe(prefijo, ruta) {
  const base = prefijo.replace(/\/+$/, "");
  if (base === "") return true;
  return ruta === base || ruta.startsWith(`${base}/`);
}
function exclusiones(a) {
  var _a;
  return ((_a = a.excludePaths) != null ? _a : "").split(",").map((s) => s.trim()).filter(Boolean);
}
function agenteParaRuta(agentes, ruta) {
  const encajan = agentes.filter(
    (a) => dentroDe(a.mountPath, ruta) && !exclusiones(a).some((ex) => dentroDe(ex, ruta))
  );
  if (encajan.length === 0) return null;
  return encajan.sort((x, y) => y.mountPath.length - x.mountPath.length)[0];
}

// src/MultiAgentChat.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function MultiAgentChat({
  /** Dónde preguntar "qué agentes hay". Por defecto, donde monta `createAgentesListado()` según el README. */
  listEndpoint = "/api/agentes",
  showSettings,
  onOpenSettings
}) {
  const ruta = usePathname() || "/";
  const [agentes, setAgentes] = useState2(null);
  const [puedeConfigurar, setPuedeConfigurar] = useState2(false);
  useEffect2(() => {
    let vivo = true;
    fetch(listEndpoint).then((r) => r.ok ? r.json() : { agentes: [] }).then((d) => {
      var _a;
      if (!vivo) return;
      setAgentes((_a = d == null ? void 0 : d.agentes) != null ? _a : []);
      setPuedeConfigurar(Boolean(d == null ? void 0 : d.puedeConfigurar));
    }).catch(() => vivo && setAgentes([]));
    return () => {
      vivo = false;
    };
  }, [listEndpoint]);
  if (!agentes) return null;
  const agente = agenteParaRuta(agentes, ruta);
  if (!agente) return null;
  return /* @__PURE__ */ jsx2(
    AgentChat,
    {
      endpoint: agente.endpoint,
      showSettings: showSettings != null ? showSettings : puedeConfigurar,
      onOpenSettings: onOpenSettings ? () => onOpenSettings(agente.slug) : void 0
    },
    agente.slug
  );
}
export {
  MultiAgentChat
};
//# sourceMappingURL=next.js.map