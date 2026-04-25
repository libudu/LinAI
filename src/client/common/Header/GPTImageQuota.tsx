import { useGlobalStore } from '../../store/global'
import { useGPTImageQuota } from '../../hooks/useGPTImageQuota'
import { Tooltip } from 'antd'

export function GPTImageQuota() {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { quota, loading, error } = useGPTImageQuota()

  if (!gptImageApiKey) {
    return null
  }

  return (
    <div className="text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
      {loading ? (
        <span>正在获取余额...</span>
      ) : error ? (
        <Tooltip title={error}>
          <span className="text-red-500 line-clamp-1 max-w-50">
            GPT IMAGE 余额: {error}
          </span>
        </Tooltip>
      ) : quota ? (
        <span>
          GPT IMAGE 余额：
          <span className="font-semibold text-slate-800">
            {quota.unlimited_quota
              ? '不限'
              : (quota.total_available * 0.000001).toFixed(2)}
          </span>
        </span>
      ) : (
        <span className="text-red-500">获取 GPT IMAGE 余额失败</span>
      )}
    </div>
  )
}
