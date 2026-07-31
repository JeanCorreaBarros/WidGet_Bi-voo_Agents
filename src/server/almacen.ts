/**
 * Dónde vive la configuración de conexión (URL del gateway, appToken,
 * secreto de herramientas) que el propio widget guarda desde su panel.
 *
 * Por defecto, un archivo en el propio proyecto — ningún host tiene
 * garantizada una base de datos, pero SÍ un disco (mientras no sea
 * serverless: ver el aviso más abajo). Si necesitas guardar distinto —tu
 * propia base de datos, por ejemplo—, pásale tu propio `AlmacenConfig` a
 * `createAgentRoutes({ almacen: ... })` en vez de usar el de archivo.
 *
 * ⚠️ En hosting serverless (funciones de Vercel, Netlify…) el disco no es
 * persistente entre invocaciones: lo que se guarde aquí puede desaparecer.
 * Para esos casos, usa tu propio `AlmacenConfig` respaldado en una base de
 * datos de verdad.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/** Conexión de UN agente (puede haber varios: panel, tienda…). */
export type ConexionAgente = {
  enabled: boolean;
  gatewayUrl: string;
  appToken: string;
  toolSecret?: string;
};

/** Todas las conexiones guardadas, por nombre. "default" si no se especifica otro. */
export type ConfigAgentes = Record<string, ConexionAgente>;

export type AlmacenConfig = {
  leer(): Promise<ConfigAgentes>;
  guardar(config: ConfigAgentes): Promise<void>;
};

/* ---------- cifrado opcional en reposo ----------
   Mismo esquema que ya usa el gateway (AES-256-GCM): si el host define
   BIVOO_CONFIG_KEY (32 bytes en base64), el archivo se guarda cifrado. Sin
   esa variable, se guarda en claro — funciona igual, pero conviene avisar,
   porque este archivo lleva el appToken. */

let avisoPlanoMostrado = false;

function claveMaestra(): Buffer | null {
  const raw = process.env.BIVOO_CONFIG_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

function cifrar(texto: string, clave: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", clave, iv);
  const enc = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, enc].map((b) => (Buffer.isBuffer(b) ? b.toString("base64") : b)).join(".");
}

function descifrar(payload: string, clave: Buffer): string {
  const [, ivB64, tagB64, encB64] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", clave, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * El almacén por defecto: un archivo JSON en el proyecto.
 *
 * @param ruta Dónde guardarlo. Relativa a `process.cwd()` si no es absoluta.
 *   Por defecto `.bivoo-agent.json` — recuerda añadirlo a tu `.gitignore`.
 */
export function almacenDeArchivo(ruta = ".bivoo-agent.json"): AlmacenConfig {
  const rutaAbsoluta = path.isAbsolute(ruta) ? ruta : path.join(process.cwd(), ruta);
  // Se relee en cada llamada, no se fija al crear el almacén: la app puede
  // definir BIVOO_CONFIG_KEY después de que este módulo ya se importó (por
  // ejemplo, si el entorno se carga con dotenv en otro punto del arranque).
  const clave = () => claveMaestra();

  return {
    async leer() {
      try {
        const texto = await fs.readFile(rutaAbsoluta, "utf8");
        const k = clave();
        const contenido = k && texto.startsWith("v1.") ? descifrar(texto, k) : texto;
        return JSON.parse(contenido) as ConfigAgentes;
      } catch {
        return {}; // sin archivo todavía, o ilegible: se empieza de cero
      }
    },
    async guardar(config) {
      const k = clave();
      if (!k && !avisoPlanoMostrado) {
        avisoPlanoMostrado = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[bivoo-agent-widget] Guardando la configuración SIN cifrar " +
            `(${rutaAbsoluta}). Define BIVOO_CONFIG_KEY (32 bytes en base64) ` +
            "para cifrarla en reposo. No olvides añadir este archivo a .gitignore.",
        );
      }
      const texto = JSON.stringify(config, null, 2);
      await fs.writeFile(rutaAbsoluta, k ? cifrar(texto, k) : texto, "utf8");
    },
  };
}
