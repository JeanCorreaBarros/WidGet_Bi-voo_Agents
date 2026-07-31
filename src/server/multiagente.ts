/**
 * Las rutas HTTP del sistema de varios-agentes-por-configuración
 * (agentes.ts). Tres piezas, tres archivos de ruta en tu app — cada una
 * vive donde le corresponde por seguridad, no por comodidad:
 *
 *   1. `createAgentesListado()`    → PÚBLICA. "¿Qué agentes hay y en qué
 *      ruta va cada uno?" — sin secretos. Es lo que consulta el componente
 *      que decide qué widget montar (ver MultiAgentChat en el paquete
 *      principal).
 *
 *   2. `createAgentePublicoRoute()` → PÚBLICA. El chat de UN agente
 *      "publico" por slug. Rechaza (403) si ese slug no existe o es
 *      "staff" — así nadie prueba slugs para hablar con un agente interno
 *      saltándose tu middleware.
 *
 *   3. `createAgentesAdminRoutes()` → va DENTRO de tu propia zona
 *      protegida (donde ya exiges sesión de administrador). Listar todos,
 *      crear, editar, borrar, el chat de los agentes "staff", y la
 *      conexión de cualquiera de los dos — todo junto, porque configurar
 *      SIEMPRE es cosa de quien administra, sin importar si el agente en
 *      sí es público.
 *
 * Las tres comparten almacenAgentes (metadata) y almacen (conexión: URL,
 * token, secreto) — el mismo `AlmacenConfig` que ya usa `createAgentRoutes`.
 */

import type { AlmacenConfig } from "./almacen";
import { almacenDeArchivo } from "./almacen";
import type { AccesoAgente, AlmacenAgentes, Audiencia } from "./agentes";
import { almacenAgentesDeArchivo, endpointDe, saneaExclusiones, saneaRuta, saneaSlug } from "./agentes";
import { createAgentRoutes } from "./rutas";
import { reenviarChatGet, reenviarChatPost, resolverConexion } from "./relay";

type ComprobacionAuth = (req: Request) => boolean | Promise<boolean>;
type CalculaIdentidad = (req: Request, audience: Audiencia) => Record<string, string> | Promise<Record<string, string>>;

type OpcionesComunes = {
  almacenAgentes?: AlmacenAgentes;
  almacen?: AlmacenConfig;
  requireAdmin?: ComprobacionAuth;
  /** Cabeceras de identidad para el gateway (quién pregunta, qué permisos). Ver reenviarChatGet en relay.ts. */
  identidad?: CalculaIdentidad;
  /** URLs donde montaste las otras dos piezas — solo hace falta si no usas los valores por defecto (ver endpointDe). */
  base?: { publico?: string; staff?: string };
};

function agenteVisible(a: AccesoAgente, base?: OpcionesComunes["base"]) {
  return {
    slug: a.slug,
    label: a.label,
    audience: a.audience,
    mountPath: a.mountPath,
    excludePaths: a.excludePaths,
    // Redundante en el listado público (ahí solo se incluyen los
    // encendidos), pero imprescindible en el admin: sin esto no habría
    // forma de saber, desde la respuesta, cuáles están apagados.
    enabled: a.enabled,
    endpoint: endpointDe(a.slug, a.audience, base),
  };
}

/**
 * "¿Qué agentes hay y en qué ruta va cada uno?" — PÚBLICA a propósito: un
 * visitante tiene que poder descubrir el agente público antes de haber
 * iniciado sesión. Los "staff" no aparecen en la lista salvo que
 * `requireAdmin` diga que sí — así ser pública no revela agentes internos.
 *
 * Mételo en cualquier ruta, p. ej. `app/api/agentes/route.ts`:
 *
 *   export const { GET } = createAgentesListado({ requireAdmin });
 */
export function createAgentesListado(opciones: OpcionesComunes = {}) {
  const almacenAgentes = opciones.almacenAgentes ?? almacenAgentesDeArchivo();

  async function GET(req: Request): Promise<Response> {
    const todos = await almacenAgentes.listar();
    const puedeConfigurar = opciones.requireAdmin ? await opciones.requireAdmin(req) : false;

    const agentes = todos
      .filter((a) => a.enabled)
      .filter((a) => a.audience === "publico" || puedeConfigurar)
      .map((a) => agenteVisible(a, opciones.base));

    return Response.json({ agentes, puedeConfigurar });
  }

  return { GET };
}

/**
 * El chat de UN agente público, por slug. Móntalo en una ruta dinámica de
 * tu zona PÚBLICA, p. ej. `app/api/agente/[slug]/route.ts`:
 *
 *   export const { GET, POST } = createAgentePublicoRoute();
 */
