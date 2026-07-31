"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AgentChat } from "./AgentChat";
import { agenteParaRuta } from "./shared/agentes-ruta";
import type { AgenteVisible } from "./shared/agentes-ruta";

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
export function MultiAgentChat({
  /** Dónde preguntar "qué agentes hay". Por defecto, donde monta `createAgentesListado()` según el README. */
  listEndpoint = "/api/agentes",
  showSettings,
  onOpenSettings,
}: {
  listEndpoint?: string;
  /** Si mostrar el engranaje. Lo decide tu servidor (viene en la respuesta de listEndpoint como `puedeConfigurar`) — puedes forzarlo aquí si prefieres tu propio cálculo. */
  showSettings?: boolean;
  /** Qué hacer al pulsar el engranaje. Recibe el slug del agente resuelto para esta ruta. Sin esto, el widget abre su propio panel (createAgentesAdminRoutes debe estar montado). */
  onOpenSettings?: (slug: string) => void;
}) {
  const ruta = usePathname() || "/";
  const [agentes, setAgentes] = useState<AgenteVisible[] | null>(null);
  const [puedeConfigurar, setPuedeConfigurar] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(listEndpoint)
      .then((r) => (r.ok ? r.json() : { agentes: [] }))
      .then((d) => {
        if (!vivo) return;
        setAgentes(d?.agentes ?? []);
        setPuedeConfigurar(Boolean(d?.puedeConfigurar));
      })
      .catch(() => vivo && setAgentes([]));
    return () => {
      vivo = false;
    };
  }, [listEndpoint]);

  // `null` = todavía preguntando. No se dibuja nada hasta saber: una
  // burbuja que aparece y desaparece al segundo se ve peor que una que
  // tarda un poco.
  if (!agentes) return null;

  const agente = agenteParaRuta(agentes, ruta);
  if (!agente) return null;

  return (
    <AgentChat
      // Cambiar de agente tiene que ser un widget NUEVO, no el mismo con
      // otra URL: sin esto, al pasar de una ruta a otra se quedaría en
      // pantalla la conversación del agente anterior como si fuera de este.
      key={agente.slug}
      endpoint={agente.endpoint}
      showSettings={showSettings ?? puedeConfigurar}
      onOpenSettings={onOpenSettings ? () => onOpenSettings(agente.slug) : undefined}
    />
  );
}
