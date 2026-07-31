/**
 * Lo que habla con el gateway, servidor-a-servidor. Nada de esto se ejecuta
 * en el navegador — es la pieza que hace innecesario escribir el proxy a
 * mano en cada proyecto.
 */

import type { ConexionAgente, ConfigAgentes, AlmacenConfig } from "./almacen";

/**
 * Resuelve la conexión de un agente por nombre.
 *
 * Primero mira lo guardado (lo que se configuró desde el panel del
 * widget). Si no hay nada Y el nombre es "default", cae en las variables
 * de entorno de siempre (`AGENT_GATEWAY_URL`/`AGENT_APP_TOKEN`) — así una
 * instalación mínima, solo con esas dos variables, sigue funcionando
 * exactamente igual que antes de que existiera este módulo.
 */
export async function resolverConexion(
  almacen: AlmacenConfig,
  nombre: string,
): Promise<ConexionAgente | null> {
  const todas = await almacen.leer();
  const guardada = todas[nombre];
  if (guardada?.gatewayUrl && guardada?.appToken) return guardada;

  if (nombre === "default") {
    const gatewayUrl = process.env.AGENT_GATEWAY_URL;
    const appToken = process.env.AGENT_APP_TOKEN;
    if (gatewayUrl && appToken) {
      return {
        enabled: true,
        gatewayUrl,
        appToken,
        toolSecret: process.env.AGENT_TOOL_SECRET,
      };
    }
  }
  return null;
}

function base(conexion: ConexionAgente): string {
  return conexion.gatewayUrl.replace(/\/+$/, "");
}

/** GET /api/chat (metadatos) o ?sse=1 (canal de sugerencias) — se reenvía tal cual. */
export async function reenviarChatGet(req: Request, conexion: ConexionAgente): Promise<Response> {
  const url = new URL(req.url);
  const upstream = await fetch(`${base(conexion)}/api/chat${url.search}`, {
    headers: { "x-app-token": conexion.appToken },
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

/** POST /api/chat — el streaming se reenvía sin bufferizar. */
export async function reenviarChatPost(req: Request, conexion: ConexionAgente): Promise<Response> {
  const upstream = await fetch(`${base(conexion)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-token": conexion.appToken },
    body: await req.text(),
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

/**
 * ¿Esta URL+token de verdad hablan con un gateway?
 *
 * 200 (hay metadatos) o 403 (el agente está apagado, pero el token es
 * válido) cuentan como "conecta". 401 es token inválido. Cualquier otra
 * cosa es un problema de red o de URL.
 */
export async function probarConexion(
  conexion: Pick<ConexionAgente, "gatewayUrl" | "appToken">,
): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await fetch(`${base(conexion as ConexionAgente)}/api/chat`, {
      headers: { "x-app-token": conexion.appToken },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 200) return { ok: true, detalle: "Conecta. El agente está activo." };
    if (r.status === 403) return { ok: true, detalle: "Conecta, pero el agente está apagado en el gateway." };
    if (r.status === 401) return { ok: false, detalle: "El App Token no es válido." };
    return { ok: false, detalle: `El gateway respondió ${r.status}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo conectar: ${msg}` };
  }
}

/** Verifica usuario/contraseña del PANEL del gateway (no de tu app). */
export async function verificarLoginGateway(
  conexion: Pick<ConexionAgente, "gatewayUrl">,
  username: string,
  password: string,
): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await fetch(`${base(conexion as ConexionAgente)}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true, detalle: "Verificado." };
    const texto = await r.text().catch(() => "Usuario o contraseña incorrectos");
    return { ok: false, detalle: texto || "Usuario o contraseña incorrectos" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo contactar al gateway: ${msg}` };
  }
}

/** Sincroniza las herramientas del agente con su propio Swagger/OpenAPI. */
export async function sincronizarOpenapi(
  conexion: ConexionAgente,
  specUrl: string,
): Promise<{ ok: boolean; detalle: string; datos?: unknown }> {
  try {
    const r = await fetch(`${base(conexion)}/api/apps/sync-openapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-token": conexion.appToken },
      body: JSON.stringify({ specUrl }),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await r.text();
    let datos: unknown = null;
    try {
      datos = JSON.parse(texto);
    } catch {
      /* respuesta de error: texto plano, no JSON */
    }
    if (!r.ok) {
      const detalle = (datos as { error?: string } | null)?.error ?? texto;
      return { ok: false, detalle: detalle || "El gateway rechazó la sincronización" };
    }
    return { ok: true, detalle: "Sincronizado.", datos };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, detalle: `No se pudo contactar al gateway: ${msg}` };
  }
}

/** Guarda (o crea) la conexión de un agente por nombre. */
export async function guardarConexion(
  almacen: AlmacenConfig,
  nombre: string,
  conexion: ConexionAgente,
): Promise<void> {
  const todas = await almacen.leer();
  const actualizadas: ConfigAgentes = { ...todas, [nombre]: conexion };
  await almacen.guardar(actualizadas);
}

/** La conexión de un agente, con el token ENMASCARADO — para mostrar en el panel. */
export function conexionParaMostrar(c: ConexionAgente | null) {
  if (!c) return null;
  return {
    enabled: c.enabled,
    gatewayUrl: c.gatewayUrl,
    appToken: c.appToken ? `${c.appToken.slice(0, 8)}${"•".repeat(20)}` : "",
    hasAppToken: Boolean(c.appToken),
    hasToolSecret: Boolean(c.toolSecret),
  };
}
