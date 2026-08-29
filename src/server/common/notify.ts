import { exec } from 'child_process'

/**
 * 发送 Windows 原生 Toast 桌面通知
 * 仅在 Windows 平台（win32）执行，非 Windows 平台静默忽略
 */
export function sendWindowsNotification(title: string, body: string): void {
  if (process.platform !== 'win32') {
    return
  }

  // XML 特殊字符转义
  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const safeTitle = escapeXml(title)
  const safeBody = escapeXml(body)

  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = @'
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${safeTitle}</text>
      <text>${safeBody}</text>
    </binding>
  </visual>
</toast>
'@
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`.trim()

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
  exec(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encoded}`,
    (error) => {
      if (error) {
        console.error('[Notify] 发送 Windows 通知失败:', error.message)
      }
    },
  )
}
