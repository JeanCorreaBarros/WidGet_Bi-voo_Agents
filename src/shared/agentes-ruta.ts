/**
 * La parte de "varios agentes por configuración" que también corre en el
 * navegador: cero dependencias de Node (nada de `fs`), a propósito.
 *
 * `MultiAgentChat.tsx` (bundle de cliente) y `server/agentes.ts` (bundle de
 * servidor) importan de aquí en vez de duplicar la lógica — si el criterio
 * de "qué agente toca en esta ruta" cambiara, solo hay un sitio que tocar,
 * y el cliente y el servidor nunca podrían decidir cosas distintas.
 */

/**
 * A quién va dirigido un agente:
 *   "staff"   → solo debe verse en tu zona protegida.
 *   "publico" → lo ve cualquiera.
 * Es un string y no un enum cerrado para no forzar una migración de tipo
 * si mañana hace falta un tercer comportamiento.
 */
export type Audiencia = "staff" | "publico";

/** Lo que el navegador necesita de un agente: nada de secretos, solo cómo mostrarlo y a quién hablarle. */
export type AgenteVisible = {
  slug: string;
  label: string;
  audience: Audiencia;
  /** Prefijo de ruta donde debe verse. "/" = toda la app. */
  mountPath: string;
  /** Rutas donde NO debe verse aunque encajen en mountPath, separadas por comas. */
  excludePaths?: string;
  /** Proxy de tu app al que debe hablarle el widget. */
  endpoint: string;
};

/** Si una ruta cae dentro de un prefijo ("/admin" contiene "/admin/x" pero no "/administracion"). */
function dentroDe(prefijo: string, ruta: string): boolean {
  const base = prefijo.replace(/\/+$/, "");
  if (base === "") return true; // "/" lo cubre todo
  return ruta === base || ruta.startsWith(`${base}/`);
}

function exclusiones(a: { excludePaths?: string }): string[] {
  return (a.excludePaths ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Cuál de todos toca en una ruta concreta.
 *
 * Si varios encajan (por ejemplo "/" y "/admin" cuando estás en /admin/x),
 * gana el más específico — el prefijo más largo. Un agente excluido de una
 * ruta no compite por ella: se aparta y deja que gane el siguiente, si es
 * que hay alguno.
 */
export function agenteParaRuta<T extends Pick<AgenteVisible, "mountPath" | "excludePaths">>(
  agentes: T[],
  ruta: string,
): T | null {
  const encajan = agentes.filter(
    (a) => dentroDe(a.mountPath, ruta) && !exclusiones(a).some((ex) => dentroDe(ex, ruta)),
  );
  if (encajan.length === 0) return null;
  return encajan.sort((x, y) => y.mountPath.length - x.mountPath.length)[0];
}

/**
 * A qué proxy de tu app debe hablarle el widget de un agente, según su
 * audiencia. Los valores por defecto asumen `createAgentePublicoRoute()`
 * bajo `/api/agente` y `createAgentesAdminRoutes()` bajo
 * `/api/admin/agentes` — pásalos en `base` si usas otros caminos.
 */
export function endpointDe(
  slug: string,
  audience: Audiencia,
  base: { publico?: string; staff?: string } = {},
): string {
  const publico = base.publico ?? "/api/agente";
  const staff = base.staff ?? "/api/admin/agentes";
  return audience === "publico" ? `${publico}/${slug}` : `${staff}/${slug}/chat`;
}
