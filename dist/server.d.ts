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
type Audiencia = "staff" | "publico";
/** Lo que el navegador necesita de un agente: nada de secretos, solo cómo mostrarlo y a quién hablarle. */
type AgenteVisible = {
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
/**
 * Cuál de todos toca en una ruta concreta.
 *
 * Si varios encajan (por ejemplo "/" y "/admin" cuando estás en /admin/x),
 * gana el más específico — el prefijo más largo. Un agente excluido de una
 * ruta no compite por ella: se aparta y deja que gane el siguiente, si es
 * que hay alguno.
 */
declare function agenteParaRuta<T extends Pick<AgenteVisible, "mountPath" | "excludePaths">>(agentes: T[], ruta: string): T | null;
/**
 * A qué proxy de tu app debe hablarle el widget de un agente, según su
 * audiencia. Los valores por defecto asumen `createAgentePublicoRoute()`
 * bajo `/api/agente` y `createAgentesAdminRoutes()` bajo
 * `/api/admin/agentes` — pásalos en `base` si usas otros caminos.
 */
declare function endpointDe(slug: string, audience: Audiencia, base?: {
    publico?: string;
    staff?: string;
}): string;

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

/** Un agente: quién es, para quién es, y dónde se monta. Sin secretos — la conexión vive en AlmacenConfig (almacen.ts). */
type AccesoAgente = {
    slug: string;
    label: string;
    audience: Audiencia;
    mountPath: string;
    excludePaths: string;
    enabled: boolean;
};
/** Datos para crear un acceso. `excludePaths` y `enabled` son opcionales — nace apagado si no se dice lo contrario. */
type NuevoAccesoAgente = Pick<AccesoAgente, "slug" | "label" | "audience" | "mountPath"> & Partial<Pick<AccesoAgente, "excludePaths" | "enabled">>;
/** Qué puede cambiarse de un acceso ya creado. El `slug` no: es lo que ya está en la URL del proxy con el que habla el widget instalado. */
type CambiosAccesoAgente = Partial<Pick<AccesoAgente, "label" | "audience" | "mountPath" | "excludePaths" | "enabled">>;
type AlmacenAgentes = {
    listar(): Promise<AccesoAgente[]>;
    /** Lanza si el slug ya existe. */
    crear(datos: NuevoAccesoAgente): Promise<AccesoAgente>;
    /** `null` si el slug no existe. */
    actualizar(slug: string, cambios: CambiosAccesoAgente): Promise<AccesoAgente | null>;
    borrar(slug: string): Promise<void>;
};
/** Ruta segura para meter en una URL: minúsculas, números y guiones. */
declare function saneaSlug(v: string): string;
/** Una ruta de montaje normalizada: empieza por "/", no acaba en "/". */
declare function saneaRuta(v: string): string;
/** Lista de exclusiones normalizada: cada ruta saneada, sin huecos ni repetidas. */
declare function saneaExclusiones(v: string): string;
declare function almacenAgentesDeArchivo(ruta?: string): AlmacenAgentes;

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

type ComprobacionAuth = (req: Request) => boolean | Promise<boolean>;
type CalculaIdentidad = (req: Request, audience: Audiencia) => Record<string, string> | Promise<Record<string, string>>;
type OpcionesComunes = {
    almacenAgentes?: AlmacenAgentes;
    almacen?: AlmacenConfig;
    requireAdmin?: ComprobacionAuth;
    /** Cabeceras de identidad para el gateway (quién pregunta, qué permisos). Ver reenviarChatGet en relay.ts. */
    identidad?: CalculaIdentidad;
    /** URLs donde montaste las otras dos piezas — solo hace falta si no usas los valores por defecto (ver endpointDe). */
    base?: {
        publico?: string;
        staff?: string;
    };
};
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
declare function createAgentesListado(opciones?: OpcionesComunes): {
    GET: (req: Request) => Promise<Response>;
};
/**
 * El chat de UN agente público, por slug. Móntalo en una ruta dinámica de
 * tu zona PÚBLICA, p. ej. `app/api/agente/[slug]/route.ts`:
 *
 *   export const { GET, POST } = createAgentePublicoRoute();
 */
declare function createAgentePublicoRoute(opciones?: OpcionesComunes): {
    GET: (req: Request, ctx: {
        params: Promise<{
            slug: string;
        }>;
    }) => Promise<Response>;
    POST: (req: Request, ctx: {
        params: Promise<{
            slug: string;
        }>;
    }) => Promise<Response>;
};
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
declare function createAgentesAdminRoutes(opciones?: OpcionesComunes): {
    GET: (req: Request, ctx: {
        params: Promise<{
            ruta?: string[];
        }>;
    }) => Promise<Response>;
    POST: (req: Request, ctx: {
        params: Promise<{
            ruta?: string[];
        }>;
    }) => Promise<Response>;
    PUT: (req: Request, ctx: {
        params: Promise<{
            ruta?: string[];
        }>;
    }) => Promise<Response>;
    DELETE: (req: Request, ctx: {
        params: Promise<{
            ruta?: string[];
        }>;
    }) => Promise<Response>;
};

export { type AccesoAgente, type AlmacenAgentes, type AlmacenConfig, type Audiencia, type CambiosAccesoAgente, type ConexionAgente, type ConfigAgentes, type CrearRutasOpciones, GET, type NuevoAccesoAgente, POST, PUT, agenteParaRuta, almacenAgentesDeArchivo, almacenDeArchivo, createAgentRoutes, createAgentePublicoRoute, createAgentesAdminRoutes, createAgentesListado, endpointDe, saneaExclusiones, saneaRuta, saneaSlug };
