import { CheckOutlined } from '@ant-design/icons'
import { Button, ColorPicker, Segmented } from 'antd'
import {
  DEFAULT_ACCENT_COLOR,
  useAppTheme,
  type ThemeMode,
} from '../../../theme'
import { openCommonSettingModal } from './SettingModal'

// 预设主题色
const ACCENT_PRESETS = [
  { name: '主橘', color: '#EC883A' },
  { name: '霁云蓝', color: '#5B8DEF' },
  { name: '流霞紫', color: '#9B6DD6' },
  { name: '朱砂红', color: '#D94F3D' },
  { name: '松石绿', color: '#2EA88A' },
  { name: '天青', color: '#4AA8C0' },
]

// 界面设置面板：明暗模式 + 自定义主题色，改动即时生效
function InterfaceSettingPanel() {
  const { mode, toggleTheme, accentColor, setAccentColor, resetAccentColor } =
    useAppTheme()

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-medium">明暗模式</div>
        <Segmented<ThemeMode>
          value={mode}
          options={[
            { label: '亮色', value: 'light' },
            { label: '暗色', value: 'dark' },
          ]}
          onChange={(value) => {
            if (value !== mode) toggleTheme()
          }}
        />
      </div>

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

/** 全局设置弹窗：目前仅"界面设置"一个页签 */
export function openInterfaceSettingModal() {
  openCommonSettingModal({
    title: '设置',
    tabs: [
      {
        key: 'interface',
        label: '界面设置',
        children: <InterfaceSettingPanel />,
        // 改动即时生效，无需保存按钮
        hideFooter: true,
      },
    ],
  })
}
