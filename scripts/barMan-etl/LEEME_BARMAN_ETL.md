# ETL incremental BarMan → Supabase

## Qué hace

1. Recibe un `.bm2` o `.bak`.
2. Detecta si el `.bm2` ya es un backup SQL Server (`TAPE`) o si contiene uno comprimido.
3. Restaura una base temporal `BARMAN_ETL` en `SQLEXPRESS`.
4. Lee la última fecha existente en `barman_ventas` de Supabase.
5. Revisa **15 días hacia atrás** desde esa fecha y todo lo posterior.
6. Extrae ventas, productos, pagos y cortesías desde las fuentes BarMan ya verificadas.
7. Valida venta vs pagos, propina vs propinas de pagos y que cada producto pertenezca a un `VentaID` válido.
8. Si una validación falla, **no modifica Supabase**.
9. Si todo es correcto, reemplaza en una sola transacción únicamente los `VentaID` de la ventana revisada.
10. Registra el respaldo y su SHA-256 en `barman_etl_ejecuciones` para evitar procesar dos veces el mismo archivo.

## Primera configuración

### 1) En Supabase SQL Editor
Ejecuta una sola vez:

`01_configurar_bitacora_supabase.sql`

### 2) Copia configuración
En esta misma carpeta:

```powershell
Copy-Item .\config.example.json .\config.json
```

Revisa `config.json`. Ya viene configurado para tu `SQLEXPRESS`, PostgreSQL 18 y el Session Pooler que usamos.

> `config.json` no guarda la contraseña.

### 3) Ejecutar un respaldo

```powershell
cd "C:\Users\jvaug\Documents\REPORTE FINANCIERO\restaurante-app\scripts\barMan-etl"

.\Procesar-BarmanIncremental.ps1 "C:\Users\jvaug\Downloads\BMDb_15-08-2026.bm2"
```

El script pedirá la contraseña PostgreSQL de Supabase sin mostrarla en pantalla.

## Flujo periódico

Cuando llegue un nuevo respaldo sólo cambias el archivo:

```powershell
.\Procesar-BarmanIncremental.ps1 "C:\Users\jvaug\Downloads\BMDb_30-08-2026.bm2"
```

No vuelve a procesar toda la historia. Reprocesa únicamente la ventana de revisión de 15 días y los registros nuevos.

## Por qué reemplaza la ventana y no sólo agrega VentaID nuevos

Porque una venta ya existente puede cambiar después: cancelación, devolución, cortesía, modificación de pago, propina o corrección. Al reemplazar únicamente los `VentaID` de la ventana reciente, Supabase queda como una réplica actualizada de BarMan para ese período.

## Evidencia de cada ejecución

Se crea:

`C:\Users\jvaug\Documents\REPORTE FINANCIERO\barman_etl\ejecuciones\AAAAMMDD_HHMMSS`

con:
- `ventas.csv`
- `productos.csv`
- `pagos.csv`
- `cortesias.csv`
- SQL transaccional generado
- `errores_validacion.csv` si algo no cuadra

## Seguridad

- No guardes la contraseña de PostgreSQL en GitHub.
- `config.json` sólo contiene host/usuario/rutas.
- La importación se ejecuta mediante `psql` y una transacción PostgreSQL.
- Si falla cualquier parte de la importación, `ON_ERROR_STOP` + `BEGIN/COMMIT` evita una actualización parcial.
