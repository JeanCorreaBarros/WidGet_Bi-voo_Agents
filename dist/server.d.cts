/**
 * Dónde vive la configuración de conexión (URL del gateway, appToken,
 * secreto de herramientas) que el propio widget guarda desde su panel.
 *
 * Por defecto, un archivo en el propio proyecto — ningún host tiene
 * garantizada una base de datos, pero SÍ un disco (mientras no sea
 * serverless: ver el aviso más abajo). Si necesitas guardar distinto —tu
 * propia base de datos, por ejemplo—, pásale tu propio `AlmacenConfig` a
 * `createAgentRoutes({ almacen: ... })` en vez de usar el de archivo.
 *
 * ⚠️ En hosting serverless (funciones de Vercel, Netlify…) el disco no es
 * persistente entre invocaciones: lo que se guarde aquí puede desaparecer.
 * Para esos casos, usa tu propio `AlmacenConfig` respaldado en una base de
 * datos de verdad.
 */
/** Conexión de UN agente (puede haber varios: panel, tienda…). */
type ConexionAgente = {
    enabled: boolean;
    gatewayUrl: string;
    appToken: string;
    toolSecret?: string;
};
/** Todas las conexiones guardadas, por nombre. "default" si no se especifica otro. */
type ConfigAgentes = Record<string, ConexionAgente>;
type AlmacenConfig = {
    leer(): Promise<ConfigAgentes>;
    guardar(config: ConfigAgentes): Promise<void>;
};
/**
 * El almacén por defecto: un archivo JSON en el proyecto.
 *
 * @param ruta Dónde guardarlo. Relativa a `process.cwd()` si no es absoluta.
 *   Por defecto `.bivoo-agent.json` — recuerda añadirlo a tu `.gitignore`.
 */
declare function almacenDeArchivo(ruta?: string): AlmacenConfig;

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

type CrearRutasOpciones = {
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
type Contexto = {
    params: Promise<{
        ruta?: string[];
    }>;
};
declare function createAgentRoutes(opciones?: CrearRutasOpciones): {
    GET: (req: Request, ctx: Contexto) => Promise<Response>;
    POST: (req: Request, ctx: Contexto) => Promise<Response>;
    PUT: (req: Request, ctx: Contexto) => Promise<Response>;
};
declare const GET: (req: Request, ctx: Contexto) => Promise<Response>;
declare const POST: (req: Request, ctx: Contexto) => Promise<Response>;
declare const PUT: (req: Request, ctx: Contexto) => Promise<Response>;

export { type AlmacenConfig, type ConexionAgente, type ConfigAgentes, type CrearRutasOpciones, GET, POST, PUT, almacenDeArchivo, createAgentRoutes };
