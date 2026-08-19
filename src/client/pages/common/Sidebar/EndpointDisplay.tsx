import { Tooltip } from 'antd'
import { useMemo } from 'react'
import { useGPTImageQuota } from '../GenImage/hooks/useGPTImageQuota'
import { openGPTImageSettingModal } from '../GenImage/SettingModal'
import { ENDPOINT_PRESETS } from '../GenImage/SettingModal/Endpoint/endpointPresets'
import { useGptImageStore } from '../GenImage/store'

// 当前接入点展示：优先匹配预设，其次自定义接入点标题，否则回退到模型 ID
export function EndpointDisplay() {
  const {
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImageApiKey,
  } = useGptImageStore()
  const { quota, loading, error } = useGPTImageQuota()

  const currentEndpointName = useMemo(() => {
    const preset = ENDPOINT_PRESETS.find(
      (p) => p.baseUrl === gptImageBaseUrl && p.modelId === gptImageModelId,
    )
    if (preset) return preset.label
    const custom = gptImageCustomEndpoints.find(
      (c) => c.baseUrl === gptImageBaseUrl && c.modelId === gptImageModelId,
    )
    if (custom) return custom.title
    return gptImageModelId || gptImageBaseUrl || '未配置'
  }, [gptImageBaseUrl, gptImageModelId, gptImageCustomEndpoints])

  // 当前接入点的积分比例与货币单位：仅预设可配置，自定义接入点与未匹配时按默认处理
  const { creditRatio, currency } = useMemo(() => {
    const preset = ENDPOINT_PRESETS.find(
      (p) => p.baseUrl === gptImageBaseUrl && p.modelId === gptImageModelId,
    )
    return {
      creditRatio: preset?.creditRatio ?? 1,
      currency: preset?.currency ?? '￥',
    }
  }, [gptImageBaseUrl, gptImageModelId])

  return (
    <Tooltip title={error || '点击切换接入点'} placement="bottom">
      <div
        className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-slate-300 hover:bg-slate-100"
        onClick={() =>
          openGPTImageSettingModal({
            initialTab: 'endpoint',
            initialOnly: true,
          })
        }
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-gray-700">
            {currentEndpointName}
          </span>
        </div>
        {gptImageApiKey && (loading || error || quota) && (
          <div className="truncate">
            {loading ? (
              <span>
                余额：<span className="text-gray-400">查询中...</span>
              </span>
            ) : error ? (
              <span className="text-red-500">余额: {error}</span>
            ) : quota ? (
              <span>
                余额：
                <span className="font-semibold text-gray-700">
                  {quota.unlimited_quota
                    ? '不限'
                    : (
                        (quota.total_available * 0.000002) /
                        creditRatio
                      ).toFixed(2)}
                  {currency}
                </span>
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Tooltip>
  )
}
