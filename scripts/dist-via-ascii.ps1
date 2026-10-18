# 项目路径含中文时，electron-builder 的 app-builder.exe 会报
# ERR_ELECTRON_BUILDER_CANNOT_EXECUTE（Go 程序处理不了非 ASCII 路径）。
# 因此把项目同步到纯 ASCII 路径 C:\wu-ai-rel 构建，完成后把安装包拷回项目 release/。
# 日常打包用：npm run dist:safe
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
$dst = 'C:\wu-ai-rel'

robocopy $src $dst /E /XD node_modules release out .zcode /XF dev.log dist.log /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy 源同步失败: $LASTEXITCODE" }
robocopy "$src\node_modules" "$dst\node_modules" /E /MT:16 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy node_modules 失败: $LASTEXITCODE" }

Push-Location $dst
npm run dist
$build = $LASTEXITCODE
Pop-Location
if ($build -ne 0) { throw "npm run dist 失败" }

if (-not (Test-Path "$src\release")) { New-Item -ItemType Directory -Path "$src\release" | Out-Null }
Copy-Item "$dst\release\*.exe", "$dst\release\*.blockmap" "$src\release\" -Force
Write-Host "完成：安装包已拷回 $src\release\"
