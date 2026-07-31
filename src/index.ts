/**
 * Punto de entrada para quien instala esto con npm/pnpm/yarn en un proyecto
 * con su propio bundler (React, Next.js, y cualquier framework que compile
 * JSX/TSX). Para HTML plano sin build (PHP, Django, Rails, .NET…), ver
 * `standalone.tsx` — ese se compila aparte, en un solo archivo con React
 * ya incluido, y se enseña con un `<script>`.
 */
export { AgentChat, AgentOrb, tiempoRelativo, agruparPorFecha, IDLE_MOODS } from "./AgentChat";
export type { AgentChatProps, OrbMood } from "./AgentChat";

// `MultiAgentChat` (varios agentes por configuración) NO se exporta desde
// aquí: usa `next/navigation`, y este entry es para cualquier framework
// que compile JSX, no solo Next.js. Vive en `bivoo-agent-widget/next`.
