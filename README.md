# IDEAPRO

Proyecto web estático organizado por componentes.

## Ejecutar localmente

Abre `index.html` en un servidor web local (por ejemplo `npx serve .`).

## Backend

Autenticación y datos viven en Supabase (proyecto **IDEA PRO**). El cliente y las
funciones de auth/chat están en `src/config/supabase.js` y
`src/components/shared/supabase-chat-store.js`. El esquema de base de datos está
documentado en `ideapro-supabase/README-base-de-datos.md`.
