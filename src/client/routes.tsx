import {
  AudioOutlined,
  BookOutlined,
  FolderOpenOutlined,
  HighlightOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { Home } from './pages/common/Home'
import { TTS } from './pages/module/GeminiTTS'
import { MediaClassifier } from './pages/module/MediaClassifier'

export interface AppRoute {
  path: string
  label: string
  key: string
  icon: ReactNode
  element?: ReactNode
  /** 隐藏导航入口但保留路由 */
  hidden?: boolean
  /** 置灰展示（开发中），不注册路由 */
  disabled?: boolean
}

export const appRoutes: AppRoute[] = [
  {
    path: '/',
    label: '生成图片',
    element: <Home />,
    key: 'home',
    icon: <PictureOutlined />,
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
    hidden: true,
  },
  {
    path: '/novel',
    label: '生成小说',
    key: 'novel',
    icon: <BookOutlined />,
    disabled: true,
  },
  {
    path: '/media-classifier',
    label: '图片整理',
    element: <MediaClassifier />,
    key: 'media-classifier',
    icon: <FolderOpenOutlined />,
    hidden: true,
  },
]
