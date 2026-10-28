import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { EagleError } from './errors'
import { validateLibraryDirectory } from './sharing/paths'

const execute = promisify(execFile)
let selecting = false

// 路径通过环境变量传入，不拼接进 PowerShell 脚本；输出用 Base64 保留中文路径。
const pickerScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$owner = New-Object System.Windows.Forms.Form
try {
  $dialog.Description = '选择空文件夹或已有 Eagle 资源库'
  $dialog.ShowNewFolderButton = $true
  if ($dialog.PSObject.Properties['AutoUpgradeEnabled']) {
    $dialog.AutoUpgradeEnabled = $true
    $dialog.UseDescriptionForTitle = $true
  }
  $initialDirectory = $env:LINAI_EAGLE_INITIAL_DIRECTORY
  if ($initialDirectory -and -not (Test-Path -LiteralPath $initialDirectory -PathType Container)) {
    $initialDirectory = [System.IO.Path]::GetDirectoryName($initialDirectory)
  }
  if ($initialDirectory -and (Test-Path -LiteralPath $initialDirectory -PathType Container)) {
    $dialog.SelectedPath = $initialDirectory
  }
  $owner.ShowInTaskbar = $false
  $owner.Opacity = 0
  $owner.TopMost = $true
  $owner.StartPosition = 'CenterScreen'
  $owner.Show()
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)))
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
`

/** 对话框显示在运行 Node 的 Windows 桌面；取消时返回 null，不创建文件。 */
export async function pickLibraryDirectory(
  initialPath?: string,
  signal?: AbortSignal,
) {
  if (process.platform !== 'win32')
    throw new EagleError(
      'DIRECTORY_PICKER_UNAVAILABLE',
      400,
      '原生文件夹选择器仅支持 Windows，请手动输入资源库路径',
    )
  if (selecting)
    throw new EagleError(
      'DIRECTORY_PICKER_BUSY',
      409,
      '已有文件夹选择窗口打开，请先完成选择',
    )
  selecting = true
  try {
    const { stdout } = await execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-WindowStyle',
        'Hidden',
        '-EncodedCommand',
        Buffer.from(pickerScript, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 16 * 1024,
        signal,
        env: {
          ...process.env,
          LINAI_EAGLE_INITIAL_DIRECTORY: initialPath?.trim() || '',
        },
      },
    )
    const encodedPath = stdout.trim()
    if (!encodedPath) return null
    return await validateLibraryDirectory(
      Buffer.from(encodedPath, 'base64').toString('utf8'),
    )
  } catch (error) {
    if (error instanceof EagleError) throw error
    throw new EagleError(
      'DIRECTORY_PICKER_FAILED',
      500,
      '无法打开 Windows 文件夹选择器，请重试或手动输入资源库路径',
    )
  } finally {
    selecting = false
  }
}
