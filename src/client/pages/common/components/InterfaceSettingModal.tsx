import { CheckOutlined } from '@ant-design/icons'
import { Button, ColorPicker, Modal } from 'antd'
import { createRoot } from 'react-dom/client'
import {
  AppThemeProvider,
  DEFAULT_ACCENT_COLOR,
  useAppTheme,
} from '../../../theme'

// 预设主题色
const ACCENT_PRESETS = [
  { name: '主橘', color: '#EC883A' },
  { name: '霁云蓝', color: '#5B8DEF' },
  { name: '流霞紫', color: '#9B6DD6' },
  { name: '朱砂红', color: '#D94F3D' },
  { name: '松石绿', color: '#2EA88A' },
  { name: '天青', color: '#4AA8C0' },
]

function InterfaceSettingContent() {
  const { accentColor, setAccentColor, resetAccentColor } = useAppTheme()

  return (
    <div className="space-y-5 pt-2">
      <div>
        <div className="mb-2 text-sm font-medium">预设主题色</div>
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((preset) => {
            const active =
              accentColor.toLowerCase() === preset.color.toLowerCase()
            return (
              <div
                key={preset.color}
                className="flex cursor-pointer flex-col items-center gap-1"
                title={preset.name}
                onClick={() => setAccentColor(preset.color)}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: preset.color }}
                >
                  {active && <CheckOutlined style={{ color: '#fff' }} />}
                </div>
                <span className="text-xs opacity-70">{preset.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">自定义颜色</div>
        <ColorPicker
          value={accentColor}
          onChange={(color) => setAccentColor(color.toHexString())}
          showText
        />
      </div>

      <div className="text-xs opacity-60">
        主题色作用于导航选中、主按钮、选中态等全局强调位置；过浅或过深的颜色会自动调整以保证可读性。
      </div>

      <Button onClick={resetAccentColor}>
        恢复默认（{DEFAULT_ACCENT_COLOR}）
      </Button>
    </div>
  )
}

/** 界面设置弹窗：自定义主题色，改动即时生效，无需保存 */
export function openInterfaceSettingModal() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  function destroy() {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  root.render(
    // 独立 createRoot 树不在 App 的 Provider 下，需要再包一层；
    // 多个 AppThemeProvider 实例之间通过 app-theme-change 事件同步
    <AppThemeProvider>
      <Modal
        title="界面设置"
        open={true}
        onCancel={destroy}
        footer={null}
        destroyOnHidden
        width={480}
      >
        <InterfaceSettingContent />
      </Modal>
    </AppThemeProvider>,
  )
}
