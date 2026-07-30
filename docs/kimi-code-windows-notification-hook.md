# 给 Kimi Code 添加 Windows 运行结束通知（Hook）

每轮对话运行结束后，自动弹出一个 Windows Toast 桌面通知。

## 原理

Kimi Code CLI 支持在 `~/.kimi-code/config.toml` 中通过 `[[hooks]]` 声明生命周期钩子。其中 `Stop` 事件在模型即将结束当前轮次时触发，hook 命令由本地 shell 执行，超时失败不会中断主流程（fail open）。

## 步骤

### 1. 编写 PowerShell 通知脚本

新建 `C:\Users\<用户名>\.kimi-code\hooks\notify-stop.ps1`：

```powershell
# Kimi Code Stop hook：每轮运行结束后弹出 Windows Toast 通知
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

$xml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>Kimi Code</text>
      <text>本轮运行已完成</text>
    </binding>
  </visual>
</toast>
"@

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
```

> 注意：脚本含中文时必须保存为 **带 BOM 的 UTF-8**，否则 Windows PowerShell 5.1 会按 ANSI 读取导致中文乱码、`LoadXml` 抛 `HRESULT:0xC00CE56D` 异常。可以用以下命令补 BOM：
>
> ```bash
> printf '\xef\xbb\xbf' > tmp.ps1 && cat notify-stop.ps1 >> tmp.ps1 && mv tmp.ps1 notify-stop.ps1
> ```

### 2. 在 config.toml 中注册 hook

编辑 `C:\Users\<用户名>\.kimi-code\config.toml`，在顶层（`default_model` 之后、其他 `[table]` 之前）加入：

```toml
[[hooks]]
event = "Stop"
command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\<用户名>\.kimi-code\hooks\notify-stop.ps1"'
timeout = 10
```

字段说明：

- `event`：`Stop`，模型每轮结束时触发
- `command`：shell 命令；用 TOML 单引号字面量字符串，避免 Windows 路径反斜杠转义问题
- `timeout`：秒，1–600，超时自动放行

### 3. 校验并生效

```bash
kimi doctor config ~/.kimi-code/config.toml
```

校验通过后，在 TUI 空闲时运行 `/reload`，或重开一个 session 自动生效。

### 4. 手动测试脚本（可选）

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\<用户名>\.kimi-code\hooks\notify-stop.ps1"
```

无报错且弹出通知即正常。

## 自定义

- 修改 `.ps1` 中 `<text>` 内容即可改通知标题/正文
- 想要声音，可在 `<toast>` 标签内加 `<audio src="ms-winsoundevent:Notification.Default" />`

## 备选方案：内置通知

如果不需要自定义内容，Kimi Code 自带桌面通知，无需 hook。编辑 `~/.kimi-code/tui.toml`：

```toml
[notifications]
enabled = true
notification_condition = "always"   # 默认 "unfocused"，仅终端失焦时通知
```

改完后 `/reload-tui` 生效。

## 其他可用 hook 事件

| 事件 | 触发时机 |
| --- | --- |
| `UserPromptSubmit` | 用户提交消息时 |
| `PreToolUse` / `PostToolUse` | 工具调用前/后 |
| `Stop` | 模型即将结束当前轮次 |
| `StopFailure` | 当前轮次出错（非取消） |
| `SessionStart` / `SessionEnd` | 会话开始/结束 |
| `SubagentStart` / `SubagentStop` | 子代理开始/成功结束 |
| `PreCompact` / `PostCompact` | 上下文压缩前/后 |
| `Notification` | 后台任务结果写入上下文时 |

参考：<https://moonshotai.github.io/kimi-code/en/customization/hooks.html>
