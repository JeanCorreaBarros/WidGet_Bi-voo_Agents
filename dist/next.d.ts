import * as react from 'react';

/**
 * El único sitio donde montar el widget cuando tienes varios agentes
 * definidos por configuración (ver `bivoo-agent-widget/server`:
 * `createAgentesListado`, `createAgentesAdminRoutes`,
 * `createAgentePublicoRoute`).
 *
 * Va UNA vez en tu layout raíz. En cada render pregunta a tu endpoint de
 * listado qué agentes existen y en qué ruta va cada uno, mira dónde está
 * el usuario (con `usePathname`, así que esto es Next.js App Router) y
 * monta el `<AgentChat>` que corresponda — o ninguno, si no hay agente
 * para esa ruta.
 *
 * Requiere Next.js. Si no usas Next, la pieza reutilizable es
 * `agenteParaRuta` (exportado también desde `bivoo-agent-widget/server`):
 * tú decides cómo obtener la ruta actual y monta `<AgentChat>` a mano con
 * el resultado.
 */
declare function MultiAgentChat({ 
/** Dónde preguntar "qué agentes hay". Por defecto, donde monta `createAgentesListado()` según el README. */
listEndpoint, showSettings, onOpenSettings, }: {
    listEndpoint?: string;
    /** Si mostrar el engranaje. Lo decide tu servidor (viene en la respuesta de listEndpoint como `puedeConfigurar`) — puedes forzarlo aquí si prefieres tu propio cálculo. */
    showSettings?: boolean;
    /** Qué hacer al pulsar el engranaje. Recibe el slug del agente resuelto para esta ruta. Sin esto, el widget abre su propio panel (createAgentesAdminRoutes debe estar montado). */
    onOpenSettings?: (slug: string) => void;
}): react.JSX.Element | null;

export { MultiAgentChat };
