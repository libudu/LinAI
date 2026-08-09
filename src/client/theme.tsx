import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

// 全局明暗主题 + 自定义强调色：
// - 模式持久化在 localStorage['app_theme']（'dark' | 'light'，缺省亮色）
// - 强调色持久化在 localStorage['app_theme_accent']（hex，缺省默认橘 #EC883A）
// - 模块顶层（React 渲染前）先把主题应用到 <html>，防首屏闪烁
// - 独立 createRoot 的弹窗会挂第二个 AppThemeProvider，靠 app-theme-change 自定义事件与 storage 事件同步

export type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'app_theme'
const ACCENT_STORAGE_KEY = 'app_theme_accent'
const THEME_CHANGE_EVENT = 'app-theme-change'

export const DEFAULT_ACCENT_COLOR = '#EC883A'

// ---------- 颜色工具 ----------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(h, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** 按 weight（0~1，目标色占比）把 base 向 target 混合 */
function mixColors(base: string, target: string, weight: number): string {
  const a = hexToRgb(base)
  const b = hexToRgb(target)
  if (!a || !b) return base
  return rgbToHex(
    a.r + (b.r - a.r) * weight,
    a.g + (b.g - a.g) * weight,
    a.b + (b.b - a.b) * weight,
  )
}

/** WCAG 相对亮度 */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  )
}

/** WCAG 对比度 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 对比度保护：自定义强调色相对底色不足 4.5（WCAG AA）时，
 * 按 1/20 步长向目标色（暗色向白、亮色向黑）最多混合 20 步直到达标
 */
function ensureAccentContrast(hex: string, mode: ThemeMode): string {
  const bg = mode === 'dark' ? '#1a1d24' : '#ffffff'
  const target = mode === 'dark' ? '#ffffff' : '#000000'
  if (contrastRatio(hex, bg) >= 4.5) return hex
  for (let step = 1; step <= 20; step++) {
    const mixed = mixColors(hex, target, step / 20)
    if (contrastRatio(mixed, bg) >= 4.5) return mixed
  }
  return target
}

/** 解析强调色：缺省/非法回退默认橘，自定义色做对比度保护 */
export function resolveAccentColor(
  mode: ThemeMode,
  stored: string | null,
): string {
  if (!stored || !hexToRgb(stored)) return DEFAULT_ACCENT_COLOR
  return ensureAccentContrast(stored, mode)
}

// ---------- antd 双主题配置 ----------

const sharedComponents: ThemeConfig['components'] = {
  Tooltip: {
    maxWidth: 500,
  },
}

const lightAppTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: DEFAULT_ACCENT_COLOR,
    colorInfo: DEFAULT_ACCENT_COLOR,
  },
  components: sharedComponents,
}

const darkAppTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: DEFAULT_ACCENT_COLOR,
    colorInfo: DEFAULT_ACCENT_COLOR,
    colorBgBase: '#0f1115',
    colorBgLayout: '#0f1115',
    colorBgContainer: '#1a1d24',
    colorBgElevated: '#23262f',
    colorBorder: '#2c313b',
    colorBorderSecondary: '#23272f',
    colorText: '#e6e9ef',
    colorTextSecondary: '#b6bcc8',
    colorTextTertiary: '#939aa8',
    colorFillSecondary: '#23272f',
    colorFillTertiary: '#262a33',
  },
  components: sharedComponents,
}

/** 在基础主题上注入解析后的强调色 */
export function getThemeConfig(
  mode: ThemeMode,
  accentColor: string,
): ThemeConfig {
  const base = mode === 'dark' ? darkAppTheme : lightAppTheme
  return {
    ...base,
    token: {
      ...base.token,
      colorPrimary: accentColor,
      colorInfo: accentColor,
    },
  }
}

// ---------- localStorage 读取 ----------

function readStoredTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readStoredAccent(): string | null {
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY)
  } catch {
    return null
  }
}

// ---------- DOM 应用与静态弹层 ----------

/** 把主题应用到 <html>：data-theme 供 CSS 分流，colorScheme 覆盖原生控件/滚动条，--app-accent 供自定义样式 */
function applyDocumentTheme(mode: ThemeMode, accentColor: string) {
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
  root.style.setProperty('--app-accent', accentColor)
}

/** 让 Modal.confirm 等静态方法弹层跟随当前主题 */
function configureStaticTheme(themeConfig: ThemeConfig) {
  ConfigProvider.config({
    theme: themeConfig,
    holderRender: (children) => (
      <ConfigProvider locale={zhCN} theme={themeConfig}>
        {children}
      </ConfigProvider>
    ),
  })
}

// 模块顶层（React 渲染前）先应用一次，防首屏闪烁
const initialMode = readStoredTheme()
const initialAccent = resolveAccentColor(initialMode, readStoredAccent())
applyDocumentTheme(initialMode, initialAccent)
configureStaticTheme(getThemeConfig(initialMode, initialAccent))

// 供 JS 层（如 Progress strokeColor）读取当前解析后的强调色
let currentAccent = initialAccent

export function getAccentColor(): string {
  return currentAccent
}

// ---------- Provider ----------

interface AppThemeContextValue {
  mode: ThemeMode
  /** 解析后的强调色（含对比度保护） */
  accentColor: string
  toggleTheme: () => void
  /** 传入合法 hex 保存为自定义强调色 */
  setAccentColor: (hex: string) => void
  resetAccentColor: () => void
}

const AppThemeContext = createContext<AppThemeContextValue>({
  mode: initialMode,
  accentColor: initialAccent,
  toggleTheme: () => {},
  setAccentColor: () => {},
  resetAccentColor: () => {},
})

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode)
  const [accentColor, setAccentColorState] = useState(initialAccent)

  // 多实例同步：setter 只写 localStorage 并派发事件，所有 Provider 实例统一从存储回读
  useEffect(() => {
    const sync = () => {
      const m = readStoredTheme()
      setMode(m)
      setAccentColorState(resolveAccentColor(m, readStoredAccent()))
    }
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // 状态变化统一落盘、应用到 DOM、重配静态弹层
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      // 隐私模式等存储不可用时忽略
    }
    currentAccent = accentColor
    applyDocumentTheme(mode, accentColor)
    configureStaticTheme(getThemeConfig(mode, accentColor))
  }, [mode, accentColor])

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      accentColor,
      toggleTheme: () => {
        try {
          localStorage.setItem(
            THEME_STORAGE_KEY,
            mode === 'dark' ? 'light' : 'dark',
          )
        } catch {
          // 忽略存储异常
        }
        window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
      },
      setAccentColor: (hex: string) => {
        if (!hexToRgb(hex)) return
        try {
          localStorage.setItem(ACCENT_STORAGE_KEY, hex)
        } catch {
          // 忽略存储异常
        }
        window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
      },
      resetAccentColor: () => {
        try {
          localStorage.removeItem(ACCENT_STORAGE_KEY)
        } catch {
          // 忽略存储异常
        }
        window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
      },
    }),
    [mode, accentColor],
  )

  return (
    <AppThemeContext.Provider value={value}>
      <ConfigProvider locale={zhCN} theme={getThemeConfig(mode, accentColor)}>
        {children}
      </ConfigProvider>
    </AppThemeContext.Provider>
  )
}

export function useAppTheme() {
  return useContext(AppThemeContext)
}
