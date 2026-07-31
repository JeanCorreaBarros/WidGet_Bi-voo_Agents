// src/server/almacen.ts
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
var avisoPlanoMostrado = false;
function claveMaestra() {
  const raw = process.env.BIVOO_CONFIG_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}
function cifrar(texto, clave) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", clave, iv);
  const enc = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, enc].map((b) => Buffer.isBuffer(b) ? b.toString("base64") : b).join(".");
}
function descifrar(payload, clave) {
  const [, ivB64, tagB64, encB64] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", clave, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}
function almacenDeArchivo(ruta = ".bivoo-agent.json") {
  const rutaAbsoluta = path.isAbsolute(ruta) ? ruta : path.join(process.cwd(), ruta);
  const clave = () => claveMaestra();
  return {
    async leer() {
      try {
        const texto = await fs.readFile(rutaAbsoluta, "utf8");
        const k = clave();
        const contenido = k && texto.startsWith("v1.") ? descifrar(texto, k) : texto;
        return JSON.parse(contenido);
      } catch {
        return {};
      }
    },
    async guardar(config) {
      const k = clave();
      if (!k && !avisoPlanoMostrado) {
        avisoPlanoMostrado = true;
        console.warn(
          `[bivoo-agent-widget] Guardando la configuraci\xF3n SIN cifrar (${rutaAbsoluta}). Define BIVOO_CONFIG_KEY (32 bytes en base64) para cifrarla en reposo. No olvides a\xF1adir este archivo a .gitignore.`
        );
      }
      const texto = JSON.stringify(config, null, 2);
      await fs.writeFile(rutaAbsoluta, k ? cifrar(texto, k) : texto, "utf8");
    }
  };
}

// src/server/relay.ts
async function resolverConexion(almacen, nombre) {
  const todas = await almacen.leer();
  const guardada = todas[nombre];
  if ((guardada == null ? void 0 : guardada.gatewayUrl) && (guardada == null ? void 0 : guardada.appToken)) return guardada;
  if (nombre === "default") {
    const gatewayUrl = process.env.AGENT_GATEWAY_URL;
    const appToken = process.env.AGENT_APP_TOKEN;
    if (gatewayUrl && appToken) {
      return {
        enabled: true,
        gatewayUrl,
        appToken,
        toolSecret: process.env.AGENT_TOOL_SECRET
      };
    }
  }
  return null;
}
function base(conexion) {
  return conexion.gatewayUrl.replace(/\/+$/, "");
}
async function reenviarChatGet(req, conexion) {
  const url = new URL(req.url);
  const upstream = await fetch(`${base(conexion)}/api/chat${url.search}`, {
    headers: { "x-app-token": conexion.appToken }
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
async function reenviarChatPost(req, conexion) {
  const upstream = await fetch(`${base(conexion)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-token": conexion.appToken },
    body: await req.text()
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
async function probarConexion(conexion) {
  try {
    const r = await fetch(`${base(conexion)}/api/chat`, {
      headers: { "x-app-token": conexion.appToken },
      signal: AbortSignal.timeout(8e3)
    });
    if (r.status === 200) return { ok: true, detalle: "Conecta. El agente est\xE1 activo." };
    if (r.status === 403) return { ok: true, detalle: "Conecta, pero el agente est\xE1 apagado en el gateway." };
    if (r.status === 401) return { ok: false, detalle: "El App Token no es v\xE1lido." };
    return { ok: false, detalle: `El gateway respondi\xF3 ${r.status}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo conectar: ${msg}` };
  }
}
async function verificarLoginGateway(conexion, username, password) {
  try {
    const r = await fetch(`${base(conexion)}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8e3)
    });
    if (r.ok) return { ok: true, detalle: "Verificado." };
    const texto = await r.text().catch(() => "Usuario o contrase\xF1a incorrectos");
    return { ok: false, detalle: texto || "Usuario o contrase\xF1a incorrectos" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo contactar al gateway: ${msg}` };
  }
}
async function sincronizarOpenapi(conexion, specUrl) {
  var _a;
  try {
    const r = await fetch(`${base(conexion)}/api/apps/sync-openapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-token": conexion.appToken },
      body: JSON.stringify({ specUrl }),
      signal: AbortSignal.timeout(15e3)
    });
    const texto = await r.text();
    let datos = null;
    try {
      datos = JSON.parse(texto);
    } catch {
    }
    if (!r.ok) {
      const detalle = (_a = datos == null ? void 0 : datos.error) != null ? _a : texto;
      return { ok: false, detalle: detalle || "El gateway rechaz\xF3 la sincronizaci\xF3n" };
    }
    return { ok: true, detalle: "Sincronizado.", datos };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo contactar al gateway: ${msg}` };
  }
}
async function guardarConexion(almacen, nombre, conexion) {
  const todas = await almacen.leer();
  const actualizadas = { ...todas, [nombre]: conexion };
  await almacen.guardar(actualizadas);
}
function conexionParaMostrar(c) {
  if (!c) return null;
  return {
    enabled: c.enabled,
    gatewayUrl: c.gatewayUrl,
    appToken: c.appToken ? `${c.appToken.slice(0, 8)}${"\u2022".repeat(20)}` : "",
    hasAppToken: Boolean(c.appToken),
    hasToolSecret: Boolean(c.toolSecret)
  };
}

// src/server/rutas.ts
function createAgentRoutes(opciones = {}) {
  var _a, _b;
  const nombreAgente = (_a = opciones.agente) != null ? _a : "default";
  const almacen = (_b = opciones.almacen) != null ? _b : almacenDeArchivo();
  async function exigirAdmin(req) {
    if (!opciones.requireAdmin) {
      return new Response(
        "La configuraci\xF3n del agente est\xE1 bloqueada: falta pasar `requireAdmin` a createAgentRoutes(). El chat funciona igual sin esto.",
        { status: 501 }
      );
    }
    const ok = await opciones.requireAdmin(req);
    return ok ? null : new Response("No autorizado", { status: 401 });
  }
  async function GET2(req, ctx) {
    const { ruta = [] } = await ctx.params;
    if (ruta.length === 0) {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) return new Response("Agente no configurado", { status: 500 });
      return reenviarChatGet(req, conexion);
    }
    if (ruta[0] === "config") {
      const bloqueo = await exigirAdmin(req);
      if (bloqueo) return bloqueo;
      const conexion = await resolverConexion(almacen, nombreAgente);
      return Response.json({ conexion: conexionParaMostrar(conexion) });
    }
    return new Response("No encontrado", { status: 404 });
  }
  async function POST2(req, ctx) {
    var _a2, _b2, _c, _d, _e, _f, _g;
    const { ruta = [] } = await ctx.params;
    if (ruta.length === 0) {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) return new Response("Agente no configurado", { status: 500 });
      return reenviarChatPost(req, conexion);
    }
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const body = await req.json().catch(() => ({}));
    if (ruta[0] === "test-connection") {
      const escrito = String((_a2 = body.appToken) != null ? _a2 : "").trim();
      const usaGuardado = !escrito || escrito.includes("\u2022\u2022\u2022\u2022");
      const guardada = usaGuardado ? await resolverConexion(almacen, nombreAgente) : null;
      const gatewayUrl = String((_c = (_b2 = body.gatewayUrl) != null ? _b2 : guardada == null ? void 0 : guardada.gatewayUrl) != null ? _c : "").trim();
      const appToken = usaGuardado ? (_d = guardada == null ? void 0 : guardada.appToken) != null ? _d : "" : escrito;
      if (!gatewayUrl || !appToken) {
        return Response.json({ ok: false, detalle: "Falta la URL o el App Token" }, { status: 400 });
      }
      return Response.json(await probarConexion({ gatewayUrl, appToken }));
    }
    if (ruta[0] === "verify-login") {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) {
        return Response.json({ ok: false, detalle: "Configura primero la URL del gateway" }, { status: 400 });
      }
      const r = await verificarLoginGateway(conexion, String((_e = body.username) != null ? _e : ""), String((_f = body.password) != null ? _f : ""));
      return Response.json(r, { status: r.ok ? 200 : 401 });
    }
    if (ruta[0] === "sync-tools") {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) {
        return Response.json({ ok: false, detalle: "Configura primero la URL del gateway" }, { status: 400 });
      }
      const specUrl = String((_g = body.specUrl) != null ? _g : "").trim();
      if (!specUrl) return Response.json({ ok: false, detalle: "Falta specUrl" }, { status: 400 });
      const r = await sincronizarOpenapi(conexion, specUrl);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    return new Response("No encontrado", { status: 404 });
  }
  async function PUT2(req, ctx) {
    var _a2, _b2, _c;
    const { ruta = [] } = await ctx.params;
    if (ruta[0] !== "config") return new Response("No encontrado", { status: 404 });
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const actual = await resolverConexion(almacen, nombreAgente);
    const body = await req.json().catch(() => ({}));
    const appTokenNuevo = typeof body.appToken === "string" ? body.appToken.trim() : "";
    const gatewayUrl = String((_b2 = (_a2 = body.gatewayUrl) != null ? _a2 : actual == null ? void 0 : actual.gatewayUrl) != null ? _b2 : "").trim().replace(/\/+$/, "");
    const appToken = appTokenNuevo && !appTokenNuevo.includes("\u2022\u2022\u2022\u2022") ? appTokenNuevo : (_c = actual == null ? void 0 : actual.appToken) != null ? _c : "";
    const toolSecretNuevo = typeof body.toolSecret === "string" ? body.toolSecret.trim() : "";
    const toolSecret = toolSecretNuevo && !toolSecretNuevo.includes("\u2022\u2022\u2022\u2022") ? toolSecretNuevo : actual == null ? void 0 : actual.toolSecret;
    if (!gatewayUrl || !/^https?:\/\//i.test(gatewayUrl)) {
      return Response.json({ ok: false, detalle: "La URL debe empezar por http:// o https://" }, { status: 400 });
    }
    if (!appToken) {
      return Response.json({ ok: false, detalle: "Falta el App Token" }, { status: 400 });
    }
    const conexion = {
      enabled: body.enabled !== false,
      gatewayUrl,
      appToken,
      toolSecret: toolSecret || void 0
    };
    await guardarConexion(almacen, nombreAgente, conexion);
    return Response.json({ ok: true, conexion: conexionParaMostrar(conexion) });
  }
  return { GET: GET2, POST: POST2, PUT: PUT2 };
}
var { GET, POST, PUT } = createAgentRoutes();
export {
  GET,
  POST,
  PUT,
  almacenDeArchivo,
  createAgentRoutes
};
//# sourceMappingURL=server.js.map