export interface ApiKeySearchResult {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  used_quota: number
  group: string
  mj_image_mode: string
  mj_custom_proxy: string
  routing_priority: string
  DeletedAt: null
  total: number
}

export interface GenerateApiKeyResponse {
  success?: boolean
  data?: string
  message?: string
}
