/**
 * `agenteParaRuta` y `endpointDe` (src/shared/agentes-ruta.ts) — la pieza
 * que decide qué agente se monta en qué ruta, así que si esto elige mal un
 * agente interno podría acabar dibujado en una página pública, o al revés.
 * Sin red ni disco: se puede correr con `npm test`.
 */

import { agenteParaRuta, endpointDe, type AgenteVisible, type Audiencia } from "../src/shared/agentes-ruta";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "OK   " : "FALLA"} ${m}`);
  if (!c) fallos++;
};

const agente = (
  slug: string,
  mountPath: string,
  audience: Audiencia = "staff",
  excludePaths = "",
): AgenteVisible => ({
  slug,
  label: slug,
  audience,
  mountPath,
  excludePaths,
  endpoint: endpointDe(slug, audience),
});

console.log("\n--- endpointDe ---");
ok(endpointDe("tienda", "publico") === "/api/agente/tienda", "público → /api/agente/<slug>");
ok(endpointDe("panel", "staff") === "/api/admin/agentes/panel/chat", "staff → /api/admin/agentes/<slug>/chat");
ok(
  endpointDe("x", "vete-a-saber" as Audiencia) === "/api/admin/agentes/x/chat",
  "audiencia desconocida → la ruta protegida, no la pública (falla hacia el lado seguro)",
);
ok(
  endpointDe("x", "publico", { publico: "/api/pub" }) === "/api/pub/x",
  "el prefijo público se puede sobrescribir",
);
ok(
  endpointDe("x", "staff", { staff: "/api/interno" }) === "/api/interno/x/chat",
  "el prefijo de staff también",
);

console.log("\n--- agenteParaRuta: básico ---");
{
  const lista = [agente("tienda", "/", "publico"), agente("panel", "/admin"), agente("inventario", "/admin/inventario")];

  ok(agenteParaRuta([agente("t", "/", "publico")], "/lo-que-sea")?.slug === "t", '"/" cubre toda la app');
  ok(agenteParaRuta(lista, "/admin/inventario")?.slug === "inventario", "gana el más específico");
  ok(agenteParaRuta(lista, "/admin/inventario/123")?.slug === "inventario", "y también en sus sub-rutas");
  ok(agenteParaRuta(lista, "/admin/pedidos")?.slug === "panel", "el resto de /admin cae al agente del panel");
  ok(agenteParaRuta(lista, "/producto/abc")?.slug === "tienda", "fuera de /admin, el público");

  const solos = [agente("panel", "/admin")];
  ok(agenteParaRuta(solos, "/administracion") === null, 'no confunde "/administracion" con "/admin"');
  ok(agenteParaRuta(solos, "/admin")?.slug === "panel", "coincidencia exacta sí cuenta");

  ok(agenteParaRuta([], "/admin") === null, "sin agentes, null");
  ok(agenteParaRuta([agente("panel", "/admin")], "/") === null, "ninguno encaja, null");
  ok(agenteParaRuta([agente("panel", "/admin/")], "/admin/x")?.slug === "panel", "tolera barra final en mountPath");
}

console.log("\n--- agenteParaRuta: exclusiones ---");
{
  // Caso real: un agente de tienda cubre todo el sitio MENOS el checkout y
  // el panel — sin exclusiones, esto no se puede expresar solo incluyendo.
  const tienda = agente("tienda", "/", "publico", "/admin,/checkout-io");

  ok(agenteParaRuta([tienda], "/checkout-io") === null, "no se monta en una ruta excluida");
  ok(agenteParaRuta([tienda], "/checkout-io/pago") === null, "ni en sus sub-rutas");
  ok(agenteParaRuta([tienda], "/admin/pedidos") === null, "la otra exclusión también aplica");
  ok(agenteParaRuta([tienda], "/")?.slug === "tienda", "fuera de las exclusiones, sí se monta");
  ok(agenteParaRuta([tienda], "/producto/abc")?.slug === "tienda", "…en cualquier otra ruta");

  const panel = agente("panel", "/admin");
  ok(
    agenteParaRuta([tienda, panel], "/admin/pedidos")?.slug === "panel",
    "una exclusión aparta a ese agente, no bloquea la ruta para los demás",
  );

  ok(
    agenteParaRuta([tienda], "/administracion")?.slug === "tienda",
    "una exclusión tampoco confunde un prefijo que solo empieza igual",
  );

  const raro = agente("t", "/", "publico", " /checkout-io , , /admin ");
  ok(agenteParaRuta([raro], "/checkout-io") === null, "aguanta espacios y comas de sobra");
  ok(agenteParaRuta([raro], "/otra")?.slug === "t", "…y sigue funcionando bien fuera de eso");
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) FALLARON.`);
process.exitCode = fallos === 0 ? 0 : 1;
