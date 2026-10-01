export async function createYunwuToken(input: {
  systemToken: string
  userId: string
  name: string
  quota: number
  group: string
}) {
  const { systemToken, userId, name, quota, group } = input
  const response = await fetch('https://yunwu.ai/api/token/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'new-api-user': userId,
      Authorization: systemToken,
    },
    body: JSON.stringify({
      remain_quota: quota * 1000000,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: '',
      group,
      mj_image_mode: 'default',
      mj_custom_proxy: '',
      selected_groups: [],
      name,
      allow_ips: '',
    }),
  })
  const data = (await response.json()) as {
    success?: boolean
    data: string
    message?: string
  }
  if (!response.ok)
    return {
      success: false as const,
      data: null,
      message: data.message || `云雾请求失败（HTTP ${response.status}）`,
    }
  return data
}
