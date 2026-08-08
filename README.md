# Finanzas del Restaurante

App en Next.js (App Router) + Supabase para capturar movimientos contables
y consultar 3 reportes: Estado de Resultados, Balance General y Flujo de Caja.

## Requisitos previos

1. Haber ejecutado en el SQL Editor de tu proyecto de Supabase, en este orden:
   - `schema_restaurante.sql` (tablas, trigger de validación, catálogo de cuentas)
   - `vistas_reportes.sql` (vistas de los 3 reportes)

## Instalación local

```bash
npm install
cp .env.local.example .env.local
```

Edita `.env.local` con los datos de tu proyecto de Supabase
(Project Settings → API → Project URL / anon public key).

```bash
npm run dev
```

Abre http://localhost:3000

## Estructura

- `app/captura` — formulario para capturar pólizas y movimientos
- `app/reportes/estado-resultados` — reporte por rango de fechas
- `app/reportes/balance-general` — reporte a una fecha de corte, valida que Activo = Pasivo + Capital
- `app/reportes/flujo-caja` — entradas/salidas de efectivo por actividad (operación/inversión/financiamiento)
- `lib/supabaseClient.js` — cliente de Supabase
- `lib/format.js` — utilidades de formato de moneda/fecha

## Pendientes conocidos

- Las políticas de RLS actuales permiten leer/insertar a cualquier usuario autenticado.
  Cuando definas roles (dueño, contador, capturista) hay que refinarlas.
- La pantalla de captura no maneja login todavía — falta agregar Supabase Auth
  cuando decidas quién puede capturar movimientos.
- La clasificación de actividades del Flujo de Caja (operación/inversión/financiamiento)
  usa una regla por default en la vista SQL — conviene revisarla con datos reales.

## Despliegue

```bash
npm run build
```

Luego conecta el repo a Vercel y define las mismas variables de entorno
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) en el proyecto de Vercel.
