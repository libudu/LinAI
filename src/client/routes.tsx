import { Home } from './pages/common/Home'
import { ImageEdit } from './pages/module/ImageEdit'
import { MediaClassifier } from './pages/module/MediaClassifier'
import { TTS } from './pages/module/GeminiTTS'

export const appRoutes = [
  {
    path: '/',
    label: '首页',
    element: <Home />,
    key: 'home',
  },
  {
    path: '/image-edit',
    label: '图片编辑',
    element: <ImageEdit />,
    key: 'image-edit',
  },
  {
    path: '/tts',
    label: '语音合成',
    element: <TTS />,
    key: 'tts',
  },
  {
    path: '/media-classifier',
    label: '图片整理',
    element: <MediaClassifier />,
    key: 'media-classifier',
  },
]
