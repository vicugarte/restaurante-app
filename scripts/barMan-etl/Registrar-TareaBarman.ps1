[CmdletBinding()]
param(
    [string]$TaskName = "BarMan - Procesar respaldos pendientes",
    [int]$CadaMinutos = 5
)

$ErrorActionPreference = "Stop"

$worker = Join-Path $PSScriptRoot "Worker-Barman.ps1"
if (-not (Test-Path $worker)) {
    throw "No existe $worker"
}

$pwsh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$action = New-ScheduledTaskAction `
    -Execute $pwsh `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$worker`""

# Revisa periódicamente. El cliente puede subir únicamente los lunes;
# el resto de los días el worker sólo comprueba que no haya pendientes y termina.
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $CadaMinutos) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

Write-Host ""
Write-Host "Tarea creada correctamente:" -ForegroundColor Green
Write-Host "  $TaskName"
Write-Host "Frecuencia: cada $CadaMinutos minutos."
Write-Host ""
Write-Host "La tarea se ejecutará mientras este usuario tenga una sesión iniciada en Windows."
Write-Host "Puedes probarla con:"
Write-Host "Start-ScheduledTask -TaskName `"$TaskName`""
