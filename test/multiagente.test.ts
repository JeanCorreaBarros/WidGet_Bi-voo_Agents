/**
 * Las rutas HTTP de "varios agentes por configuración" (src/server/multiagente.ts):
 * listado público, chat público por slug, y el catch-all de administración
 * (CRUD + chat de staff + conexión). Mismo patrón que server.test.ts: un
 * gateway de mentira local, sin red real.
 *
 *   npx tsx test/multiagente.test.ts
 */

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { createAgentesListado, createAgentePublicoRoute, createAgentesAdminRoutes } from "../src/server/multiagente";
import { almacenAgentesDeArchivo } from "../src/server/agentes";
import { almacenDeArchivo } from "../src/server/almacen";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "OK   " : "FALLA"} ${m}`);
  if (!c) fallos++;
};

function gatewayDeMentira(): Promise<{ base: string; cerrar: () => Promise<void>; cabecerasVistas: () => Record<string, string> }> {
  let ultimasCabeceras: Record<string, string> = {};
  const server = http.createServer((req, res) => {
    ultimasCabeceras = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]),
    );
    const token = req.headers["x-app-token"];
    if (req.url?.startsWith("/api/chat")) {
      if (token !== "app_token-bueno") {
        res.writeHead(401).end("Token inválido");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ name: "Prueba" }));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const dir = server.address();
      const puerto = typeof dir === "object" && dir ? dir.port : 0;
      resolve({
        base: `http://127.0.0.1:${puerto}`,
        cerrar: () => new Promise<void>((r) => server.close(() => r())),
        cabecerasVistas: () => ultimasCabeceras,
      });
    });
  });
}

const params = (ruta: string[]) => ({ params: Promise.resolve({ ruta }) });
const paramsSlug = (slug: string) => ({ params: Promise.resolve({ slug }) });

