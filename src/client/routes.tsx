import {
  AudioOutlined,
  FolderOpenOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import { Home } from './pages/common/Home'
import { TTS } from './pages/module/GeminiTTS'
import { MediaClassifier } from './pages/module/MediaClassifier'

export const appRoutes = [
  {
    path: '/',
    label: '生成图片',
    element: <Home />,
    key: 'home',
    icon: <PictureOutlined />,
  },
  {
    path: '/tts',
    label: '语音合成',
    element: <TTS />,
    key: 'tts',
    icon: <AudioOutlined />,
  },
  {
    path: '/media-classifier',
    label: '图片整理',
    element: <MediaClassifier />,
    key: 'media-classifier',
    icon: <FolderOpenOutlined />,
  },
]
