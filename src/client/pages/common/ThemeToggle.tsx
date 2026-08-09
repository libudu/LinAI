import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useAppTheme } from '../../theme'

// 明暗主题切换按钮：无样式，样式由使用处（侧栏底部圆角按钮）提供
export function ThemeToggle() {
  const { mode, toggleTheme } = useAppTheme()
  const isDark = mode === 'dark'

  return (
    <span
      role="button"
      aria-pressed={isDark}
      className="flex h-full w-full items-center justify-center"
      onClick={toggleTheme}
      title={isDark ? '切换到亮色主题' : '切换到暗色主题'}
    >
      {isDark ? (
        <SunOutlined className="text-lg" />
      ) : (
        <MoonOutlined className="text-lg" />
      )}
    </span>
  )
}
