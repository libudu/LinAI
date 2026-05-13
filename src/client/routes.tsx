import { Home } from './pages/common/Home'
import { TTS } from './pages/module/GeminiTTS'

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
]
