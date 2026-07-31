/**
 * Prueba del módulo de servidor (src/server) — la pieza que toca el token
 * maestro del agente, así que se prueba con más cuidado que el resto.
 *
 *   npm test
 *
 * Sin gateway real: levanta un servidor HTTP local que imita las tres
 * respuestas del gateway (chat, login, sync-openapi) y comprueba que el
 * módulo le habla bien. El archivo de configuración se crea en una carpeta
 * temporal y se borra al terminar, incluso si algo falla.
 */

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { createAgentRoutes, almacenDeArchivo } from "../src/server";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "OK   " : "FALLA"} ${m}`);
  if (!c) fallos++;
};

/* ---------- gateway de mentira ---------- */

function gatewayDeMentira(): Promise<{ base: string; cerrar: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const token = req.headers["x-app-token"];
    if (req.url?.startsWith("/api/chat")) {
      if (token !== "app_token-bueno") {
        res.writeHead(401).end("Token inválido");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ name: "Prueba" }));
      return;
    }
    if (req.url === "/api/admin/login" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { username, password } = JSON.parse(body || "{}");
        if (username === "jefe" && password === "clave-correcta") {
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(401).end("Usuario o contraseña incorrectos");
        }
      });
      return;
    }
    if (req.url === "/api/apps/sync-openapi" && req.method === "POST") {
      if (token !== "app_token-bueno") {
        res.writeHead(401).end("Token de agente inválido");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({ ok: true, creados: 3, actualizados: 0, endpointsEncontrados: 3, omitidosPorNombre: [] }),
      );
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
      });
    });
  });
}

const params = (ruta: string[]) => ({ params: Promise.resolve({ ruta }) });

(async () => {
  const gateway = await gatewayDeMentira();
  const carpetaTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bivoo-test-"));
  const archivoConfig = path.join(carpetaTmp, "config.json");

  try {
    /* ============ sin requireAdmin: config bloqueada, chat libre ============ */
    console.log("\n--- sin requireAdmin ---");

    process.env.AGENT_GATEWAY_URL = gateway.base;
    process.env.AGENT_APP_TOKEN = "app_token-bueno";

    const sinAdmin = createAgentRoutes({ almacen: almacenDeArchivo(archivoConfig) });

    const rChat = await sinAdmin.GET(new Request("http://x/api/agent"), params([]));
    ok(rChat.status === 200, `el chat sigue funcionando solo con variables de entorno (${rChat.status})`);

    const rConfigBloqueada = await sinAdmin.GET(new Request("http://x/api/agent/config"), params(["config"]));
    ok(rConfigBloqueada.status === 501, `sin requireAdmin, la configuración queda bloqueada (${rConfigBloqueada.status})`);

    delete process.env.AGENT_GATEWAY_URL;
    delete process.env.AGENT_APP_TOKEN;

    /* ============ con requireAdmin ============ */
    console.log("\n--- con requireAdmin ---");

    let permitido = false;
    const rutas = createAgentRoutes({
      almacen: almacenDeArchivo(archivoConfig),
      requireAdmin: async () => permitido,
    });

    const post = (segmentos: string[], body: unknown) =>
      rutas.POST(
        new Request(`http://x/api/agent/${segmentos.join("/")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        params(segmentos),
      );
    const put = (body: unknown) =>
      rutas.PUT(
        new Request("http://x/api/agent/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        params(["config"]),
      );
    const get = (segmentos: string[]) =>
      rutas.GET(new Request(`http://x/api/agent/${segmentos.join("/")}`), params(segmentos));

    permitido = false;
    const rSinPermiso = await put({ gatewayUrl: gateway.base, appToken: "app_token-bueno" });
    ok(rSinPermiso.status === 401, `requireAdmin() en false → 401, no guarda nada (${rSinPermiso.status})`);

    permitido = true;

    const rGuardar = await put({ gatewayUrl: gateway.base, appToken: "app_token-bueno", toolSecret: "sst" });
    ok(rGuardar.status === 200, `guarda la conexión (${rGuardar.status})`);

    const dLectura = await (await get(["config"])).json();
    ok(
      dLectura.conexion.appToken !== "app_token-bueno" && dLectura.conexion.appToken.includes("••••"),
      `el token se devuelve ENMASCARADO, nunca en claro (${dLectura.conexion.appToken})`,
    );
    ok(dLectura.conexion.hasAppToken === true, "pero se informa que SÍ hay uno guardado");

    // El formulario reenvía la máscara sin que el usuario la haya tocado:
    // no debe machacar el token real con la máscara.
    const rGuardarConMascara = await put({
      gatewayUrl: gateway.base,
      appToken: dLectura.conexion.appToken, // la máscara que acaba de leer
      enabled: false,
    });
    ok(rGuardarConMascara.status === 200, "reenviar la máscara no falla");

    const rProbarTrasMascara = await post(["test-connection"], {
      gatewayUrl: gateway.base,
      appToken: "app_token-bueno", // si se hubiera guardado la máscara, esto fallaría más abajo
    });
    ok((await rProbarTrasMascara.json()).ok === true, "el token real SIGUE siendo el válido, no quedó pisado por la máscara");

    /* ---------- probar conexión ---------- */
    console.log("\n--- probar conexión ---");

    const rProbarBien = await post(["test-connection"], { gatewayUrl: gateway.base, appToken: "app_token-bueno" });
    ok((await rProbarBien.json()).ok === true, "token correcto → ok");

    const rProbarMal = await post(["test-connection"], { gatewayUrl: gateway.base, appToken: "app_token-malo" });
    const dMal = await rProbarMal.json();
    ok(dMal.ok === false, "token incorrecto → no ok, y no revienta");

    // Sin escribir el token de nuevo: prueba con el que ya está guardado.
    const rProbarSinToken = await post(["test-connection"], { gatewayUrl: gateway.base });
    ok((await rProbarSinToken.json()).ok === true, "sin token en el formulario, prueba con el ya guardado");

    /* ---------- verificar login del gateway ---------- */
    console.log("\n--- verificar login ---");

    const rLoginBien = await post(["verify-login"], { username: "jefe", password: "clave-correcta" });
    ok(rLoginBien.status === 200, `credenciales correctas → verificado (${rLoginBien.status})`);

    const rLoginMal = await post(["verify-login"], { username: "jefe", password: "lo-que-sea" });
    ok(rLoginMal.status === 401, `credenciales incorrectas → rechazado (${rLoginMal.status})`);

    /* ---------- sincronizar swagger ---------- */
    console.log("\n--- sincronizar ---");

    const rSync = await post(["sync-tools"], { specUrl: "https://x.com/openapi.json" });
    const dSync = await rSync.json();
    ok(dSync.ok === true && (dSync.datos as any)?.creados === 3, `sincroniza usando el token guardado (${JSON.stringify(dSync.datos)})`);

    /* ============ el archivo en disco ============ */
    console.log("\n--- archivo en disco ---");

    ok(fs.existsSync(archivoConfig), "el archivo de configuración se creó de verdad");
    const crudo = fs.readFileSync(archivoConfig, "utf8");
    ok(crudo.includes("app_token-bueno"), "sin BIVOO_CONFIG_KEY, se guarda en claro (esperado, pero avisado por consola)");

    /* ============ cifrado en reposo ============ */
    console.log("\n--- cifrado (BIVOO_CONFIG_KEY) ---");

    const archivoCifrado = path.join(carpetaTmp, "config-cifrado.json");
    process.env.BIVOO_CONFIG_KEY = crypto.randomBytes(32).toString("base64");

    const rutasCifradas = createAgentRoutes({
      almacen: almacenDeArchivo(archivoCifrado),
      requireAdmin: async () => true,
    });
    await rutasCifradas.PUT(
      new Request("http://x/api/agent/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayUrl: gateway.base, appToken: "secreto-que-no-debe-verse" }),
      }),
      params(["config"]),
    );

    const crudoCifrado = fs.readFileSync(archivoCifrado, "utf8");
    ok(
      !crudoCifrado.includes("secreto-que-no-debe-verse"),
      "CON la clave puesta, el token no aparece en texto plano en el archivo",
    );
    ok(crudoCifrado.startsWith("v1."), "lleva la marca de versión del cifrado");

    const dCifradoLeido = await (
      await rutasCifradas.GET(new Request("http://x/api/agent/config"), params(["config"]))
    ).json();
    ok(dCifradoLeido.conexion.hasAppToken === true, "y aun así se puede volver a leer sin problema (se descifra solo)");

    delete process.env.BIVOO_CONFIG_KEY;
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
