# Bi-voo Agent Widget

Widget de chat con IA. Habla con un [gateway Bi-voo Agents](https://agente.momcolombia.com)
propio — nunca directo con OpenAI/Claude, y nunca con el token de tu agente
expuesto en el navegador.

Dos formas de instalarlo, según tu proyecto:

- **Tienes React/Next (o cualquier bundler con JSX)** → paquete npm.
- **No tienes build propio** (PHP, Django, Rails, .NET, WordPress, HTML a
  secas) → un `<script>`, sin instalar nada.

En **ambos casos** hace falta un pequeño endpoint en TU servidor (el
"proxy") que guarde el token del agente y lo reenvíe al gateway — el
navegador nunca debe conocerlo. Es la sección más importante de esta guía,
no un detalle: sin el proxy, el widget no tiene con quién hablar.

---

## 1. El proxy (obligatorio, sea cual sea tu frontend)

### Si tu backend es Next.js: una línea, cero código propio

```ts
// app/api/agent/[...ruta]/route.ts
export { GET, POST, PUT } from "bivoo-agent-widget/server";
```

Con eso, el chat ya funciona (usando `AGENT_GATEWAY_URL` y `AGENT_APP_TOKEN`
del entorno, igual que siempre). Y el widget gana un panel de Conexión de
verdad — URL del gateway, App Token, "Probar conexión", sincronizar tu
Swagger — sin que hayas escrito ni una ruta a mano.

Ese panel queda bloqueado por defecto (nadie puede reconfigurar el agente
sin que tú lo permitas). Para desbloquearlo, dile cómo reconoces a un
administrador en TU app — es la única pieza que este paquete no puede
adivinar solo:

```ts
// app/api/agent/[...ruta]/route.ts
import { createAgentRoutes } from "bivoo-agent-widget/server";

export const { GET, POST, PUT } = createAgentRoutes({
  requireAdmin: async (req) => {
    // tu propia comprobación de sesión/rol — lo que ya uses en tu app
    const sesion = await miSesion(req);
    return sesion?.role === "ADMIN";
  },
});
```

La configuración se guarda en un archivo del propio proyecto
(`.bivoo-agent.json` — añádelo a tu `.gitignore`). Si defines
`BIVOO_CONFIG_KEY` (32 bytes en base64) en el entorno, se guarda cifrada.
Si necesitas guardarla en tu propia base de datos en vez de un archivo,
pásale tu propio almacén:

```ts
export const { GET, POST, PUT } = createAgentRoutes({
  requireAdmin: async (req) => (await miSesion(req))?.role === "ADMIN",
  almacen: {
    async leer() { return await miDb.agentConfig.findMany(); },
    async guardar(config) { await miDb.agentConfig.upsertMany(config); },
  },
});
```

**¿Varios agentes?** (uno para el panel, otro para la tienda, como en la
mayoría de integraciones reales) — monta la ruta dos veces, con un
`agente` distinto en cada una:

```ts
// app/api/agent-admin/[...ruta]/route.ts
export const { GET, POST, PUT } = createAgentRoutes({ agente: "admin", requireAdmin });

// app/api/agent-tienda/[...ruta]/route.ts
export const { GET, POST, PUT } = createAgentRoutes({ agente: "tienda", requireAdmin });
```

### Si no usas Next.js (o quieres control total)

Tu servidor necesita responder a tres cosas, todas en el mismo endpoint
(por ejemplo `/api/agent`):

| Método | Query | Qué hace |
|---|---|---|
| `GET` | — | Devuelve metadatos públicos de la app (nombre, color, si permite imágenes/voz) |
| `GET` | `?sse=1` | Abre el canal de sugerencias proactivas (Server-Sent Events) |
| `POST` | — | Envía el chat y **reenvía la respuesta en streaming**, sin guardarla en un buffer |

Variables de entorno en TU servidor:

```
AGENT_GATEWAY_URL=https://agente.tu-dominio.com
AGENT_APP_TOKEN=app_xxxxxxxxxxxxxxxx
```

### Node.js / Next.js

```ts
// app/api/agent/route.ts
export const runtime = "nodejs";

function config() {
  const gateway = process.env.AGENT_GATEWAY_URL;
  const token = process.env.AGENT_APP_TOKEN;
  return gateway && token ? { gateway, token } : null;
}

export async function GET(req: Request) {
  const cfg = config();
  if (!cfg) return new Response("Falta configurar el agente", { status: 500 });
  const url = new URL(req.url);
  const upstream = await fetch(`${cfg.gateway}/api/chat${url.search}`, {
    headers: { "x-app-token": cfg.token },
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

export async function POST(req: Request) {
  const cfg = config();
  if (!cfg) return new Response("Falta configurar el agente", { status: 500 });
  const upstream = await fetch(`${cfg.gateway}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-token": cfg.token },
    body: await req.text(),
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
```

(El ejemplo completo, con manejo de `conversationId` e historial, está en
el repo del gateway: `widget/agent-proxy.example.ts`.)

### PHP

```php
<?php
// api/agent.php
$gateway = getenv('AGENT_GATEWAY_URL');
$token = getenv('AGENT_APP_TOKEN');

$ch = curl_init("$gateway/api/chat" . ($_SERVER['QUERY_STRING'] ? "?{$_SERVER['QUERY_STRING']}" : ''));
curl_setopt($ch, CURLOPT_HTTPHEADER, ["x-app-token: $token"]);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["x-app-token: $token", "Content-Type: application/json"]);
}
curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // deja salir el streaming tal cual
curl_exec($ch);
curl_close($ch);
```

### Python (Flask / Django — la idea es la misma)

```python
import os, requests
from flask import Flask, request, Response

