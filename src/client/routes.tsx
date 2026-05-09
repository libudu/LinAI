import { Home } from './pages/common/Home'
import { GeminiTTS } from './pages/module/GeminiTTS'

export const appRoutes = [
  {
    path: '/',
    label: '首页',
    element: <Home />,
    key: 'home',
  },
  {
    path: '/gemini-tts',
    label: 'Gemini-TTS',
    element: <GeminiTTS />,
    key: 'gemini-tts',
  },
]
