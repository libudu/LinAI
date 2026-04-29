import { Modal, Switch, Typography } from 'antd'
import { LogViewer } from '../components/LogViewer'

const { Text } = Typography

interface WanModalProps {
  open: boolean
  onClose: () => void
  autoSubmit: boolean
  onToggleAutoSubmit: (checked: boolean) => void
}

export function WanModal({
  open,
  onClose,
  autoSubmit,
  onToggleAutoSubmit,
}: WanModalProps) {
  return (
    <Modal
      title="Wan 视频下载详情"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={800}
    >
      <div className="flex flex-col gap-6 py-4">
        {/* 自动提交开关 */}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-col pr-4">
            <Text strong className="text-sm text-slate-800">
              自动提交任务
            </Text>
            <Text className="mt-1 text-xs text-slate-500">
              开启后将自动轮询并提交新的下载任务
            </Text>
          </div>
          <div>
            <Switch
              checked={autoSubmit}
              onChange={onToggleAutoSubmit}
              className={autoSubmit ? 'bg-indigo-600' : 'bg-slate-300'}
            />
          </div>
        </div>

        {/* 日志查看器 */}
        <div className="border-t border-slate-100 pt-6">
          <LogViewer moduleId="wan" title="Wan 下载器日志" />
        </div>
      </div>
    </Modal>
  )
}