app = Flask(__name__)
GATEWAY = os.environ["AGENT_GATEWAY_URL"]
TOKEN = os.environ["AGENT_APP_TOKEN"]

@app.route("/api/agent", methods=["GET", "POST"])
def agent():
    headers = {"x-app-token": TOKEN}
    if request.method == "POST":
        headers["Content-Type"] = "application/json"
        upstream = requests.post(f"{GATEWAY}/api/chat", data=request.get_data(), headers=headers, stream=True)
    else:
        upstream = requests.get(f"{GATEWAY}/api/chat?{request.query_string.decode()}", headers=headers, stream=True)
    return Response(upstream.iter_content(chunk_size=1024), status=upstream.status_code)
```

### Ruby on Rails / .NET / otro

El contrato es el mismo en cualquier lenguaje: reenvía la petición a
`{AGENT_GATEWAY_URL}/api/chat` con la cabecera `x-app-token`, sin volcar la
respuesta a un buffer completo antes de devolverla (el chat se ve "todo de
golpe" si lo haces, en vez de ir apareciendo palabra por palabra). Cualquier
cliente HTTP con soporte de streaming (casi todos) lo hace igual de bien
que los ejemplos de arriba.

---

## 2. El widget — con npm (React, Next.js…)

```bash
npm install github:JeanCorreaBarros/WidGet_Bi-voo_Agents
```

```tsx
import { AgentChat } from "bivoo-agent-widget";

export function MiApp() {
  return <AgentChat endpoint="/api/agent" accent="#6d5efc" title="Asistente" />;
}
```

Igual con `pnpm add github:JeanCorreaBarros/WidGet_Bi-voo_Agents` o
`yarn add github:JeanCorreaBarros/WidGet_Bi-voo_Agents`.

> El paquete se instala desde GitHub, no desde el registro de npm — no hace
> falta ninguna cuenta ni publicarlo en ningún sitio. El `dist/` ya viene
> compilado en el repo, así que instalar es instantáneo.

### Propiedades disponibles

| Prop | Tipo | Qué hace |
|---|---|---|
| `endpoint` | `string` | Tu proxy. Por defecto `/api/agent` |
| `title`, `subtitle`, `placeholder` | `string` | Textos de la cabecera y el input |
| `accent` | `string` (hex) | Color del agente. Se puede sobrescribir desde el panel |
| `greeting` | `string` | Primer mensaje, antes de que el usuario escriba |
| `defaultOpen` | `boolean` | Abierto al cargar la página |
| `context` | `unknown` | Estado de tu app, se añade al prompt (F2) |
| `sessionKey` | `string` | Id del usuario, para proactividad (F4) |
| `showSettings` / `onOpenSettings` | `boolean` / `() => void` | Engranaje de configuración — ver abajo |

### El engranaje de configuración (opcional)

El widget puede mostrar un icono de engranaje en su cabecera, pero **nunca
decide solo si mostrarlo**: no tiene forma de saber quién es administrador
en tu app. Tú calculas eso (con tu propio sistema de roles/permisos) y se
lo pasas:

```tsx
<AgentChat
  endpoint="/api/agent"
  showSettings={usuario.esAdmin}
  onOpenSettings={() => setModalAbierto(true)}