export function createAgentePublicoRoute(opciones: OpcionesComunes = {}) {
  const almacenAgentes = opciones.almacenAgentes ?? almacenAgentesDeArchivo();
  const almacen = opciones.almacen ?? almacenDeArchivo();

  type Ctx = { params: Promise<{ slug: string }> };

  async function acceso(ctx: Ctx): Promise<AccesoAgente | null> {
    const { slug } = await ctx.params;
    const a = await almacenAgentes.listar();
    const encontrado = a.find((x) => x.slug === slug);
    if (!encontrado || !encontrado.enabled || encontrado.audience !== "publico") return null;
    return encontrado;
  }

  async function GET(req: Request, ctx: Ctx): Promise<Response> {
    const a = await acceso(ctx);
    if (!a) return new Response("Agente desactivado", { status: 403 });
    const conexion = await resolverConexion(almacen, a.slug);
    if (!conexion) return new Response("Agente sin conexión configurada", { status: 500 });
    const extra = opciones.identidad ? await opciones.identidad(req, "publico") : {};
    return reenviarChatGet(req, conexion, extra);
  }

  async function POST(req: Request, ctx: Ctx): Promise<Response> {
    const a = await acceso(ctx);
    if (!a) return new Response("Agente desactivado", { status: 403 });
    const conexion = await resolverConexion(almacen, a.slug);
    if (!conexion) return new Response("Agente sin conexión configurada", { status: 500 });
    const extra = opciones.identidad ? await opciones.identidad(req, "publico") : {};
    return reenviarChatPost(req, conexion, extra);
  }

  return { GET, POST };
}

/**
 * Todo lo que exige ser administrador: listar TODOS los agentes, crear,
 * editar, borrar, el chat de los "staff" y la conexión de cualquiera.
 *
 * Se monta como catch-all DENTRO de tu zona ya protegida, p. ej.
 * `app/api/admin/agentes/[...ruta]/route.ts`:
 *
 *   export const { GET, POST, PUT, DELETE } = createAgentesAdminRoutes({ requireAdmin });
 *
 * Rutas que resuelve (todas exigen `requireAdmin`):
 *   GET    ""                       → listar todos (con conexión: solo si tiene, nunca el valor)
 *   POST   ""                       → crear { slug?, label, audience, mountPath, excludePaths?, enabled? }
 *   PUT    "<slug>"                 → editar metadata (label, audience, mountPath, excludePaths, enabled)
 *   DELETE "<slug>"                 → borrar (conexión incluida, sin deshacer)
 *   GET/POST/DELETE "<slug>/chat"   → el chat de ese agente (solo si es "staff")
 *   GET/POST/PUT    "<slug>/conexion/..." → delega en createAgentRoutes({ agente: slug })
 */
