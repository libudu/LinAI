import { createVisionSettingsStore } from '@/client/service/vision-settings'

// Eagle 使用独立设置资源与密钥，和生图视觉配置只共用同步机制。
export const useEagleVisionConfig = createVisionSettingsStore('eagle-vision')
