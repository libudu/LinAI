import { GeminiTTS } from './module/GeminiTTS'
import { Home } from './pages/Home'

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