/>
```

Qué hacer al pulsarlo —pedir credenciales, mostrar ajustes, lo que sea— es
cosa tuya: el widget solo avisa del click.

---

## 3. El widget — con un `<script>` (sin build propio)

```html
<script src="https://cdn.jsdelivr.net/gh/JeanCorreaBarros/WidGet_Bi-voo_Agents@main/dist/standalone.global.js"></script>
<script>
  BivooAgent.init({
    endpoint: "/api/agent",
    accent: "#6d5efc",
    title: "Asistente",
  });
</script>
```

Ese único archivo (`standalone.global.js`) incluye React ya empaquetado
adentro — no hace falta que tu página cargue nada más. Acepta las mismas
propiedades que la tabla de arriba, en un objeto plano de JavaScript.

Para quitar el widget de la página (por ejemplo, al cerrar sesión):

```html
<script>BivooAgent.destroy();</script>
```

> La URL de jsDelivr sirve directamente cualquier archivo de un repo de
> GitHub — no hace falta ningún paso extra para tener un CDN.

---

## 4. Varios agentes, definidos por configuración

Todo lo de arriba asume un agente por instancia del widget: montas
`<AgentChat>`, le das un `endpoint`, y ese `endpoint` habla siempre con el
mismo agente. Para dos o tres agentes fijos (uno para tu panel, otro para
tus clientes) eso es lo más simple — monta un `<AgentChat>` por layout, con
su propio proxy (`createAgentRoutes({ agente: "..." })`), y ya está.

Esta sección es para cuando eso se queda corto: más de dos o tres agentes,
quieres poder crear uno nuevo o moverlo de ruta sin desplegar código, o
necesitas que un agente cubra "toda la app **menos** una zona" (un
checkout, una pasarela de pago) — algo que no se puede decir solo
incluyendo layouts.

La idea: una tabla de **accesos** (uno por agente, con su público, su ruta
y sus exclusiones) y **un solo componente**, montado una vez en tu layout
raíz, que en cada render pregunta "¿qué agentes hay y cuál toca aquí?" y
monta el que corresponde.

### El proxy — tres piezas, tres archivos de ruta

Cada una vive donde le corresponde por seguridad, no por comodidad — mira
el comentario de cada una en `bivoo-agent-widget/server`:

```ts
// app/api/agentes/route.ts — PÚBLICA
import { createAgentesListado } from "bivoo-agent-widget/server";
export const { GET } = createAgentesListado({ requireAdmin: miPropiaComprobacion });

// app/api/agente/[slug]/route.ts — PÚBLICA: el chat de un agente "publico"
import { createAgentePublicoRoute } from "bivoo-agent-widget/server";
export const { GET, POST } = createAgentePublicoRoute();

