/**
 * Un solo mount point para TODO: el chat (público, como siempre) y la
 * configuración del agente (bloqueada hasta que le des tu propio chequeo
 * de admin).
 *
 * Uso mínimo, en tu app Next.js:
 *
 *   // app/api/agent/[...ruta]/route.ts
 *   export { GET, POST, PUT } from "bivoo-agent-widget/server";
 *
 * Con SOLO eso, el chat ya funciona (si tienes AGENT_GATEWAY_URL y
 * AGENT_APP_TOKEN en el entorno — igual que antes de que existiera este
 * paquete). El panel de configuración del widget (gear → Conexión) queda
 * bloqueado hasta que definas `requireAdmin`:
 *
 *   export const { GET, POST, PUT } = createAgentRoutes({
 *     requireAdmin: async (req) => miPropiaComprobacion(req),
 *   });
 *
 * Usa Request/Response nativos (Fetch API) — nada de `next/server` aquí
 * adentro, así que esta pieza en concreto no depende de Next.js. El único
 * trozo específico de framework es cómo tu ruta te pasa los parámetros de
 * la URL (`ctx.params`), que en Next.js App Router llega como
 * `Promise<{ ruta: string[] }>` — si mañana hace falta un adaptador para
 * otro framework, es la única pieza que cambiaría.
 */

import type { AlmacenConfig, ConexionAgente } from "./almacen";
import { almacenDeArchivo } from "./almacen";
import {
  resolverConexion,
  guardarConexion,
  conexionParaMostrar,
  reenviarChatGet,
  reenviarChatPost,
  probarConexion,
  verificarLoginGateway,
  sincronizarOpenapi,
} from "./relay";

export type CrearRutasOpciones = {
  /** Nombre del agente, si vas a montar varios (uno por instancia del widget). */
  agente?: string;
  /** Dónde guardar la configuración. Por defecto, un archivo local (ver almacen.ts). */
  almacen?: AlmacenConfig;
  /**
   * Decide si quien hace la petición puede VER o CAMBIAR la configuración
   * del agente. El chat NO pasa por aquí — sigue siendo público, como
   * cualquier chat embebido en tu web.
   *
   * Sin esto, las rutas de configuración responden 501: el widget seguirá
   * chateando con normalidad, pero su pestaña de Conexión no funcionará
   * hasta que la definas. Es la única pieza que este paquete no puede
   * adivinar por ti — cada app tiene su propio sistema de sesiones.
   */
  requireAdmin?: (req: Request) => boolean | Promise<boolean>;
};

type Contexto = { params: Promise<{ ruta?: string[] }> };

export function createAgentRoutes(opciones: CrearRutasOpciones = {}) {
  const nombreAgente = opciones.agente ?? "default";
  const almacen = opciones.almacen ?? almacenDeArchivo();

  async function exigirAdmin(req: Request): Promise<Response | null> {
    if (!opciones.requireAdmin) {
      return new Response(
        "La configuración del agente está bloqueada: falta pasar `requireAdmin` " +
          "a createAgentRoutes(). El chat funciona igual sin esto.",
        { status: 501 },
      );
    }
    const ok = await opciones.requireAdmin(req);
    return ok ? null : new Response("No autorizado", { status: 401 });
  }

  async function GET(req: Request, ctx: Contexto): Promise<Response> {
    const { ruta = [] } = await ctx.params;

    if (ruta.length === 0) {
      // Metadatos o, con ?sse=1, el canal de sugerencias — público.
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

  async function POST(req: Request, ctx: Contexto): Promise<Response> {
    const { ruta = [] } = await ctx.params;

    if (ruta.length === 0) {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) return new Response("Agente no configurado", { status: 500 });
      return reenviarChatPost(req, conexion);
    }

    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    if (ruta[0] === "test-connection") {
      // Sin token en el body (o con la máscara que ya enseñó /config, sin
      // que el usuario la haya tocado), se prueba con el que ya está
      // guardado — así "Probar conexión" funciona sobre lo que ya
      // configuraste, sin obligar a volver a pegar el token cada vez.
      const escrito = String(body.appToken ?? "").trim();
      const usaGuardado = !escrito || escrito.includes("••••");
      const guardada = usaGuardado ? await resolverConexion(almacen, nombreAgente) : null;

      const gatewayUrl = String(body.gatewayUrl ?? guardada?.gatewayUrl ?? "").trim();
      const appToken = usaGuardado ? (guardada?.appToken ?? "") : escrito;

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
      const r = await verificarLoginGateway(conexion, String(body.username ?? ""), String(body.password ?? ""));
      return Response.json(r, { status: r.ok ? 200 : 401 });
    }

    if (ruta[0] === "sync-tools") {
      const conexion = await resolverConexion(almacen, nombreAgente);
      if (!conexion) {
        return Response.json({ ok: false, detalle: "Configura primero la URL del gateway" }, { status: 400 });
      }
      const specUrl = String(body.specUrl ?? "").trim();
      if (!specUrl) return Response.json({ ok: false, detalle: "Falta specUrl" }, { status: 400 });
      const r = await sincronizarOpenapi(conexion, specUrl);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }

    return new Response("No encontrado", { status: 404 });
  }

  async function PUT(req: Request, ctx: Contexto): Promise<Response> {
    const { ruta = [] } = await ctx.params;
    if (ruta[0] !== "config") return new Response("No encontrado", { status: 404 });

    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;

    const actual = await resolverConexion(almacen, nombreAgente);
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // El token que se ENSEÑA viene enmascarado (ver conexionParaMostrar). Si
    // el formulario lo reenvía tal cual sin que el usuario lo haya tocado,
    // NO se debe guardar esa máscara como si fuera el token real — se
    // conserva el que ya había. Solo se reemplaza si llega algo nuevo.
    const appTokenNuevo = typeof body.appToken === "string" ? body.appToken.trim() : "";
    const gatewayUrl = String(body.gatewayUrl ?? actual?.gatewayUrl ?? "")
      .trim()
      .replace(/\/+$/, "");
    const appToken = appTokenNuevo && !appTokenNuevo.includes("••••") ? appTokenNuevo : (actual?.appToken ?? "");
    const toolSecretNuevo = typeof body.toolSecret === "string" ? body.toolSecret.trim() : "";
    const toolSecret =
      toolSecretNuevo && !toolSecretNuevo.includes("••••") ? toolSecretNuevo : actual?.toolSecret;

    if (!gatewayUrl || !/^https?:\/\//i.test(gatewayUrl)) {
      return Response.json({ ok: false, detalle: "La URL debe empezar por http:// o https://" }, { status: 400 });
    }
    if (!appToken) {
      return Response.json({ ok: false, detalle: "Falta el App Token" }, { status: 400 });
    }

    const conexion: ConexionAgente = {
      enabled: body.enabled !== false,
      gatewayUrl,
      appToken,
      toolSecret: toolSecret || undefined,
    };
    await guardarConexion(almacen, nombreAgente, conexion);
    return Response.json({ ok: true, conexion: conexionParaMostrar(conexion) });
  }

  return { GET, POST, PUT };
}

// Handlers listos para usar tal cual, con la configuración más simple
// posible (un solo agente, sin panel de configuración hasta que definas
// requireAdmin). Es lo que resuelve `import ... from "bivoo-agent-widget/server"`.
export const { GET, POST, PUT } = createAgentRoutes();
