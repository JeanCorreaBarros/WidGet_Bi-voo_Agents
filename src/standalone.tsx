/**
 * Punto de entrada para sitios SIN build propio — PHP, Django, Rails, .NET,
 * WordPress, o HTML a secas. Se compila en UN SOLO archivo con React ya
 * incluido (ver tsup.config.ts, entrada `standalone`), así que basta con
 * un `<script>`, sin instalar nada.
 *
 * Uso:
 *   <script src="https://tu-cdn/bivoo-agent.min.js"></script>
 *   <script>
 *     BivooAgent.init({ endpoint: "/api/agent", accent: "#6d5efc" });
 *   </script>
 *
 * `init` es idempotente a propósito: si el host llama dos veces por error
 * (dos `<script>` de esta misma página, un doble render del lado del
 * servidor…), la segunda llamada no duplica el widget.
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentChat, type AgentChatProps } from "./AgentChat";

const ID_CONTENEDOR = "bivoo-agent-root";
let raiz: Root | null = null;

function init(config: AgentChatProps = {}) {
  if (typeof document === "undefined") return; // por si algo lo importa en el servidor

  let contenedor = document.getElementById(ID_CONTENEDOR);
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.id = ID_CONTENEDOR;
    document.body.appendChild(contenedor);
  }

  // Si ya había una instancia (segunda llamada a init), se reutiliza el
  // mismo root en vez de crear uno nuevo sobre el mismo nodo — React se
  // queja si dos roots comparten contenedor.
  raiz ??= createRoot(contenedor);
  raiz.render(createElement(AgentChat, config));
}

function destroy() {
  raiz?.unmount();
  raiz = null;
  document.getElementById(ID_CONTENEDOR)?.remove();
}

// Global expuesto para el `<script>`. `unknown` y no `any`: quien lo consuma
// desde JS suelto no tiene por qué tener los tipos, pero tampoco se declara
// "cualquier cosa vale" desde dentro de este archivo.
declare global {
  interface Window {
    BivooAgent?: { init: typeof init; destroy: typeof destroy };
  }
}

if (typeof window !== "undefined") {
  window.BivooAgent = { init, destroy };
}

export { init, destroy };
