# Carga semanal BarMan desde la app

## Objetivo
El cliente entra a /reportes/actualizar-barman, selecciona el respaldo .bm2 y lo sube. La app registra la carga en `barman_importaciones` y guarda el archivo en el bucket privado `barman-respaldos`.

## Paso 1 - Supabase
Ejecutar una sola vez en SQL Editor:

`scripts/barMan-etl/02_configurar_cola_cargas.sql`

El script crea:
- tabla `public.barman_importaciones`
- bucket privado `barman-respaldos`
- políticas RLS para usuarios autenticados
- límite de 100 MB por respaldo

## Paso 2 - App
Los archivos del parche agregan la ruta:

`/reportes/actualizar-barman`

La navegación queda:
- Panel Comercial
- Gráfica
- Actualizar BarMan

## Estados previstos
- subiendo
- pendiente
- descargando
- restaurando
- procesando
- validando
- importando
- completado
- error
- error_subida

La página refresca el historial cada 10 segundos.

## Paso 3 - Worker Windows
Después de comprobar que la carga desde la app funciona, se configura el worker de Windows para:
1. buscar el registro más antiguo con estado `pendiente`;
2. cambiarlo a `descargando`;
3. descargar el archivo privado desde Supabase Storage;
4. restaurarlo en SQL Server Express;
5. ejecutar el ETL incremental con ventana móvil;
6. actualizar los contadores y el estado en `barman_importaciones`;
7. terminar como `completado` o `error`.

La tarea programada puede ejecutarse cada 5 minutos. El día de carga seguirá siendo el lunes; la frecuencia corta solo evita que el cliente tenga que esperar a una hora fija.
