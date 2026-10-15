$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'electron-vite' }
foreach ($p in $procs) {
    Write-Output ("killing node " + $p.ProcessId)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
$left = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'electron-vite' }
Write-Output ("remaining dev servers: " + @($left).Count)
$ele = Get-Process electron -ErrorAction SilentlyContinue
Write-Output ("remaining electron: " + @($ele).Count)
