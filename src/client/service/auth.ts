import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { create } from 'zustand'
import { rpcData } from './http'

const authRpc = hc<AppType>('/').api.auth
const fetchStatus = () => rpcData(authRpc.status.$get())
type LoginStatus = Awaited<ReturnType<typeof fetchStatus>>

export const useLoginAccess = create<{
  status: LoginStatus | null
  fetchStatus: () => Promise<LoginStatus>
}>()((set) => ({
  status: null,
  fetchStatus: async () => {
    const status = await fetchStatus()
    set({ status })
    return status
  },
}))

let redirecting = false
export function redirectToLogin() {
  if (redirecting) return
  redirecting = true
  location.replace(
    `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`,
  )
}

/** 覆盖 RPC / 原生 fetch 的登录失效响应，不干扰第三方接口的 401。 */
export function installLoginRedirect() {
  const request = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const response = await request(input, init)
    if (
      response.status === 401 &&
      response.headers.get('X-LinAI-Auth') === 'required'
    ) {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      )
      if (url.origin === location.origin) redirectToLogin()
    }
    return response
  }
}