// app/api/admin/agentes/[...ruta]/route.ts — DENTRO de tu zona ya protegida
import { createAgentesAdminRoutes } from "bivoo-agent-widget/server";
export const { GET, POST, PUT, DELETE } = createAgentesAdminRoutes({
  requireAdmin: miPropiaComprobacion,
});
```

El tercero resuelve todo lo que exige ser administrador con un solo
catch-all: listar todos los agentes, crear, editar, borrar, el chat de los
agentes "staff", y la conexión (URL, App Token, secreto) de cualquiera de
los dos — configurar SIEMPRE es cosa de quien administra, aunque el agente
en sí sea público.

> ⚠️ `createAgentesAdminRoutes` **no** vuelve a comprobar por su cuenta que
> estás en una zona protegida — confía en que tú lo montaste dentro de la
> tuya (donde ya exiges sesión de administrador) y en tu `requireAdmin`. Si
> lo montas en una ruta pública, queda tan expuesto como cualquier otra
> ruta pública sin protección.

### El componente — uno solo, en el layout raíz

```tsx
// app/layout.tsx (Next.js App Router)
import { MultiAgentChat } from "bivoo-agent-widget/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <MultiAgentChat onOpenSettings={(slug) => abrirTuModal(slug)} />
      </body>
    </html>
  );
}
```

`MultiAgentChat` pregunta a `/api/agentes` (o al `listEndpoint` que le
pases), mira la ruta actual con `usePathname()`, y monta el `<AgentChat>`
que corresponde — o ninguno, si no hay agente para esa ruta. Vive en
`bivoo-agent-widget/next` y no en el entry principal porque usa
`next/navigation`: si no usas Next.js, la pieza reutilizable es
`agenteParaRuta` (también exportado desde `bivoo-agent-widget/server`) —
tú decides cómo obtener la ruta actual y montas `<AgentChat>` a mano con
el resultado.

### Quién ve qué: `audience`

Cada agente declara su `audience` al crearse:

| `audience` | Quién lo ve | Qué recibe el gateway sobre quien pregunta |
|---|---|---|
| `"staff"` | Solo dentro de tu zona protegida (`requireAdmin` en `true`) | Lo que le mandes en `identidad()` — normalmente permisos/rol de esa sesión |
| `"publico"` | Cualquiera | Igual, pero **nunca** debería llevar permisos internos — ni aunque quien pregunte esté logueado como administrador en otra pestaña |

Este paquete no trae un sistema de roles: `identidad()` es tu hueco para
calcular esas cabeceras con lo que ya uses en tu app.

```ts
export const { GET, POST } = createAgentePublicoRoute({
  identidad: async (req, audience) => {
    const sesion = await miSesion(req);
    // audience === "publico" aquí siempre — nunca mandes permisos internos.
    return sesion ? { "x-user-key": `user-${sesion.id}` } : {};
  },
});
```

### Dejar una ruta sin ningún agente

Cada acceso tiene `excludePaths` (rutas separadas por comas) además de su
`mountPath`. Es lo que resuelve "toda la tienda **menos** el checkout":

```
mountPath:     "/"
excludePaths:  "/checkout,/pago"
```

Un agente excluido de una ruta se aparta y deja que gane el siguiente que
encaje, si hay alguno — no bloquea la ruta para los demás.

### Tu propio almacén

`almacenAgentesDeArchivo()` (un JSON en el proyecto, sin cifrar — aquí no
hay secretos, solo nombre/ruta/audiencia) es el valor por defecto. Para tu
base de datos, pásale tu propio `AlmacenAgentes`:

```ts
export const { GET, POST, PUT, DELETE } = createAgentesAdminRoutes({
  requireAdmin: miPropiaComprobacion,
  almacenAgentes: {
    async listar() { return miDb.agentAccess.findMany(); },
    async crear(datos) { return miDb.agentAccess.create({ data: datos }); },
    async actualizar(slug, cambios) {
      return miDb.agentAccess.update({ where: { slug }, data: cambios }).catch(() => null);
    },
    async borrar(slug) { await miDb.agentAccess.delete({ where: { slug } }); },
  },
});
```

La conexión (URL, App Token, secreto) sigue siendo un `AlmacenConfig`
aparte — el mismo que ya usa `createAgentRoutes()` — porque es un dato
distinto: uno lleva secretos, el otro no, y no siempre conviene guardarlos
en el mismo sitio.

---

## Desarrollo de este paquete

```bash
npm install     # instala deps y compila (hook "prepare")
npm run build   # recompila a mano
npm run dev     # recompila al vuelo mientras editas
```

`src/AgentChat.tsx` es la fuente canónica del widget — el mismo archivo
vive también en el repo del gateway (`widget/AgentChat.tsx`) y en cada app
que lo integró copiándolo a mano antes de que existiera este paquete. Si
tocas algo aquí, sincronízalo también allá (o, mejor, migra esas apps a
instalar desde este paquete en vez de mantener su propia copia).
