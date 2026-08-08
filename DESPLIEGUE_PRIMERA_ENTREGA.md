# Primera entrega comercial — autenticación y publicación

## 1. Seguridad de las tablas comerciales

En Supabase abre **SQL Editor**, crea una consulta nueva y ejecuta el contenido de:

`scripts/configurar-seguridad-comercial.sql`

Esto activa RLS y permite lectura solamente a usuarios autenticados en:

- `barman_ventas`
- `barman_productos`
- `barman_pagos`
- `barman_cortesias`

## 2. Crear usuarios

En Supabase ve a **Authentication > Users** y crea/invita los usuarios que podrán entrar.

La aplicación deliberadamente no tiene registro público. Solo las cuentas creadas/autorizadas en Supabase pueden iniciar sesión.

## 3. Recuperación de contraseña

En Supabase ve a **Authentication > URL Configuration**.

Cuando tengas el dominio definitivo, configura:

- **Site URL:** `https://TU-DOMINIO`
- **Redirect URLs:** agrega `https://TU-DOMINIO/actualizar-contrasena`

Para pruebas locales conserva también:

- `http://localhost:3000/actualizar-contrasena`

## 4. Publicar en Vercel

Sube el proyecto a un repositorio Git (GitHub/GitLab/Bitbucket) y crea un proyecto en Vercel.

En **Project Settings > Environment Variables** agrega:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_COMMERCIAL_ONLY=true`

No subas `.env.local` al repositorio.

Build command: `npm run build`

Vercel detectará Next.js automáticamente.

## 5. Primera entrega

Con `APP_COMMERCIAL_ONLY=true` solo quedan publicadas las rutas comerciales y de acceso. Los demás archivos/módulos permanecen en el código, pero las rutas de la primera entrega los bloquean. Los endpoints `/api/*` también quedan bloqueados en esta etapa.

Cuando llegue la siguiente etapa y quieras reactivar los módulos internos, cambia:

`APP_COMMERCIAL_ONLY=false`

Luego revisaremos permisos/RLS específicos para cada módulo antes de publicarlos.
