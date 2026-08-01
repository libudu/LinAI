import { ApiOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useMemo } from 'react'
import { useGPTImageQuota } from '../../../hooks/useGPTImageQuota'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../SettingModal'
import { ENDPOINT_PRESETS } from '../SettingModal/Endpoint/endpointPresets'

// 当前接入点展示：优先匹配预设，其次自定义接入点标题，否则回退到模型 ID
// 已填 apikey 时在后面用灰色竖线分隔展示余额
export function EndpointDisplay() {
  const {
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImageApiKey,
  } = useGlobalStore()
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

  // 当前接入点的积分比例：仅预设可配置，自定义接入点与未匹配时按默认 1 处理
  const creditRatio = useMemo(() => {
    const preset = ENDPOINT_PRESETS.find(
      (p) => p.baseUrl === gptImageBaseUrl && p.modelId === gptImageModelId,
    )
    return preset?.creditRatio ?? 1
  }, [gptImageBaseUrl, gptImageModelId])

  return (
    <Tooltip title={error || '点击切换接入点'} placement="bottom">
      <div
        className="hidden cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-gray-500 transition-colors hover:border-slate-300 hover:bg-slate-100 sm:flex"
        onClick={() => openSettingModal({ initialTab: 'endpoint' })}
      >
        <ApiOutlined className="shrink-0 text-xs" />
        <span className="truncate font-medium text-gray-700">
          {currentEndpointName}
        </span>
        {gptImageApiKey && (loading || error || quota) && (
          <>
            <span className="mx-1 h-3.5 w-px shrink-0 bg-gray-300" />
            {loading ? (
              <span className="shrink-0">
                余额：
                <span className="shrink-0 text-gray-400">查询中...</span>
              </span>
            ) : error ? (
              <span className="line-clamp-1 max-w-30 shrink-0 text-red-500">
                余额: {error}
              </span>
            ) : quota ? (
              <span className="shrink-0">
                余额：
                <span className="font-semibold text-gray-700">
                  {quota.unlimited_quota
                    ? '不限'
                    : (
                        (quota.total_available * 0.000002) /
                        creditRatio
                      ).toFixed(2)}
                  ￥
                </span>
              </span>
            ) : null}
          </>
        )}
      </div>
    </Tooltip>
  )
}
