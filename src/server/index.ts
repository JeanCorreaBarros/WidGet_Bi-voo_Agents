export { createAgentRoutes, GET, POST, PUT } from "./rutas";
export type { CrearRutasOpciones } from "./rutas";
export { almacenDeArchivo } from "./almacen";
export type { AlmacenConfig, ConexionAgente, ConfigAgentes } from "./almacen";

// Varios agentes por configuración (uno por módulo, si hace falta) — ver
// agentes.ts y multiagente.ts para el porqué y el ejemplo de uso.
export { agenteParaRuta, endpointDe, almacenAgentesDeArchivo, saneaSlug, saneaRuta, saneaExclusiones } from "./agentes";
export type { Audiencia, AccesoAgente, NuevoAccesoAgente, CambiosAccesoAgente, AlmacenAgentes } from "./agentes";
export { createAgentesListado, createAgentePublicoRoute, createAgentesAdminRoutes } from "./multiagente";
