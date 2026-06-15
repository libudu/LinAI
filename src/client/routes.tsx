import { Home } from './pages/common/Home'
import GraphEditor from './pages/module/GraphEditor'
import { TTS } from './pages/module/GeminiTTS'
import { MediaClassifier } from './pages/module/MediaClassifier'

export const appRoutes = [
  {
    path: '/',
    label: '首页',
    element: <Home />,
    key: 'home',
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
  {
    path: '/graph',
    label: '画板',
    element: <GraphEditor />,
    key: 'graph',
  },
]
