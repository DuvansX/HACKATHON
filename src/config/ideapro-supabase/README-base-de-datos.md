# Base de datos IDEA PRO — esquema para el agente IDEA IA

Proyecto Supabase: **IDEA PRO** (`nsicxoiopomlnejmyten`, región `us-east-1`).
URL del proyecto (no es secreta, es pública): `https://nsicxoiopomlnejmyten.supabase.co`

Este esquema soporta el reto de IDEAPRO: un agente conversacional que diagnostica el
nivel de madurez de una empresa frente al mercado público y recomienda, de forma
personalizada, contenidos, herramientas, capacitaciones, mentorías y consultorías
del portafolio de IDEAPRO.

## Principio de diseño clave: configuración por usuario, no global

`user_ai_config` guarda **una fila por usuario** (PK = `user_id`) con el tono, idioma,
canal preferido, frecuencia de seguimiento y un campo `configuracion` (JSON libre) para
cualquier parámetro nuevo del agente sin tener que migrar la base de datos. Se crea
automáticamente (trigger `trg_new_profile_ai_config`) apenas se registra un usuario, así
que el agente en n8n **siempre** tiene configuración propia de ese usuario para leer y
actualizar — nunca una configuración compartida entre todos.

`agent_memory` complementa esto con memoria de largo plazo **por usuario**: hechos,
preferencias, objetivos y contexto que el agente aprende en conversaciones pasadas
(upsert por `(user_id, clave)`), para dar continuidad real entre sesiones.

## Mapa de tablas

**Identidad y empresa**
- `profiles` — usuario autenticado con Google (extiende `auth.users`): rol, teléfono, onboarding.
- `companies` — perfil empresarial: NIT, ciudad, tamaño, años de operación, RUP, nivel de madurez actual.

**Diagnóstico de madurez**
- `maturity_levels` — catálogo (Exploración, Semillero, Intermedio, Avanzado) con rango de score.
- `diagnostic_questions` — banco de preguntas editable (categoría, tipo de respuesta, peso).
- `diagnostic_sessions` — una corrida del diagnóstico por empresa; guarda score, nivel resultante y `resumen_ia` (brechas/fortalezas generadas por el agente).
- `diagnostic_answers` — respuesta a cada pregunta, con el puntaje que aportó.

**Catálogo y recomendaciones**
- `services_catalog` — portafolio completo de IDEAPRO (contenido, herramienta, capacitación, mentoría, consultoría), incluyendo los 3 servicios reales: Programa Semillero, Auditoría de Pliegos y Ofertas, Consultoría de Consorcios y Alta Complejidad.
- `recommendations` — recomendación personalizada por empresa; `origen` distingue ruta principal (`diagnostico_inicial`, `seguimiento`) de cross-selling (`cross_sell`); `orden_en_ruta` arma la ruta de crecimiento.

**Personalización e IA**
- `user_ai_config` — configuración del agente **por usuario** (ver arriba).
- `agent_memory` — memoria persistente **por usuario** (y opcionalmente por empresa).

**Seguimiento y analítica**
- `follow_ups` — historial de evolución de la empresa (reevaluaciones, cambios de nivel, contactos).
- `agent_events` — log de eventos para analítica del embudo (`onboarding_iniciado`, `diagnostico_completado`, `recomendacion_generada`, `servicio_click`, etc. — texto libre, sin necesidad de migrar al agregar nuevos eventos).

**Conversación**
- `conversations` — sesión de chat (ahora con `company_id`, `canal`, `estado`).
- `messages` — historial de mensajes (ahora con `tipo` y `metadata` jsonb).

## Seguridad

- RLS activado en las 14 tablas. Cada usuario solo ve/edita sus propios datos (empresa,
  diagnósticos, recomendaciones, configuración, memoria, seguimiento, eventos).
- Los catálogos de referencia (`maturity_levels`, `services_catalog`, `diagnostic_questions`)
  son de lectura pública, gestión reservada al `service_role`.
- `get_advisors` (security) no reporta hallazgos tras la última migración.
- El agente en n8n debe conectarse con la **service role key** (bypasea RLS) y filtrar
  siempre por `user_id`/`company_id` en sus queries, ya que él actúa en nombre de distintos
  usuarios.

## Login con Google — ya activo

El proveedor de Google ya está activado en Authentication → Sign In / Providers, con el
Client ID y Client Secret generados en Google Cloud Console, y el Authorized redirect URI
configurado en Google apuntando a:
```
https://nsicxoiopomlnejmyten.supabase.co/auth/v1/callback
```

Para que el login quede bien resuelto de punta a punta, la base de datos ahora provisiona
todo automáticamente cuando alguien entra por primera vez con Google (o cualquier otro
proveedor que se active después):

- `trg_handle_new_user` (en `auth.users`, AFTER INSERT) crea la fila en `profiles` con el
  nombre y la foto que trae Google, y en cascada dispara `trg_new_profile_ai_config`, que
  crea la fila en `user_ai_config` — así cada usuario nuevo arranca con su propia
  configuración del agente desde el primer login, nunca una global.
