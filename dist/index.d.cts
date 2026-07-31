import React from 'react';

/**
 * Widget de chat embebible (F3) — UI clara y premium.
 *
 * Portable: estilos propios en línea, sin depender de CSS externo. Se mete en
 * cualquier app Next.js. NO conoce el appToken — habla con un endpoint del
 * propio host (por defecto /api/agent) que inyecta el token en el servidor.
 *
 * Al montar, hace un GET al mismo `endpoint` para leer metadatos públicos de
 * la app (nombre, ícono, color, si permite imágenes/voz) configurados desde
 * el panel admin — así el widget se auto-configura sin que el host tenga que
 * pasar cada prop a mano. Si el GET falla, usa los props/defaults.
 *
 * Uso mínimo:
 *   <AgentChat />
 *   <AgentChat endpoint="/api/agent" title="Soporte" accent="#363a52" />
 *
 * ⚠️ Al usar estilos en línea hay que declarar TODAS las propiedades que la
 * app anfitriona pueda tocar con selectores de etiqueta. Por ejemplo, un
 * `button { padding: 12px 20px }` global se cuela en los botones del widget:
 * con `box-sizing: border-box` deja el contenido en pocos píxeles y los
 * iconos se ven como puntos (o desaparecen). Por eso cada botón fija su
 * propio `padding`.
 */

type AgentChatProps = {
    endpoint?: string;
    title?: string;
    subtitle?: string;
    placeholder?: string;
    accent?: string;
    avatarEmoji?: string;
    greeting?: string;
    defaultOpen?: boolean;
    context?: unknown;
    /**
     * Identifica al usuario/sesión para dirigirle las recomendaciones
     * proactivas (F4). Normalmente el id de usuario de tu app.
     */
    sessionKey?: string;
    /**
     * Muestra el engranaje de configuración en la cabecera del chat. El
     * widget NUNCA decide esto solo — no tiene forma de saber quién es
     * administrador en tu app. Lo calculas tú, en el servidor o con tu
     * propio sistema de roles, y lo pasas aquí.
     */
    showSettings?: boolean;
    /** Qué hacer al pulsar el engranaje — normalmente, abrir tu propio modal. */
    onOpenSettings?: () => void;
};
declare function tiempoRelativo(iso: string): string;
type ConvResumen = {
    id: string;
    title: string;
    updatedAt: string;
    mensajes: number;
};
/** Reparte en "Hoy", "Ayer", "Esta semana" y "Más antiguas". */
declare function agruparPorFecha(convs: ConvResumen[]): {
    etiqueta: string;
    items: ConvResumen[];
}[];
declare function AgentChat({ endpoint, title, subtitle, placeholder, accent, avatarEmoji, greeting, defaultOpen, context, sessionKey, showSettings, onOpenSettings, }: AgentChatProps): React.JSX.Element | null;
type OrbMood = "idle" | "thinking" | "talking" | "happy" | "sleeping" | "eating" | "chatting" | "studying";
/** Las que se pueden activar desde el panel. */
declare const IDLE_MOODS: readonly ["sleeping", "eating", "chatting", "studying"];
/**
 * Avatar del agente: una esfera con ojos que siguen el puntero, parpadean y
 * cambian de expresión según lo que esté haciendo.
 *
 * Se usa tanto en el botón flotante como en la cabecera, para que las
 * expresiones no se pierdan al abrir el chat.
 */
/**
 * Avatar del agente.
 *
 * Geometría: lienzo 120×120, esfera centrada en (60,62) con radio 38.
 * Las manos se dibujan DESPUÉS del cuerpo para que nunca queden ocultas
 * detrás de él (antes desaparecían al acercarlas a la cara).
 */
declare function AgentOrb({ size, accent, mood, animDelay, }: {
    size: number;
    accent: string;
    mood?: OrbMood;
    animDelay?: string;
}): React.JSX.Element;

export { AgentChat, type AgentChatProps, AgentOrb, IDLE_MOODS, type OrbMood, agruparPorFecha, tiempoRelativo };
