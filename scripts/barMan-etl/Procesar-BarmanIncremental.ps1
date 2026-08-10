[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$BackupPath,
    [string]$ConfigPath = "$PSScriptRoot\config.json",
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}
function Write-Ok([string]$Text) {
    Write-Host "    OK: $Text" -ForegroundColor Green
}
function Quote-SqlLiteral([string]$Value) {
    if ($null -eq $Value) { return 'NULL' }
    return "'" + $Value.Replace("'", "''") + "'"
}
function Get-First4([string]$Path) {
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $b = New-Object byte[] 4
        [void]$fs.Read($b,0,4)
        return [System.Text.Encoding]::ASCII.GetString($b)
    } finally { $fs.Dispose() }
}
function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontró '$Name' en PATH."
    }
}
function Invoke-SqlServerScalar([string]$Server,[string]$Query) {
    $out = & sqlcmd -S $Server -E -W -h -1 -Q "SET NOCOUNT ON; $Query" 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($out -join "`n") }
    return (($out | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1).Trim())
}
function Invoke-SqlServerNonQuery([string]$Server,[string]$Query) {
    $out = & sqlcmd -S $Server -E -b -Q $Query 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($out -join "`n") }
    return $out
}
function Invoke-DataTable([string]$Server,[string]$Database,[string]$Query,[datetime]$StartDate) {
    $cs = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;"
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    $cmd = $cn.CreateCommand()
    $cmd.CommandTimeout = 300
    $cmd.CommandText = $Query
    [void]$cmd.Parameters.Add('@StartDate',[System.Data.SqlDbType]::DateTime)
    $cmd.Parameters['@StartDate'].Value = $StartDate
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $dt = New-Object System.Data.DataTable
    try {
        [void]$da.Fill($dt)
        # DataTable implementa IEnumerable. PowerShell puede desdoblarlo en sus
        # DataRow y convertir el resultado de la función en System.Object[].
        # La coma unaria obliga a devolver el DataTable como un único objeto.
        return (, $dt)
    } finally {
        $da.Dispose(); $cmd.Dispose(); $cn.Dispose()
    }
}
function Export-TableCsv([System.Data.DataTable]$Table,[string]$Path) {
    $rows = foreach ($row in $Table.Rows) {
        $o = [ordered]@{}
        foreach ($c in $Table.Columns) {
            $v = $row[$c.ColumnName]
            if ($v -is [DBNull]) { $v = $null }
            $o[$c.ColumnName] = $v
        }
        [pscustomobject]$o
    }
    if ($Table.Rows.Count -gt 0) {
        $rows | Export-Csv -Path $Path -NoTypeInformation -Encoding UTF8
    } else {
        $header = ($Table.Columns | ForEach-Object { '"' + $_.ColumnName.Replace('"','""') + '"' }) -join ','
        [IO.File]::WriteAllText($Path, $header + [Environment]::NewLine, (New-Object Text.UTF8Encoding($true)))
    }
}
function Invoke-Psql([string[]]$PsqlArgs) {
    $out = & $script:Psql @PsqlArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($out -join "`n") }
    return $out
}
function Psql-Scalar([string]$Sql) {
    $psqlArgs = @('-h',$Cfg.SupabaseHost,'-p',[string]$Cfg.SupabasePort,'-U',$Cfg.SupabaseUser,'-d',$Cfg.SupabaseDatabase,'-t','-A','-v','ON_ERROR_STOP=1','-c',$Sql)
    $out = Invoke-Psql $psqlArgs
    return (($out | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1).Trim())
}
function Get-TargetColumns([string]$Table) {
    $sql = "select column_name from information_schema.columns where table_schema='public' and table_name='$Table' order by ordinal_position;"
    $psqlArgs = @('-h',$Cfg.SupabaseHost,'-p',[string]$Cfg.SupabasePort,'-U',$Cfg.SupabaseUser,'-d',$Cfg.SupabaseDatabase,'-t','-A','-v','ON_ERROR_STOP=1','-c',$sql)
    return @(Invoke-Psql $psqlArgs | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
}
function Get-CsvHeaders([string]$Path) {
    $first = Get-Content -Path $Path -TotalCount 1
    if (-not $first) { return @() }
    # Export-Csv siempre genera encabezados entre comillas; Import-Csv nos da nombres fiables.
    $sample = Import-Csv -Path $Path | Select-Object -First 1
    if ($sample) { return @($sample.PSObject.Properties.Name) }
    return @($first -split ',' | ForEach-Object { $_.Trim('"') })
}
function Common-Columns([string]$Csv,[string]$Target) {
    $headers = Get-CsvHeaders $Csv
    $targetCols = Get-TargetColumns $Target
    return @($headers | Where-Object { $targetCols -contains $_ })
}

function Export-CsvSubset([string]$SourceCsv,[string]$DestinationCsv,[string[]]$Columns) {
    if (-not $Columns -or $Columns.Count -eq 0) {
        throw "No hay columnas para proyectar desde $SourceCsv."
    }

    $rows = @(Import-Csv -Path $SourceCsv)
    if ($rows.Count -gt 0) {
        $rows |
            Select-Object -Property $Columns |
            Export-Csv -Path $DestinationCsv -NoTypeInformation -Encoding UTF8
    }
    else {
        # Mantener un CSV válido aun cuando no existan filas.
        $header = ($Columns | ForEach-Object {
            '"' + ([string]$_).Replace('"','""') + '"'
        }) -join ','
        [IO.File]::WriteAllText(
            $DestinationCsv,
            $header + [Environment]::NewLine,
            (New-Object Text.UTF8Encoding($true))
        )
    }
}
function Csv-SqlPath([string]$Path) {
    return $Path.Replace('\','/').Replace("'","''")
}

if (-not (Test-Path $ConfigPath)) {
    throw "No existe $ConfigPath. Copia config.example.json como config.json y revisa sus valores."
}
$Cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$script:Psql = $Cfg.PsqlPath

if (-not (Test-Path $BackupPath)) { throw "No existe el respaldo: $BackupPath" }
if (-not (Test-Path $script:Psql)) { throw "No existe psql en: $script:Psql" }
Assert-Command 'sqlcmd'

if (-not $env:PGPASSWORD) {
    $secure = Read-Host 'Contraseña PostgreSQL de Supabase' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$runDir = Join-Path $Cfg.WorkRoot "ejecuciones\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$hash = (Get-FileHash -Path $BackupPath -Algorithm SHA256).Hash.ToLowerInvariant()
$backupName = [IO.Path]::GetFileName($BackupPath)

Write-Step "Comprobando si el respaldo ya fue procesado"
$already = Psql-Scalar "select count(*) from public.barman_etl_ejecuciones where respaldo_sha256='$hash' and estado='ok';"
if (-not $Force -and [int]$already -gt 0) {
    throw "Este respaldo ya fue procesado correctamente. Usa -Force sólo si deseas repetirlo."
}
Write-Ok "Respaldo nuevo: $backupName"

Write-Step "Preparando .bm2/.bak"
$bakPath = Join-Path $runDir 'BarMan_entrada.bak'
$sig = Get-First4 $BackupPath

if ($sig.Substring(0,2) -eq 'PK') {
    $unzip = Join-Path $runDir 'descomprimido'
    Expand-Archive -Path $BackupPath -DestinationPath $unzip -Force

    $candidate = Get-ChildItem $unzip -Recurse -File |
        Sort-Object @{Expression={ if ($_.Extension -ieq '.bak') { 0 } else { 1 } }}, @{Expression='Length';Descending=$true} |
        Select-Object -First 1

    if (-not $candidate) {
        throw 'El .bm2 es ZIP, pero no contiene archivos para validar como respaldo SQL Server.'
    }

    Copy-Item $candidate.FullName $bakPath -Force
    Write-Ok "Contenedor ZIP extraído: $($candidate.Name)"
}
elseif ([System.IO.Path]::GetExtension($BackupPath) -ieq '.bm2') {
    # Los respaldos .bm2 de BarMan están comprimidos mediante DeflateStream.
    # Se descomprimen directamente a un .bak que SQL Server puede restaurar.
    Write-Host "    Descomprimiendo respaldo BarMan con DeflateStream..." -ForegroundColor Gray

    $entrada = [System.IO.File]::OpenRead($BackupPath)
    try {
        $deflate = New-Object System.IO.Compression.DeflateStream(
            $entrada,
            [System.IO.Compression.CompressionMode]::Decompress
        )
        try {
            $destino = [System.IO.File]::Create($bakPath)
            try {
                $deflate.CopyTo($destino)
            }
            finally {
                $destino.Dispose()
            }
        }
        finally {
            $deflate.Dispose()
        }
    }
    finally {
        $entrada.Dispose()
    }

    if (-not (Test-Path $bakPath)) {
        throw 'No se generó el archivo .bak después de descomprimir el .bm2.'
    }

    $bakLength = (Get-Item $bakPath).Length
    if ($bakLength -le 0) {
        throw 'El .bak descomprimido tiene tamaño cero.'
    }

    Write-Ok ("DeflateStream completado. Tamaño .bak: {0:N0} bytes" -f $bakLength)
}
else {
    Copy-Item $BackupPath $bakPath -Force
    Write-Ok "Archivo copiado para validación por SQL Server (firma inicial informativa: '$sig')"
}

# SQL Server Express se ejecuta con su propia cuenta de servicio.
# Otorgamos lectura al archivo generado para evitar Operating system error 5.
$sqlServiceAccount = 'NT SERVICE\MSSQL$SQLEXPRESS'
$icaclsOut = & icacls $bakPath /grant "$sqlServiceAccount`:(R)" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "No pude otorgar permiso de lectura al servicio SQL Server sobre '$bakPath'.`n$($icaclsOut -join "`n")"
}
Write-Ok "Permiso de lectura otorgado a MSSQL`$SQLEXPRESS"

Write-Ok "Respaldo SQL preparado"

Write-Step "Leyendo nombres lógicos del respaldo"
$fileList = & sqlcmd -S $Cfg.SqlServer -E -W -s '|' -h -1 -Q "RESTORE FILELISTONLY FROM DISK=N'$($bakPath.Replace("'","''"))';" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "SQL Server no reconoció el .bm2 copiado como respaldo restaurable.`n$($fileList -join "`n")"
}
$dataLogical = $null
$logLogical = $null

# RESTORE FILELISTONLY devuelve una fila por archivo. sqlcmd puede variar
# ligeramente el espaciado/formato según versión e idioma, así que evitamos
# depender de objetos intermedios y analizamos cada línea directamente.
foreach ($lineObj in $fileList) {
    $line = [string]$lineObj
    if ([string]::IsNullOrWhiteSpace($line) -or $line -notmatch '\|') { continue }

    $parts = @($line.Split('|') | ForEach-Object { ([string]$_).Trim() })
    if ($parts.Count -lt 3) { continue }

    $logical = $parts[0]
    $type = $parts[2].Trim().ToUpperInvariant()

    if (-not $dataLogical -and $type -eq 'D' -and -not [string]::IsNullOrWhiteSpace($logical)) {
        $dataLogical = $logical
    }
    elseif (-not $logLogical -and $type -eq 'L' -and -not [string]::IsNullOrWhiteSpace($logical)) {
        $logLogical = $logical
    }
}

# Respaldo BarMan histórico: estos LogicalName ya fueron confirmados mediante
# RESTORE FILELISTONLY en esta instalación. El fallback evita que diferencias
# de formato de sqlcmd bloqueen una restauración válida.
if (-not $dataLogical) {
    $barManDataLine = $fileList | Where-Object { ([string]$_) -match '^\s*BarMan\s*\|' } | Select-Object -First 1
    if ($barManDataLine) { $dataLogical = 'BarMan' }
}
if (-not $logLogical) {
    $barManLogLine = $fileList | Where-Object { ([string]$_) -match '^\s*BarMan_log\s*\|' } | Select-Object -First 1
    if ($barManLogLine) { $logLogical = 'BarMan_log' }
}

# Último fallback para respaldos BarMan de esta misma familia.
if (-not $dataLogical -and -not $logLogical) {
    Write-Host "    AVISO: sqlcmd no permitió interpretar FILELISTONLY; usando nombres lógicos BarMan conocidos." -ForegroundColor Yellow
    $dataLogical = 'BarMan'
    $logLogical = 'BarMan_log'
}

if (-not $dataLogical -or -not $logLogical) {
    $rawFileList = ($fileList | ForEach-Object { [string]$_ }) -join "`n"
    throw "No pude identificar LogicalName de datos/log.`nSalida RESTORE FILELISTONLY:`n$rawFileList"
}

Write-Ok "Datos=$dataLogical / Log=$logLogical"

$dataRoot = Invoke-SqlServerScalar $Cfg.SqlServer "select cast(serverproperty('InstanceDefaultDataPath') as nvarchar(4000));"
if (-not $dataRoot) { throw 'No se pudo obtener la carpeta DATA de SQL Server.' }
$dataFile = Join-Path $dataRoot "$($Cfg.SqlDatabase).mdf"
$logFile  = Join-Path $dataRoot "$($Cfg.SqlDatabase)_log.ldf"

Write-Step "Restaurando base temporal $($Cfg.SqlDatabase)"
$restoreSql = @"
IF DB_ID(N'$($Cfg.SqlDatabase)') IS NOT NULL
BEGIN
  ALTER DATABASE [$($Cfg.SqlDatabase)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [$($Cfg.SqlDatabase)];
END;
RESTORE DATABASE [$($Cfg.SqlDatabase)]
FROM DISK=N'$($bakPath.Replace("'","''"))'
WITH MOVE N'$($dataLogical.Replace("'","''"))' TO N'$($dataFile.Replace("'","''"))',
     MOVE N'$($logLogical.Replace("'","''"))' TO N'$($logFile.Replace("'","''"))',
     RECOVERY, REPLACE, STATS=10;
"@
Invoke-SqlServerNonQuery $Cfg.SqlServer $restoreSql | Out-Host
Write-Ok 'Restauración terminada'

Write-Step "Calculando ventana incremental"
$maxFechaText = Psql-Scalar "select coalesce(to_char(max(fecha)::date,'YYYY-MM-DD'),'1900-01-01') from public.barman_ventas;"
$maxFecha = [datetime]::ParseExact($maxFechaText,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
$startDate = $maxFecha.AddDays(-[int]$Cfg.ReviewDays)
if ($maxFecha.Year -eq 1900) { $startDate = [datetime]'1900-01-01' }
Write-Ok "Última fecha en Supabase: $($maxFecha.ToString('yyyy-MM-dd')); revisar desde: $($startDate.ToString('yyyy-MM-dd'))"

$ventasQuery = @"
WITH Pagos AS (
 SELECT OperationID AS VentaID, SUM(Payment) TotalPagos, SUM(dblPropina) PropinaPagos,
        SUM(CASE WHEN TipoDePagoNombre='Efectivo' THEN Payment ELSE 0 END) Efectivo,
        SUM(CASE WHEN TipoDePagoNombre='Tarjeta Crédito' THEN Payment ELSE 0 END) Credito,
        SUM(CASE WHEN TipoDePagoNombre='Tarjeta Debito' THEN Payment ELSE 0 END) Debito,
        SUM(CASE WHEN TipoDePagoNombre='American Express' THEN Payment ELSE 0 END) AmericanExpress
 FROM dbo.operationpaymentsbak GROUP BY OperationID
)
SELECT o.OperationIDint venta_id, CONVERT(varchar(19),o.OperationDate,120) fecha,
 CAST(ROUND(o.OperationSubTotal,2) AS decimal(18,2)) subtotal,
 CAST(ROUND(o.OperationTotal-o.OperationSubTotal,2) AS decimal(18,2)) iva,
 CAST(ROUND(o.OperationTotal,2) AS decimal(18,2)) total_venta,
 CAST(ROUND(o.OperationDiscount,2) AS decimal(18,2)) descuento,
 CAST(ROUND(o.dblPropina,2) AS decimal(18,2)) propina,
 CAST(ROUND(o.OperationTotal+o.dblPropina,2) AS decimal(18,2)) venta_mas_propina,
 CAST(ROUND(ISNULL(p.TotalPagos,0),2) AS decimal(18,2)) total_pagos,
 CAST(ROUND(ISNULL(p.Efectivo,0),2) AS decimal(18,2)) efectivo,
 CAST(ROUND(ISNULL(p.Credito,0),2) AS decimal(18,2)) credito,
 CAST(ROUND(ISNULL(p.Debito,0),2) AS decimal(18,2)) debito,
 CAST(ROUND(ISNULL(p.AmericanExpress,0),2) AS decimal(18,2)) american_express,
 o.TerminalNombre terminal_nombre, o.CajeroNombre cajero_nombre,
 o.txtmeseronombre mesero_nombre, o.MesaNombre mesa_nombre, o.SeccionNombre seccion_nombre,
 o.OperationComment operation_comment,
 CASE WHEN o.OperationTotal>0 THEN 'VENTA' WHEN o.OperationTotal=0 AND o.OperationDiscount>0 THEN 'CORTESIA_100' ELSE 'OPERACION_CERO' END tipo_registro,
 CAST(ROUND(o.OperationTotal-ISNULL(p.TotalPagos,0),2) AS decimal(18,2)) diferencia_venta_pago,
 CAST(ROUND(o.dblPropina-ISNULL(p.PropinaPagos,0),2) AS decimal(18,2)) diferencia_propina
FROM dbo.operationsbak o LEFT JOIN Pagos p ON p.VentaID=o.OperationIDint
WHERE o.OperationDate >= @StartDate
ORDER BY o.OperationDate,o.OperationIDint;
"@
$pagosQuery = @"
SELECT p.OperationID venta_id, p.OperationPaymentID pago_id, p.PayMethodID tipo_pago_id,
 p.TipoDePagoNombre forma_pago, CAST(ROUND(p.Payment,2) AS decimal(18,2)) importe_pago,
 CAST(ROUND(p.dblPropina,2) AS decimal(18,2)) propina_pago,
 CAST(ROUND(p.Payment+p.dblPropina,2) AS decimal(18,2)) cobro_mas_propina,
 p.ReferenceCode referencia, p.MetodoDePago metodo_de_pago, p.TipoNombre tipo_nombre,
 CAST(ROUND(p.ComisionPorUsoDeFormaDePago,2) AS decimal(18,2)) comision,
 p.DescontarComisionPorUsoAPropina descontar_comision_por_uso_a_propina
FROM dbo.operationpaymentsbak p
JOIN dbo.operationsbak o ON o.OperationIDint=p.OperationID
WHERE o.OperationDate >= @StartDate
ORDER BY p.OperationID,p.OperationPaymentID;
"@
$productosQuery = @"
SELECT vp.VentaID venta_id, vp.ID venta_producto_id, vp.ProductoCodigo producto_codigo,
 vp.ProductoNombre producto_nombre, vp.ProductoID producto_id,
 CAST(ROUND(vp.ProductoCantidad,4) AS decimal(18,4)) cantidad,
 CAST(ROUND(vp.ProductoCostoUnitario,2) AS decimal(18,2)) costo_unitario,
 CAST(ROUND(vp.ProductoPrecioUnitario,2) AS decimal(18,2)) precio_unitario,
 CAST(ROUND(vp.ProductoSubtotalUnitario,2) AS decimal(18,2)) subtotal_unitario,
 CAST(ROUND(vp.ProductoImpuestoUnitario,2) AS decimal(18,2)) iva_unitario,
 CAST(ROUND(vp.ProductoDescuentoUnitario,2) AS decimal(18,2)) descuento_unitario,
 CAST(ROUND(vp.ProductoCantidad*vp.ProductoPrecioUnitario,2) AS decimal(18,2)) importe_lista,
 vp.EsModificador es_modificador, vp.EsDevolucion es_devolucion,
 vp.MotivoDevolucion motivo_devolucion, vp.ProductoImpuesto1Nombre impuesto,
 vp.ComentariosPreparacion comentarios_preparacion
FROM dbo.v_ventaproducto vp
JOIN dbo.operationsbak o ON o.OperationIDint=vp.VentaID
WHERE o.OperationDate >= @StartDate
ORDER BY vp.VentaID,vp.ID;
"@
$cortesiasQuery = @"
SELECT o.OperationIDint venta_id, CONVERT(varchar(19),o.OperationDate,120) fecha,
 CAST(ROUND(o.OperationDiscount,2) AS decimal(18,2)) importe_cortesia,
 o.MesaNombre mesa_nombre, o.txtmeseronombre mesero, o.CajeroNombre cajero,
 o.SeccionNombre seccion_nombre, o.OperationComment operation_comment
FROM dbo.operationsbak o
WHERE o.OperationDate >= @StartDate AND o.OperationTotal=0 AND o.OperationDiscount>0
ORDER BY o.OperationDate,o.OperationIDint;
"@

Write-Step 'Extrayendo ventana desde SQL Server'
$dtVentas = Invoke-DataTable $Cfg.SqlServer $Cfg.SqlDatabase $ventasQuery $startDate
$dtPagos = Invoke-DataTable $Cfg.SqlServer $Cfg.SqlDatabase $pagosQuery $startDate
$dtProductos = Invoke-DataTable $Cfg.SqlServer $Cfg.SqlDatabase $productosQuery $startDate
$dtCortesias = Invoke-DataTable $Cfg.SqlServer $Cfg.SqlDatabase $cortesiasQuery $startDate
$ventasCsv=Join-Path $runDir 'ventas.csv'; Export-TableCsv $dtVentas $ventasCsv
$pagosCsv=Join-Path $runDir 'pagos.csv'; Export-TableCsv $dtPagos $pagosCsv
$productosCsv=Join-Path $runDir 'productos.csv'; Export-TableCsv $dtProductos $productosCsv
$cortesiasCsv=Join-Path $runDir 'cortesias.csv'; Export-TableCsv $dtCortesias $cortesiasCsv
Write-Ok "Ventas=$($dtVentas.Rows.Count), Productos=$($dtProductos.Rows.Count), Pagos=$($dtPagos.Rows.Count), Cortesías=$($dtCortesias.Rows.Count)"

Write-Step 'Validando consistencia'
$ventas = @(Import-Csv $ventasCsv)
$pagos = @(Import-Csv $pagosCsv)
$productos = @(Import-Csv $productosCsv)
$ventaIds = @{}; foreach($v in $ventas){ $ventaIds[[string]$v.venta_id]=$true }
$payAgg=@{}; foreach($p in $pagos){ $id=[string]$p.venta_id; if(-not $payAgg[$id]){$payAgg[$id]=[ordered]@{Pago=0.0;Propina=0.0}}; $payAgg[$id].Pago += [double]$p.importe_pago; $payAgg[$id].Propina += [double]$p.propina_pago }
$errors = New-Object System.Collections.Generic.List[object]
foreach($v in $ventas){
    $id=[string]$v.venta_id; $total=[double]$v.total_venta; $tip=[double]$v.propina
    $pa = if($payAgg.ContainsKey($id)){$payAgg[$id]}else{[ordered]@{Pago=0.0;Propina=0.0}}
    if($total -gt 0 -and [math]::Abs($total-$pa.Pago) -gt 0.05){$errors.Add([pscustomobject]@{tipo='VENTA_PAGO';venta_id=$id;esperado=$total;real=$pa.Pago})}
    if([math]::Abs($tip-$pa.Propina) -gt 0.05){$errors.Add([pscustomobject]@{tipo='PROPINA';venta_id=$id;esperado=$tip;real=$pa.Propina})}
}
foreach($p in $productos){ if(-not $ventaIds.ContainsKey([string]$p.venta_id)){$errors.Add([pscustomobject]@{tipo='PRODUCTO_SIN_VENTA';venta_id=$p.venta_id;esperado='Venta válida';real='No encontrada'})} }
if($errors.Count -gt 0){
    $errCsv=Join-Path $runDir 'errores_validacion.csv'; $errors | Export-Csv $errCsv -NoTypeInformation -Encoding UTF8
    throw "Validación falló con $($errors.Count) diferencias. Revisa $errCsv. No se modificó Supabase."
}
Write-Ok 'Venta=pagos, propinas y relaciones de productos validadas'

Write-Step 'Preparando reemplazo transaccional en Supabase'
$tables = @{
 'barman_ventas'=$ventasCsv; 'barman_productos'=$productosCsv; 'barman_pagos'=$pagosCsv; 'barman_cortesias'=$cortesiasCsv
}
$common=@{}
$copyCsv=@{}
foreach($t in $tables.Keys){
    $common[$t] = @(Common-Columns $tables[$t] $t)
    if($common[$t].Count -eq 0){throw "No hay columnas compatibles para $t."}

    # PostgreSQL COPY exige que el número y orden de campos del CSV coincida
    # exactamente con la lista declarada de columnas. Creamos un CSV proyectado
    # únicamente con las columnas que existen tanto en BarMan como en Supabase.
    $projected = Join-Path $runDir ("copy_" + $t + ".csv")
    Export-CsvSubset $tables[$t] $projected $common[$t]
    $copyCsv[$t] = $projected
}

$maxVenta = 0
foreach($v in $ventas){ if([int64]$v.venta_id -gt $maxVenta){$maxVenta=[int64]$v.venta_id} }
$backupMtime=(Get-Item $BackupPath).LastWriteTimeUtc.ToString('o')

$sqlFile=Join-Path $runDir 'importar_supabase.sql'
$sb=New-Object System.Text.StringBuilder
[void]$sb.AppendLine('\set ON_ERROR_STOP on')
[void]$sb.AppendLine('BEGIN;')
$productTargetCols = @(Get-TargetColumns 'barman_productos')
$hasCategoria = $productTargetCols -contains 'categoria'
$hasProductoCodigo = $productTargetCols -contains 'producto_codigo'
# conservar clasificación alimento/bebida antes de reemplazar filas
if ($hasCategoria) {
    if ($hasProductoCodigo) {
        [void]$sb.AppendLine("CREATE TEMP TABLE cat_map AS SELECT DISTINCT ON (coalesce(producto_codigo::text,''), coalesce(producto_nombre,'')) producto_codigo, producto_nombre, categoria FROM public.barman_productos WHERE categoria IS NOT NULL ORDER BY coalesce(producto_codigo::text,''),coalesce(producto_nombre,''),categoria;")
    } else {
        [void]$sb.AppendLine("CREATE TEMP TABLE cat_map AS SELECT DISTINCT ON (coalesce(producto_nombre,'')) producto_nombre, categoria FROM public.barman_productos WHERE categoria IS NOT NULL ORDER BY coalesce(producto_nombre,''),categoria;")
    }
}
foreach($x in @(@('barman_ventas','stg_v'),@('barman_productos','stg_pr'),@('barman_pagos','stg_pg'),@('barman_cortesias','stg_c'))){
    $table=$x[0];$stg=$x[1];$csv=$copyCsv[$table];$cols=$common[$table]
    [void]$sb.AppendLine("CREATE TEMP TABLE $stg (LIKE public.$table INCLUDING DEFAULTS);")
    # LIKE siempre hereda los NOT NULL de la tabla real, aunque la columna no
    # venga en el CSV de origen (p. ej. "categoria" no existe en BarMan y se
    # reconstruye después via cat_map). Hay que relajar esa columna en la
    # tabla temporal para poder cargarla con NULL antes del UPDATE de abajo.
    if ($table -eq 'barman_productos' -and $hasCategoria) {
        [void]$sb.AppendLine("ALTER TABLE $stg ALTER COLUMN categoria DROP NOT NULL;")
    }
    [void]$sb.AppendLine("\copy $stg("+($cols -join ',')+") FROM '$(Csv-SqlPath $csv)' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');")
}
$pendientesCsv = Join-Path $runDir 'productos_sin_categoria.csv'
if($hasCategoria){
    if ($hasProductoCodigo) {
        [void]$sb.AppendLine("UPDATE stg_pr s SET categoria=m.categoria FROM cat_map m WHERE s.categoria IS NULL AND ((s.producto_codigo IS NOT NULL AND m.producto_codigo::text=s.producto_codigo::text) OR (s.producto_nombre IS NOT NULL AND lower(m.producto_nombre)=lower(s.producto_nombre)));")
    } else {
        [void]$sb.AppendLine("UPDATE stg_pr s SET categoria=m.categoria FROM cat_map m WHERE s.categoria IS NULL AND s.producto_nombre IS NOT NULL AND lower(m.producto_nombre)=lower(s.producto_nombre);")
    }
    # Productos que no hicieron match en cat_map: son nuevos y nadie los ha
    # clasificado nunca. Se exportan ANTES de rellenarlos con el default para
    # poder avisar cuáles faltan por capturar en Supabase.
    [void]$sb.AppendLine("\copy (SELECT DISTINCT producto_codigo, producto_nombre FROM stg_pr WHERE categoria IS NULL ORDER BY producto_nombre) TO '$(Csv-SqlPath $pendientesCsv)' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');")
    # Para no tronar la carga por un producto nuevo, se marca temporalmente
    # como 'Sin clasificar'; el aviso de arriba es lo que permite corregirlo.
    [void]$sb.AppendLine("UPDATE stg_pr SET categoria='Sin clasificar' WHERE categoria IS NULL;")
}
[void]$sb.AppendLine('DELETE FROM public.barman_pagos WHERE venta_id IN (SELECT venta_id FROM stg_v);')
[void]$sb.AppendLine('DELETE FROM public.barman_productos WHERE venta_id IN (SELECT venta_id FROM stg_v);')
[void]$sb.AppendLine('DELETE FROM public.barman_cortesias WHERE venta_id IN (SELECT venta_id FROM stg_v);')
[void]$sb.AppendLine('DELETE FROM public.barman_ventas WHERE venta_id IN (SELECT venta_id FROM stg_v);')
foreach($x in @(@('barman_ventas','stg_v'),@('barman_productos','stg_pr'),@('barman_pagos','stg_pg'),@('barman_cortesias','stg_c'))){
    $table=$x[0];$stg=$x[1];$cols=$common[$table]
    # "categoria" no viene en el CSV de origen (BarMan no la tiene), por lo
    # que Common-Columns nunca la incluye — pero sí quedó rellenada en la
    # tabla temporal vía cat_map/'Sin clasificar'. Hay que agregarla a mano
    # a la lista de columnas del INSERT final o Postgres usa su default
    # (NULL) en la tabla real y truena el NOT NULL.
    $insertCols = $cols
    if ($table -eq 'barman_productos' -and $hasCategoria -and ($insertCols -notcontains 'categoria')) {
        $insertCols = @($insertCols) + 'categoria'
    }
    [void]$sb.AppendLine("INSERT INTO public.$table("+($insertCols -join ',')+") SELECT "+($insertCols -join ',')+" FROM $stg;")
}
$detail="Ventana de $($Cfg.ReviewDays) días; reemplazo completo de VentaID afectados"
[void]$sb.AppendLine("INSERT INTO public.barman_etl_ejecuciones(respaldo_nombre,respaldo_sha256,fecha_respaldo,ventana_desde,ventas_extraidas,productos_extraidos,pagos_extraidos,cortesias_extraidas,max_venta_id,estado,detalle) VALUES ("+(Quote-SqlLiteral $backupName)+","+(Quote-SqlLiteral $hash)+","+(Quote-SqlLiteral $backupMtime)+","+(Quote-SqlLiteral $startDate.ToString('yyyy-MM-dd'))+",$($ventas.Count),$($productos.Count),$($pagos.Count),$($dtCortesias.Rows.Count),$maxVenta,'ok',"+(Quote-SqlLiteral $detail)+");")
[void]$sb.AppendLine('COMMIT;')
[IO.File]::WriteAllText($sqlFile,$sb.ToString(),(New-Object Text.UTF8Encoding($false)))

$importArgs=@('-h',$Cfg.SupabaseHost,'-p',[string]$Cfg.SupabasePort,'-U',$Cfg.SupabaseUser,'-d',$Cfg.SupabaseDatabase,'-v','ON_ERROR_STOP=1','-f',$sqlFile)
Invoke-Psql $importArgs | Out-Host
Write-Ok 'Supabase actualizado en una sola transacción'

if ($hasCategoria -and (Test-Path $pendientesCsv)) {
    $pendientes = @(Import-Csv $pendientesCsv)
    if ($pendientes.Count -gt 0) {
        $nombres = ($pendientes | Select-Object -First 8 -ExpandProperty producto_nombre) -join ', '
        if ($pendientes.Count -gt 8) { $nombres += " y $($pendientes.Count - 8) más" }
        # Línea con marcador fijo: Worker-Barman.ps1 la detecta y la agrega
        # al mensaje que se ve en /reportes/actualizar-barman.
        Write-Host "PRODUCTOS_PENDIENTES_CATEGORIA: $($pendientes.Count)|$nombres"
    }
}

Write-Step 'Resumen'
Write-Host "Respaldo:          $backupName"
Write-Host "SHA256:            $hash"
Write-Host "Ventana revisada:  $($startDate.ToString('yyyy-MM-dd')) en adelante"
Write-Host "Ventas:            $($ventas.Count)"
Write-Host "Productos:         $($productos.Count)"
Write-Host "Pagos:             $($pagos.Count)"
Write-Host "Cortesías:         $($dtCortesias.Rows.Count)"
Write-Host "VentaID máximo:    $maxVenta"
Write-Host "Carpeta evidencia: $runDir"