- `trg_handle_user_updated` (en `auth.users`, AFTER UPDATE) sincroniza `profiles` si el
  usuario vuelve a loguearse y su nombre o foto de Google cambiaron.
- Ambas funciones son `SECURITY DEFINER` con `search_path` fijo y sin permiso de ejecución
  directa para `anon`/`authenticated` (solo corren como trigger) — así lo confirma
  `get_advisors` (security), sin hallazgos nuevos.

**Pendiente, fuera del alcance de SQL (se configura en el dashboard, no en la base de
datos):** en Authentication → URL Configuration, agrega en "Site URL" y "Redirect URLs"
la dirección donde vaya a vivir tu landing page (ej. `http://localhost:3000` mientras
pruebas, y tu dominio real cuando lo tengas). Sin esto, Google completa el login pero
Supabase no sabe a qué página de tu app devolver al usuario.

## Cómo dispara el login desde el futuro frontend (Visual Studio)

Cuando construyas la landing page, el botón "Continuar con Google" es una sola llamada
del SDK de Supabase — no necesita ninguna llave nueva, solo la URL y la anon key que ya
están en `.env.example`:

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

async function loginConGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin } // debe estar en Redirect URLs
  })
}
```

No hay nada que instalar ni configurar aparte de pegar esas dos variables en tu `.env`
local (nunca la service role key en el frontend).

## Cambiar / recuperar contraseña (login por email) — ya soportado

La contraseña en sí la guarda y valida Supabase Auth internamente (nunca en una tabla de
`public`), así que el frontend no necesita tocar la base de datos directamente — solo llama
al SDK. Del lado de la base de datos ya está todo listo para que ese cambio quede
registrado: `profiles.password_actualizada_at` y un evento `password_actualizado` en
`agent_events` se generan solos vía trigger apenas Supabase Auth actualiza la contraseña.

**Caso 1 — el usuario ya inició sesión y quiere cambiar su contraseña desde su perfil:**
```js
const { error } = await supabase.auth.updateUser({
  password: 'la-nueva-contraseña'
})
```

**Caso 2 — el usuario olvidó su contraseña (flujo "Forgot password"):**
```js
// Paso 1: el usuario pide el correo de recuperación
await supabase.auth.resetPasswordForEmail('correo@empresa.com', {
  redirectTo: `${window.location.origin}/actualizar-password`, // debe estar en Redirect URLs
})

// Paso 2: en /actualizar-password, Supabase ya autenticó al usuario con el link del correo
const { error } = await supabase.auth.updateUser({
  password: 'la-nueva-contraseña'
})
```

No hace falta ninguna llave nueva ni tabla adicional para esto — es 100% del SDK de
Supabase, y la base de datos queda sincronizada automáticamente.

**Nota sobre seguridad:** en Authentication → Attack Protection existe la opción "Prevent
use of leaked passwords" (verifica contraseñas contra HaveIBeenPwned), pero solo está
disponible desde el plan Pro de Supabase en adelante — en el plan Free no se puede activar,
no es un error de configuración.

**Ya implementado en el frontend:** el "Caso 2" de arriba vive en
`src/components/auth/login.html` (el link "¿Olvidaste tu contraseña?" llama a
`enviarCorreoRestablecimiento` en `src/config/supabase.js`). La misma pantalla gestiona el
enlace de recuperación y la actualización de la contraseña, por lo que no hay una página ni
un flujo duplicado que mantener.

## Flujo sugerido para el agente en n8n

1. Usuario inicia sesión (Google) → existe `profiles` + `user_ai_config` (fila creada automáticamente).
2. Agente lee `user_ai_config` y `agent_memory` del usuario para personalizar el tono y recordar contexto previo.
3. Onboarding conversacional → crea/actualiza `companies`.
4. Diagnóstico → crea `diagnostic_sessions`, guarda `diagnostic_answers`, calcula `score_total` y `nivel_madurez_resultado_id`, actualiza `companies.nivel_madurez_actual_id`.
5. Recomendación → inserta filas en `recommendations` (origen `diagnostico_inicial`) usando `services_catalog` filtrado por nivel de madurez; cross-selling adicional con origen `cross_sell`.
6. Seguimiento → agente registra eventos en `agent_events` y, en reevaluaciones o cambios de nivel, en `follow_ups`.

## Configuración de entorno

El frontend usa el cliente definido en `src/config/supabase.js`. Las variables privadas y las
credenciales de servicios externos no deben guardarse en el repositorio.

## Sobre las API keys — importante

Ninguna llave de Supabase, de Claude/Anthropic ni de otro servicio debe vivir en esta
carpeta ni en ningún repositorio. Todas las credenciales (Supabase service role key,
credenciales del modelo de IA, etc.) se configuran únicamente como **credenciales dentro
de n8n** (Settings → Credentials), que es donde vive el agente IDEA IA. Si en algún
momento necesitas la URL o las llaves públicas/anónimas de este proyecto para configurar
esas credenciales en n8n, dímelo y las obtengo directamente desde Supabase para que las
pegues allí — nunca las escribo en archivos de este repositorio.
