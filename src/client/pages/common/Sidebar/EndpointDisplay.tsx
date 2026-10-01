import { Tooltip } from 'antd'

import { useGPTImageQuota } from '../GenImage/hooks/useGPTImageQuota'
import { openGPTImageSettingModal } from '../GenImage/SettingModal'

import { useGptImageStore } from '../GenImage/store'

// 展示与请求共用按 ID 解析的接入点，避免重复按地址反推。
export function EndpointDisplay() {
  const endpoint = useGptImageStore((state) => state.currentEndpoint)
  const capabilities = useGptImageStore((state) => state.capabilities)
  const { quota, loading, error } = useGPTImageQuota()
  const currentEndpointName = endpoint?.title || '未配置'
  const isComfy = endpoint?.protocol === 'comfyui'
  const gptImageApiKey =
    endpoint && endpoint.protocol !== 'comfyui' ? endpoint.apiKey : null
  const creditRatio =
    endpoint && endpoint.protocol !== 'comfyui'
      ? (endpoint.creditRatio ?? 1)
      : 1
  const currency =
    endpoint && endpoint.protocol !== 'comfyui'
      ? (endpoint.currency ?? '￥')
      : '￥'
  return (
    <Tooltip
      title={isComfy ? '点击切换接入点' : error || '点击切换接入点'}
      placement="bottom"
    >
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
        {isComfy && (
          <div className="truncate">
            本地工作流：
            {endpoint?.protocol === 'comfyui'
              ? endpoint.workflowName
              : '未导入'}
          </div>
        )}
        {capabilities.quota &&
          gptImageApiKey &&
          (loading || error || quota) && (
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
