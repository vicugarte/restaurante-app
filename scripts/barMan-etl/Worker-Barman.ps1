[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$EnvFile = Join-Path $ProjectRoot ".env.local"
$Processor = Join-Path $PSScriptRoot "Procesar-BarmanIncremental.ps1"
$ConfigPath = Join-Path $PSScriptRoot "config.json"
$WorkerRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "REPORTE FINANCIERO\barman_worker"
$Inbox = Join-Path $WorkerRoot "inbox"
$Logs = Join-Path $WorkerRoot "logs"

New-Item -ItemType Directory -Force -Path $Inbox, $Logs | Out-Null

function Write-Log([string]$Text) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Text"
    Write-Host $line
    Add-Content -Path (Join-Path $Logs "worker_$(Get-Date -Format 'yyyy-MM-dd').log") -Value $line -Encoding UTF8
}

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) { throw "No existe $Path" }
    foreach ($line in Get-Content $Path) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith("#") -or $t -notmatch "=") { continue }
        $parts = $t.Split("=", 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Require-Env([string]$Name) {
    $v = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($v)) {
        throw "Falta la variable $Name en .env.local"
    }
    return $v
}

function Get-Headers {
    return @{
        "apikey" = $script:ServiceKey
        "Authorization" = "Bearer $($script:ServiceKey)"
        "Content-Type" = "application/json"
    }
}

