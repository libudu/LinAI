import {
  AudioOutlined,
  BookOutlined,
  CloudOutlined,
  FolderOpenOutlined,
  HighlightOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { GenImage } from './pages/common/GenImage'
import { openGPTImageSettingModal } from './pages/common/GenImage/SettingModal'
import { TTS } from './pages/module/GeminiTTS'
import { openTTSSettingModal } from './pages/module/GeminiTTS/SettingModal'
import { MediaClassifier } from './pages/module/MediaClassifier'
import { Novel } from './pages/module/Novel'
import { openNovelSettingModal } from './pages/module/Novel/SettingModal'
import { YunwuAdmin } from './pages/module/YunwuAdmin'

export interface AppRoute {
  path: string
  label: string
  key: string
  icon: ReactNode
  element?: ReactNode
  /** 模块设置入口，存在时导航项右侧显示设置按钮（桌面端 hover 可见，移动端常显） */
  onClickSetting?: () => void
  /** 隐藏导航入口但保留路由 */
  hidden?: boolean
  /** 仅管理员可见（导航入口与路由均不注册） */
  adminOnly?: boolean
  /** 置灰展示（开发中），不注册路由 */
  disabled?: boolean
}

export const appRoutes: AppRoute[] = [
  {
    path: '/',
    label: '图片生成',
    element: <GenImage />,
    key: 'home',
    icon: <PictureOutlined />,
    onClickSetting: () => openGPTImageSettingModal(),
  },
  {
    path: '/image-canvas',
    label: '生图画布',
    key: 'image-canvas',
    icon: <HighlightOutlined />,
    disabled: true,
  },
  {
    path: '/tts',
    label: '语音合成',
    element: <TTS />,
    key: 'tts',
    icon: <AudioOutlined />,
    onClickSetting: () => openTTSSettingModal(),
    hidden: true,
  },
  {
    path: '/novel',
    label: '小说生成',
    element: <Novel />,
    key: 'novel',
    icon: <BookOutlined />,
    onClickSetting: () => openNovelSettingModal(),
    adminOnly: true,
  },
  {
    path: '/media-classifier',
    label: '图片整理',
    element: <MediaClassifier />,
    key: 'media-classifier',
    icon: <FolderOpenOutlined />,
    hidden: true,
  },
  {
    path: '/yunwu-admin',
    label: '云雾用户管理',
    element: <YunwuAdmin />,
    key: 'yunwu-admin',
    icon: <CloudOutlined />,
    adminOnly: true,
  },
]
