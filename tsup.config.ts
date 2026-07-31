import { defineConfig } from "tsup";

/**
 * Dos builds, para dos formas de instalar el widget (ver README):
 *
 *   1. Paquete npm — para React/Next/cualquier app con su propio bundler.
 *      `react`/`react-dom` quedan como peerDependencies (external): si el
 *      host ya tiene React cargado, no se duplica.
 *
 *   2. Bundle de una sola línea — para sitios sin build propio (PHP, Django,
 *      Rails, .NET, HTML a secas). Aquí SÍ se empaqueta React entero adentro,
 *      porque la página que lo cargue no tiene ninguno.
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
  },
  {
    // El módulo de servidor (route handler + almacenamiento de config): solo
    // Node — usa `fs`. Nunca lo importa el entry del navegador (index.ts),
    // así que no hay riesgo de que `fs` termine en un bundle de cliente.
    entry: { server: "src/server/index.ts" },
    format: ["esm", "cjs"],
    platform: "node",
    dts: true,
    sourcemap: true,
  },
  {
    entry: { standalone: "src/standalone.tsx" },
    format: ["iife"],
    platform: "browser",
    target: "es2019",
    noExternal: ["react", "react-dom", "scheduler"],
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: ".global.js" }),
  },
]);
