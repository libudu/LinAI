import { Modal, Spin } from 'antd'
import { useEffect } from 'react'
import { setEagleLibraryRefreshSuspended } from '../store'
import { StepClassify } from './StepClassify'
import { StepConfirm } from './StepConfirm'
import { StepRunning } from './StepRunning'
import { useOrganizeStatus } from './store'

// 图片整理弹窗：按任务阶段路由到对应步骤
// running/paused → 执行中任务；confirming → 结果确认；done/无任务 → 分类文件夹划定
export function OrganizeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { status, loaded } = useOrganizeStatus()
  const phase = status?.phase

  useEffect(() => {
    setEagleLibraryRefreshSuspended(open && phase !== 'done').catch((error) =>
      console.error('刷新 Eagle 列表失败', error),
    )
  }, [open, phase])

  useEffect(() => {
    return () => {
      void setEagleLibraryRefreshSuspended(false)
    }
  }, [])

  return (
    <Modal
      title="图片整理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      centered
      destroyOnHidden
    >
      {!loaded ? (
        <div className="flex h-40 items-center justify-center">
          <Spin />
        </div>
      ) : phase === 'running' || phase === 'paused' ? (
        <StepRunning />
      ) : phase === 'confirming' ? (
        <StepConfirm />
      ) : (
        <StepClassify onClose={onClose} />
      )}
    </Modal>
  )
}