(async () => {
  const gateway = await gatewayDeMentira();
  const carpetaTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bivoo-multi-"));
  const archivoAgentes = path.join(carpetaTmp, "agentes.json");
  const archivoConexion = path.join(carpetaTmp, "conexion.json");

  try {
    const almacenAgentes = almacenAgentesDeArchivo(archivoAgentes);
    const almacen = almacenDeArchivo(archivoConexion);

    /* ============ listado ============ */
    console.log("\n--- createAgentesListado ---");

    let esAdmin = false;
    const listado = createAgentesListado({ almacenAgentes, requireAdmin: async () => esAdmin });

    const dVacio = await (await listado.GET(new Request("http://x/api/agentes"))).json();
    ok(Array.isArray(dVacio.agentes) && dVacio.agentes.length === 0, "sin agentes creados, lista vacía");

    await almacenAgentes.crear({ slug: "tienda", label: "Tienda", audience: "publico", mountPath: "/", enabled: true });
    await almacenAgentes.crear({ slug: "panel", label: "Panel", audience: "staff", mountPath: "/admin", enabled: true });
    await almacenAgentes.crear({ slug: "apagado", label: "Apagado", audience: "publico", mountPath: "/", enabled: false });

    esAdmin = false;
    const dPublico = await (await listado.GET(new Request("http://x/api/agentes"))).json();
    ok(
      dPublico.agentes.length === 1 && dPublico.agentes[0].slug === "tienda",
      `sin ser admin, solo se ve el público y encendido (vi: ${JSON.stringify(dPublico.agentes.map((a: any) => a.slug))})`,
    );
    ok(dPublico.puedeConfigurar === false, "y se informa que no puede configurar");

    esAdmin = true;
    const dAdmin = await (await listado.GET(new Request("http://x/api/agentes"))).json();
    ok(
      dAdmin.agentes.length === 2 && dAdmin.agentes.some((a: any) => a.slug === "panel"),
      "siendo admin, también se ve el de staff (el apagado sigue sin verse)",
    );
    ok(dAdmin.puedeConfigurar === true, "y que sí puede configurar");

    /* ============ chat público ============ */
    console.log("\n--- createAgentePublicoRoute ---");

    const publicoRoute = createAgentePublicoRoute({ almacenAgentes, almacen });

    const rSinConexion = await publicoRoute.GET(new Request("http://x/api/agente/tienda"), paramsSlug("tienda"));
    ok(rSinConexion.status === 500, `sin conexión guardada, 500 claro (${rSinConexion.status})`);

    await almacen.guardar({ tienda: { enabled: true, gatewayUrl: gateway.base, appToken: "app_token-bueno" } });

    const rOk = await publicoRoute.GET(new Request("http://x/api/agente/tienda"), paramsSlug("tienda"));
    ok(rOk.status === 200, `agente público con conexión: chatea (${rOk.status})`);

    const rStaff = await publicoRoute.GET(new Request("http://x/api/agente/panel"), paramsSlug("panel"));
    ok(rStaff.status === 403, `un agente de STAFF no se sirve por la ruta pública (${rStaff.status})`);

    const rInexistente = await publicoRoute.GET(new Request("http://x/api/agente/fantasma"), paramsSlug("fantasma"));
    ok(rInexistente.status === 403, `un slug que no existe también da 403, no 404 (no delata cuáles hay)`);

    const rApagado = await publicoRoute.GET(new Request("http://x/api/agente/apagado"), paramsSlug("apagado"));
    ok(rApagado.status === 403, "un agente apagado tampoco responde aunque exista");

    // identidad(): las cabeceras extra llegan de verdad al gateway.
    const conIdentidad = createAgentePublicoRoute({
      almacenAgentes,
      almacen,
      identidad: async (_req, audience) => ({ "x-user-key": `visitor-1`, "x-audience": audience }),
    });
    await conIdentidad.GET(new Request("http://x/api/agente/tienda"), paramsSlug("tienda"));
    ok(
      gateway.cabecerasVistas()["x-user-key"] === "visitor-1" && gateway.cabecerasVistas()["x-audience"] === "publico",
      "identidad() manda cabeceras extra al gateway, con la audiencia correcta",
    );

    /* ============ administración ============ */
    console.log("\n--- createAgentesAdminRoutes: sin requireAdmin ---");

    const sinAdmin = createAgentesAdminRoutes({ almacenAgentes, almacen });
    const rBloqueado = await sinAdmin.GET(new Request("http://x/api/admin/agentes"), params([]));
    ok(rBloqueado.status === 501, `sin requireAdmin, todo queda bloqueado (${rBloqueado.status})`);

    console.log("\n--- createAgentesAdminRoutes: con requireAdmin ---");

    let permitido = false;
    const admin = createAgentesAdminRoutes({ almacenAgentes, almacen, requireAdmin: async () => permitido });

    permitido = false;
    const rNoAutorizado = await admin.GET(new Request("http://x/api/admin/agentes"), params([]));
    ok(rNoAutorizado.status === 401, `requireAdmin en false → 401 (${rNoAutorizado.status})`);

    permitido = true;

    const dTodos = await (await admin.GET(new Request("http://x/api/admin/agentes"), params([]))).json();
    ok(dTodos.agentes.length === 3, `lista TODOS, incluido el apagado (${dTodos.agentes.length})`);

    const rCrear = await admin.POST(
      new Request("http://x/api/admin/agentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Inventario", audience: "staff", mountPath: "/admin/inventario" }),
      }),
      params([]),
    );
    const dCrear = await rCrear.json();
    ok(rCrear.status === 200 && dCrear.agente.slug === "inventario", `crea y deriva el slug del nombre (${dCrear.agente?.slug})`);
    ok(dCrear.agente.enabled === false, "nace apagado");

    const rDuplicado = await admin.POST(
      new Request("http://x/api/admin/agentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "tienda", label: "Otra vez tienda", audience: "publico", mountPath: "/" }),
      }),
      params([]),
    );
    ok(rDuplicado.status === 409, `un slug repetido no se crea (${rDuplicado.status})`);

    const rEditar = await admin.PUT(
      new Request("http://x/api/admin/agentes/inventario", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mountPath: "/admin/inv", enabled: true }),
      }),
      params(["inventario"]),
    );
    const dEditar = await rEditar.json();
    ok(dEditar.agente.mountPath === "/admin/inv" && dEditar.agente.enabled === true, "edita metadata (ruta y encendido)");
    ok(dEditar.agente.label === "Inventario", "y conserva lo que no se mandó (el nombre)");

    const rEditarInexistente = await admin.PUT(
      new Request("http://x/api/admin/agentes/fantasma", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      params(["fantasma"]),
    );
    ok(rEditarInexistente.status === 404, "editar un slug que no existe da 404");

    /* ---------- chat de staff, solo vía admin ---------- */
    console.log("\n--- chat de un agente de staff (dentro del catch-all admin) ---");

    await almacen.guardar({
      tienda: { enabled: true, gatewayUrl: gateway.base, appToken: "app_token-bueno" },
      panel: { enabled: true, gatewayUrl: gateway.base, appToken: "app_token-bueno" },
    });

    const rChatStaff = await admin.GET(new Request("http://x/api/admin/agentes/panel/chat"), params(["panel", "chat"]));
    ok(rChatStaff.status === 200, `el chat del agente de staff funciona desde la zona admin (${rChatStaff.status})`);

    const rChatPublicoDesdeAdmin = await admin.GET(
      new Request("http://x/api/admin/agentes/tienda/chat"),
      params(["tienda", "chat"]),
    );
    ok(
      rChatPublicoDesdeAdmin.status === 400,
      `pedir el chat de un agente PÚBLICO por esta vía no cuela (${rChatPublicoDesdeAdmin.status})`,
    );

    /* ---------- conexión, delegada a createAgentRoutes ---------- */
    console.log("\n--- conexión (delega en createAgentRoutes) ---");

    const rConfig = await admin.GET(
      new Request("http://x/api/admin/agentes/panel/conexion/config"),
      params(["panel", "conexion", "config"]),
    );
    const dConfig = await rConfig.json();
    ok(
      dConfig.conexion?.appToken?.includes("••••"),
      `la conexión se lee ENMASCARADA a través del catch-all admin (${dConfig.conexion?.appToken})`,
    );

    /* ---------- borrar ---------- */
    console.log("\n--- borrar ---");

    const rBorrar = await admin.DELETE(new Request("http://x/api/admin/agentes/apagado"), params(["apagado"]));
    ok(rBorrar.status === 200, "borra un acceso");
    const dTrasBorrar = await (await admin.GET(new Request("http://x/api/admin/agentes"), params([]))).json();
    ok(
      !dTrasBorrar.agentes.some((a: any) => a.slug === "apagado"),
      "y ya no aparece en el listado",
    );
  } finally {
    console.log("\n--- limpieza ---");
    await gateway.cerrar();
    fs.rmSync(carpetaTmp, { recursive: true, force: true });
    console.log("servidor de mentira cerrado, carpeta temporal borrada");
  }

  console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) FALLARON.`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
