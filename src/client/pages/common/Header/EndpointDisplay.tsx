import { ApiOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useMemo } from 'react'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../SettingModal'
import { ENDPOINT_PRESETS } from '../SettingModal/Endpoint/endpointPresets'

// 当前接入点展示：优先匹配预设，其次自定义接入点标题，否则回退到模型 ID
export function EndpointDisplay() {
  const { gptImageBaseUrl, gptImageModelId, gptImageCustomEndpoints } =
    useGlobalStore()

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

  return (
    <Tooltip title="点击切换接入点" placement="bottom">
      <div
        className="hidden cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-gray-500 transition-colors hover:border-slate-300 hover:bg-slate-100 sm:flex"
        onClick={() => openSettingModal({ initialTab: 'endpoint' })}
      >
        <ApiOutlined className="shrink-0 text-xs" />
        <span className="truncate font-medium text-gray-700">
          {currentEndpointName}
        </span>
      </div>
    </Tooltip>
  )
}
