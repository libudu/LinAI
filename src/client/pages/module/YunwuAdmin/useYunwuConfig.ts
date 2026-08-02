import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 云雾管理配置（系统令牌 / 用户 ID），独立于全局 store，持久化在 localStorage
interface YunwuConfigState {
  yunwuSystemToken?: string
  yunwuUserId?: string
  setYunwuSystemToken: (token: string) => void
  setYunwuUserId: (userId: string) => void
}

export const useYunwuConfig = create<YunwuConfigState>()(
  persist(
    (set) => ({
      yunwuSystemToken: undefined,
      yunwuUserId: undefined,
      setYunwuSystemToken: (token) => set({ yunwuSystemToken: token }),
      setYunwuUserId: (userId) => set({ yunwuUserId: userId }),
    }),
    {
      name: 'yunwu-config',
    },
  ),
)