export function createAgentesAdminRoutes(opciones: OpcionesComunes = {}) {
  const almacenAgentes = opciones.almacenAgentes ?? almacenAgentesDeArchivo();
  const almacen = opciones.almacen ?? almacenDeArchivo();

  type Ctx = { params: Promise<{ ruta?: string[] }> };

  async function exigirAdmin(req: Request): Promise<Response | null> {
    if (!opciones.requireAdmin) {
      return new Response(
        "La gestión de agentes está bloqueada: falta pasar `requireAdmin` a createAgentesAdminRoutes().",
        { status: 501 },
      );
    }
    const ok = await opciones.requireAdmin(req);
    return ok ? null : new Response("No autorizado", { status: 401 });
  }

  function rutasConexionDe(slug: string) {
    // `createAgentRoutes` fija el nombre del agente al construirse; se
    // construye por petición porque solo es cerrar sobre un string.
    return createAgentRoutes({ agente: slug, almacen, requireAdmin: opciones.requireAdmin });
  }

  async function GET(req: Request, ctx: Ctx): Promise<Response> {
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const { ruta = [] } = await ctx.params;

    if (ruta.length === 0) {
      const todos = await almacenAgentes.listar();
      return Response.json({ agentes: todos.map((a) => agenteVisible(a, opciones.base)) });
    }

    const [slug, sub, ...resto] = ruta;
    const a = (await almacenAgentes.listar()).find((x) => x.slug === slug);
    if (!a) return new Response("No encontrado", { status: 404 });

    if (sub === "chat") {
      if (a.audience !== "staff") return new Response("Este agente no es de staff", { status: 400 });
      const conexion = await resolverConexion(almacen, slug);
      if (!conexion) return new Response("Agente sin conexión configurada", { status: 500 });
      const extra = opciones.identidad ? await opciones.identidad(req, "staff") : {};
      return reenviarChatGet(req, conexion, extra);
    }

    if (sub === "conexion") {
      return rutasConexionDe(slug).GET(req, { params: Promise.resolve({ ruta: resto }) });
    }

    return new Response("No encontrado", { status: 404 });
  }

  async function POST(req: Request, ctx: Ctx): Promise<Response> {
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const { ruta = [] } = await ctx.params;

    if (ruta.length === 0) {
      const body = await req.json().catch(() => ({}) as Record<string, unknown>);
      const label = String(body.label ?? "").trim();
      const slug = saneaSlug(String(body.slug ?? label));
      const audience: Audiencia = body.audience === "publico" ? "publico" : "staff";
      const mountPath = saneaRuta(String(body.mountPath ?? "/"));
      const excludePaths = typeof body.excludePaths === "string" ? saneaExclusiones(body.excludePaths) : "";
      const enabled = typeof body.enabled === "boolean" ? body.enabled : false;

      if (!label) return Response.json({ error: "Falta el nombre del agente" }, { status: 400 });
      if (!slug) {
        return Response.json(
          { error: "El nombre no deja un identificador válido: usa letras o números" },
          { status: 400 },
        );
      }
      try {
        const creado = await almacenAgentes.crear({ slug, label, audience, mountPath, excludePaths, enabled });
        return Response.json({ ok: true, agente: agenteVisible(creado, opciones.base) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo crear";
        return Response.json({ error: msg }, { status: 409 });
      }
    }

    const [slug, sub, ...resto] = ruta;
    if (sub === "chat") {
      const a = (await almacenAgentes.listar()).find((x) => x.slug === slug);
      if (!a) return new Response("No encontrado", { status: 404 });
      if (a.audience !== "staff") return new Response("Este agente no es de staff", { status: 400 });
      const conexion = await resolverConexion(almacen, slug);
      if (!conexion) return new Response("Agente sin conexión configurada", { status: 500 });
      const extra = opciones.identidad ? await opciones.identidad(req, "staff") : {};
      return reenviarChatPost(req, conexion, extra);
    }

    if (sub === "conexion") {
      return rutasConexionDe(slug).POST(req, { params: Promise.resolve({ ruta: resto }) });
    }

    return new Response("No encontrado", { status: 404 });
  }

  async function PUT(req: Request, ctx: Ctx): Promise<Response> {
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const { ruta = [] } = await ctx.params;
    if (ruta.length === 0) return new Response("No encontrado", { status: 404 });

    const [slug, sub, ...resto] = ruta;

    if (sub === "conexion") {
      return rutasConexionDe(slug).PUT(req, { params: Promise.resolve({ ruta: resto }) });
    }

    if (sub !== undefined) return new Response("No encontrado", { status: 404 });

    // PUT "<slug>": editar metadata. El slug no se puede cambiar aquí — es
    // lo que va en la URL del proxy con el que ya habla el widget instalado.
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const cambios: Record<string, unknown> = {};
    if (typeof body.label === "string" && body.label.trim()) cambios.label = body.label.trim();
    if (body.audience === "staff" || body.audience === "publico") cambios.audience = body.audience;
    if (typeof body.mountPath === "string") cambios.mountPath = saneaRuta(body.mountPath);
    if (typeof body.excludePaths === "string") cambios.excludePaths = saneaExclusiones(body.excludePaths);
    if (typeof body.enabled === "boolean") cambios.enabled = body.enabled;

    if (Object.keys(cambios).length === 0) {
      return Response.json({ error: "Nada que cambiar" }, { status: 400 });
    }

    const actualizado = await almacenAgentes.actualizar(slug, cambios);
    if (!actualizado) return new Response("No encontrado", { status: 404 });
    return Response.json({ ok: true, agente: agenteVisible(actualizado, opciones.base) });
  }

  async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
    const bloqueo = await exigirAdmin(req);
    if (bloqueo) return bloqueo;
    const { ruta = [] } = await ctx.params;
    const [slug, sub] = ruta;
    if (!slug || sub !== undefined) return new Response("No encontrado", { status: 404 });

    // Se lleva por delante la conexión guardada (url, token, secreto) y no
    // hay deshacer. Para quitar un agente de en medio sin perder eso, PUT
    // con `enabled: false` es casi siempre lo que conviene.
    await almacenAgentes.borrar(slug);
    return Response.json({ ok: true });
  }

  return { GET, POST, PUT, DELETE };
}