function Escape-StoragePath([string]$Path) {
    return (($Path -split "/") | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/"
}

function Update-Importacion([string]$Id, [hashtable]$Values) {
    $Values["actualizado_en"] = (Get-Date).ToUniversalTime().ToString("o")
    $json = $Values | ConvertTo-Json -Compress
    $uri = "$($script:SupabaseUrl)/rest/v1/barman_importaciones?id=eq.$Id"
    Invoke-RestMethod -Method Patch -Uri $uri -Headers (Get-Headers) -Body $json | Out-Null
}

Import-DotEnv $EnvFile

$script:SupabaseUrl = (Require-Env "NEXT_PUBLIC_SUPABASE_URL").TrimEnd("/")
$script:ServiceKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"
$DbPassword = Require-Env "SUPABASE_DB_PASSWORD"

if (-not (Test-Path $Processor)) { throw "No existe $Processor" }
if (-not (Test-Path $ConfigPath)) { throw "No existe $ConfigPath. Crea config.json a partir de config.example.json." }

# Evita que el ETL pida contraseña de forma interactiva.
$env:PGPASSWORD = $DbPassword

try {
    Write-Log "Buscando respaldos BarMan pendientes."
    $query = "$($script:SupabaseUrl)/rest/v1/barman_importaciones?estado=eq.pendiente&order=creado_en.asc&limit=1&select=*"
    $response = Invoke-RestMethod -Method Get -Uri $query -Headers (Get-Headers)
    $pending = @(
        $response | Where-Object {
            $_ -ne $null -and $_.PSObject.Properties.Name -contains 'id'
        }
    )

    if ($pending.Count -eq 0) {
        Write-Log "No hay respaldos pendientes."
        exit 0
    }

    $job = $pending[0]
    $id = [string]$job.id
    $archivo = [string]$job.archivo
    $storagePath = [string]$job.storage_path
    $safeName = [IO.Path]::GetFileName($archivo)
    if (-not $safeName.ToLowerInvariant().EndsWith(".bm2")) {
        throw "El registro pendiente no corresponde a un archivo .bm2: $archivo"
    }

    Update-Importacion $id @{
        estado = "descargando"
        mensaje = "Windows detectó la carga. Descargando respaldo para procesarlo."
        inicio_proceso = (Get-Date).ToUniversalTime().ToString("o")
    }

    $localDir = Join-Path $Inbox $id
    New-Item -ItemType Directory -Force -Path $localDir | Out-Null
    $localFile = Join-Path $localDir $safeName

    $encodedPath = Escape-StoragePath $storagePath
    $downloadUri = "$($script:SupabaseUrl)/storage/v1/object/barman-respaldos/$encodedPath"
    Write-Log "Descargando $archivo."
    Invoke-WebRequest -Method Get -Uri $downloadUri -Headers @{
        "apikey" = $script:ServiceKey
        "Authorization" = "Bearer $($script:ServiceKey)"
    } -OutFile $localFile

    $hash = (Get-FileHash -Path $localFile -Algorithm SHA256).Hash.ToLowerInvariant()

    Update-Importacion $id @{
        estado = "restaurando"
        mensaje = "Respaldo descargado. Preparando y restaurando la base temporal de BarMan."
        hash_archivo = $hash
    }

    Write-Log "Ejecutando ETL incremental para $archivo."
    $etlLog = Join-Path $Logs "etl_${id}_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
    $ultimoEstado = "restaurando"

    & $Processor -BackupPath $localFile -ConfigPath $ConfigPath 2>&1 | ForEach-Object {
        $line = [string]$_
        Add-Content -Path $etlLog -Value $line -Encoding UTF8
        Write-Host $line

        $nuevoEstado = $null
        $nuevoMensaje = $null

        if ($line -match 'Restaurando base temporal') {
            $nuevoEstado = 'restaurando'
            $nuevoMensaje = 'Restaurando la base temporal de BarMan en SQL Server.'
        }
        elseif ($line -match 'Extrayendo ventana desde SQL Server' -or $line -match 'Calculando ventana incremental') {
            $nuevoEstado = 'procesando'
            $nuevoMensaje = 'Base restaurada. Extrayendo ventas, productos, pagos y cortesías.'
        }
        elseif ($line -match 'Validando consistencia') {
            $nuevoEstado = 'validando'
            $nuevoMensaje = 'Validando ventas, pagos, propinas y relaciones de productos.'
        }
        elseif ($line -match 'Preparando reemplazo transaccional en Supabase') {
            $nuevoEstado = 'importando'
            $nuevoMensaje = 'Validación correcta. Actualizando la información en Supabase.'
        }

        if ($nuevoEstado -and $nuevoEstado -ne $ultimoEstado) {
            Update-Importacion $id @{ estado = $nuevoEstado; mensaje = $nuevoMensaje }
            $ultimoEstado = $nuevoEstado
            Write-Log "Estado actualizado: $nuevoEstado"
        }
    }

    # Recupera las cifras que el ETL guardó en su bitácora.
    $etlUri = "$($script:SupabaseUrl)/rest/v1/barman_etl_ejecuciones?respaldo_sha256=eq.$hash&estado=eq.ok&order=creado_en.desc&limit=1&select=ventas_extraidas,productos_extraidos,pagos_extraidos"
    $etlRows = @(Invoke-RestMethod -Method Get -Uri $etlUri -Headers (Get-Headers))
    $ventas = 0; $productos = 0; $pagos = 0
    if ($etlRows.Count -gt 0) {
        $ventas = [int]$etlRows[0].ventas_extraidas
        $productos = [int]$etlRows[0].productos_extraidos
        $pagos = [int]$etlRows[0].pagos_extraidos
    }

    Update-Importacion $id @{
        estado = "completado"
        mensaje = "Respaldo procesado correctamente. Los reportes ya usan la información actualizada."
        fin_proceso = (Get-Date).ToUniversalTime().ToString("o")
        ventas_procesadas = $ventas
        productos_procesados = $productos
        pagos_procesados = $pagos
    }

    Write-Log "COMPLETADO: $archivo. Ventas=$ventas Productos=$productos Pagos=$pagos."
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log "ERROR: $msg"

    if (Get-Variable id -ErrorAction SilentlyContinue) {
        try {
            Update-Importacion $id @{
                estado = "error"
                mensaje = ($msg.Substring(0, [Math]::Min(900, $msg.Length)))
                fin_proceso = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Log "No fue posible actualizar el estado de error en Supabase: $($_.Exception.Message)"
        }
    }
    exit 1
}
