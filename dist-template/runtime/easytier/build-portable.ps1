# 仅用于重建独立的上游 EasyTier；不会构建或安装 LinAI。
param(
  [Parameter(Mandatory = $true)][string]$SourceDirectory,
  [Parameter(Mandatory = $true)][string]$RustDirectory,
  [Parameter(Mandatory = $true)][string]$GccDirectory,
  [Parameter(Mandatory = $true)][string]$ProtocDirectory
)
$ErrorActionPreference = 'Stop'
$env:CARGO_HOME = Join-Path $RustDirectory 'cargo'
$env:RUSTUP_HOME = Join-Path $RustDirectory 'rustup'
$env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + (Join-Path $GccDirectory 'bin') + ';' + (Join-Path $ProtocDirectory 'bin') + ';' + $env:PATH
$env:PROTOC = Join-Path $ProtocDirectory 'bin/protoc.exe'
$env:PROTOC_INCLUDE = Join-Path $ProtocDirectory 'include'
$env:CC = 'gcc'
$env:AR = 'ar'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'gcc'
$env:CARGO_PROFILE_RELEASE_LTO = 'false'
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '8'
# 源码解压在另一个 Git 项目内时，不把外层项目版本嵌入独立核心。
$env:GIT_CEILING_DIRECTORIES = Split-Path -Parent ([IO.Path]::GetFullPath($SourceDirectory))
# w64devkit 不提供 Rust GNU 标准库所用的 libgcc_eh；使用同一 Rust 工具链附带的版本。
$unwindDirectory = Join-Path $SourceDirectory 'portable-unwind'
New-Item -ItemType Directory -Force $unwindDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $env:RUSTUP_HOME 'toolchains/1.95.0-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained/libgcc_eh.a') -Destination $unwindDirectory
$env:LIBRARY_PATH = $unwindDirectory
Push-Location -LiteralPath $SourceDirectory
try {
  & (Join-Path $env:CARGO_HOME 'bin/cargo.exe') +1.95.0-x86_64-pc-windows-gnu build --release --locked --no-default-features --features cli,smoltcp,socks5,tcp-hole-punch,aes-gcm,endpoint-discovery --package easytier --bin easytier-core --bin easytier-cli --target x86_64-pc-windows-gnu
  if ($LASTEXITCODE -ne 0) { throw 'EasyTier 编译失败' }
} finally { Pop-Location }
