/**
 * Varios agentes, definidos por configuración y no por código.
 *
 * `createAgentRoutes()` (rutas.ts) ya soporta cualquier cantidad de agentes
 * — el `agente` que le pasas es un string libre — pero decidir CUÁLES
 * existen y EN QUÉ RUTA se monta cada uno seguía siendo cosa tuya: crear
 * el archivo de ruta, importar `createAgentRoutes({ agente: "..." })` y
 * poner `<AgentChat endpoint="..." />` en el layout que corresponda.
 *
 * Eso funciona bien con dos o tres agentes fijos. Se queda corto en
 * cuanto quieres que alguien sin tocar código pueda mover un agente de
 * sitio, crear uno nuevo, o dejar una ruta sin ningún agente (un
 * checkout, una pasarela de pago) — lo de "toda la app menos una zona"
 * no se puede decir solo incluyendo.
 *
 * Este módulo es esa capa: una tabla de "accesos" (uno por agente, con su
 * público, su ruta y sus exclusiones) y el almacén por defecto. La lógica
 * pura que decide cuál toca en cada URL (`agenteParaRuta`, `endpointDe`)
 * vive en `../shared/agentes-ruta` porque también la usa el bundle de
 * cliente (`MultiAgentChat`) — se reexporta aquí para que solo haga falta
 * importar de `bivoo-agent-widget/server`. Las rutas HTTP están en
 * `multiagente.ts`.
 */

import { promises as fs } from "fs";
import path from "path";
import type { Audiencia, AgenteVisible } from "../shared/agentes-ruta";

export { agenteParaRuta, endpointDe } from "../shared/agentes-ruta";
export type { Audiencia, AgenteVisible } from "../shared/agentes-ruta";

/** Un agente: quién es, para quién es, y dónde se monta. Sin secretos — la conexión vive en AlmacenConfig (almacen.ts). */
export type AccesoAgente = {
  slug: string;
  label: string;
  audience: Audiencia;
  mountPath: string;
  excludePaths: string;
  enabled: boolean;
};

/** Datos para crear un acceso. `excludePaths` y `enabled` son opcionales — nace apagado si no se dice lo contrario. */
export type NuevoAccesoAgente = Pick<AccesoAgente, "slug" | "label" | "audience" | "mountPath"> &
  Partial<Pick<AccesoAgente, "excludePaths" | "enabled">>;

/** Qué puede cambiarse de un acceso ya creado. El `slug` no: es lo que ya está en la URL del proxy con el que habla el widget instalado. */
export type CambiosAccesoAgente = Partial<
  Pick<AccesoAgente, "label" | "audience" | "mountPath" | "excludePaths" | "enabled">
>;

export type AlmacenAgentes = {
  listar(): Promise<AccesoAgente[]>;
  /** Lanza si el slug ya existe. */
  crear(datos: NuevoAccesoAgente): Promise<AccesoAgente>;
  /** `null` si el slug no existe. */
  actualizar(slug: string, cambios: CambiosAccesoAgente): Promise<AccesoAgente | null>;
  borrar(slug: string): Promise<void>;
};

/** Ruta segura para meter en una URL: minúsculas, números y guiones. */
export function saneaSlug(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Una ruta de montaje normalizada: empieza por "/", no acaba en "/". */
export function saneaRuta(v: string): string {
  const limpia = `/${String(v || "/").trim()}`.replace(/\/+/g, "/").replace(/\/+$/, "");
  return limpia === "" ? "/" : limpia;
}

/** Lista de exclusiones normalizada: cada ruta saneada, sin huecos ni repetidas. */
export function saneaExclusiones(v: string): string {
  const rutas = String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(saneaRuta);
  return [...new Set(rutas)].join(",");
}

/* ---------- almacén por defecto: un archivo JSON en el proyecto ----------
   Sin secretos, así que sin cifrado — a diferencia de almacen.ts, que sí
   guarda tokens. Si prefieres tu base de datos, pásale tu propio
   `AlmacenAgentes` (misma idea que `AlmacenConfig`, ver README). */
export function almacenAgentesDeArchivo(ruta = ".bivoo-agentes.json"): AlmacenAgentes {
  const rutaAbsoluta = path.isAbsolute(ruta) ? ruta : path.join(process.cwd(), ruta);

  async function leerTodos(): Promise<AccesoAgente[]> {
    try {
      const texto = await fs.readFile(rutaAbsoluta, "utf8");
      return JSON.parse(texto) as AccesoAgente[];
    } catch {
      return [];
    }
  }

  async function guardarTodos(agentes: AccesoAgente[]): Promise<void> {
    await fs.writeFile(rutaAbsoluta, JSON.stringify(agentes, null, 2), "utf8");
  }

  return {
    listar: leerTodos,

    async crear(datos) {
      const todos = await leerTodos();
      if (todos.some((a) => a.slug === datos.slug)) {
        throw new Error(`Ya existe un agente con el identificador "${datos.slug}"`);
      }
      const nuevo: AccesoAgente = {
        slug: datos.slug,
        label: datos.label,
        audience: datos.audience,
        mountPath: datos.mountPath,
        excludePaths: datos.excludePaths ?? "",
        // Nace apagado salvo que se diga lo contrario: encenderlo antes de
        // tener conexión solo serviría para mostrar una burbuja rota.
        enabled: datos.enabled ?? false,
      };
      await guardarTodos([...todos, nuevo]);
      return nuevo;
    },

    async actualizar(slug, cambios) {
      const todos = await leerTodos();
      const i = todos.findIndex((a) => a.slug === slug);
      if (i === -1) return null;
      const actualizado: AccesoAgente = { ...todos[i], ...cambios };
      todos[i] = actualizado;
      await guardarTodos(todos);
      return actualizado;
    },

    async borrar(slug) {
      const todos = await leerTodos();
      await guardarTodos(todos.filter((a) => a.slug !== slug));
    },
  };
}
