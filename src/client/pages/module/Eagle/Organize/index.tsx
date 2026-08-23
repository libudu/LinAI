import { usePlatform } from '@/client/hooks/usePlatform'
import type { OrganizeTaskView } from '@/shared/eagle/organize'
import { Modal, Spin, Tooltip } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { setEagleLibraryRefreshSuspended } from '../store'
import { StepClassify } from './StepClassify'
import { StepConfirm } from './StepConfirm'
import { StepNavBar, type OrganizeStepKey } from './StepNavBar'
import { StepRunning } from './StepRunning'
import { fetchOrganizeTask } from './api'
import { useOrganizeStatus } from './store'

// 图片整理弹窗：左侧/顶部导航卡片栏 + 主操作区
// 支持在当前锁定文件夹下非互斥自由切换与随时追加图片
export function OrganizeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { isMobile } = usePlatform()
  const { status, loaded } = useOrganizeStatus()
  const [currentStep, setCurrentStep] = useState<OrganizeStepKey>('classify')
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const hasInitializedStepRef = useRef(false)

  const phase = status?.phase
  const isLocked = status?.isLocked ?? false
  const lockedFolderName = status?.folderName

  // 拉取任务快照以同步导航卡片展示
  const loadTask = () => {
    fetchOrganizeTask()
      .then((t) => setTask(t))
      .catch((err) => console.error('拉取任务详情失败', err))
  }

  useEffect(() => {
    if (open) {
      loadTask()
    }
  }, [open, status])

  // 打开弹窗或状态首次加载时，智能推荐初始展示步骤
  useEffect(() => {
    if (!open) {
      hasInitializedStepRef.current = false
      return
    }
    if (loaded && !hasInitializedStepRef.current) {
      hasInitializedStepRef.current = true
      if (status?.pendingConfirm && status.pendingConfirm > 0) {
        setCurrentStep('confirm')
      } else if (phase === 'running' || phase === 'paused') {
        setCurrentStep('running')
      } else {
        setCurrentStep('classify')
      }
    }
  }, [open, loaded, status?.pendingConfirm, phase])

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

  const modalTitle = (
    <div className="flex items-center gap-2 pr-6">
      <span>图片整理</span>
      {isLocked && lockedFolderName && (
        <Tooltip title="当前任务处理完成或清空前，不可切换其他文件夹分类">
          <span className="max-w-[420px] truncate rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            锁定文件夹：{lockedFolderName}
          </span>
        </Tooltip>
      )}
    </div>
  )

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100%' : 880}
      centered
      destroyOnHidden
      styles={{
        body: {
          height: isMobile ? 'calc(100dvh - 100px)' : 620,
          maxHeight: isMobile ? '90vh' : undefined,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {!loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <div className="flex h-full flex-col gap-3 pt-1 md:flex-row md:gap-4">
          <StepNavBar
            currentStep={currentStep}
            onChange={setCurrentStep}
            status={status}
            task={task}
          />
          <div className="flex h-full min-w-0 flex-1 flex-col">
            {currentStep === 'classify' && (
              <StepClassify
                onClose={onClose}
                onSuccess={() => setCurrentStep('running')}
              />
            )}
            {currentStep === 'running' && (
              <StepRunning
                onSwitchToConfirm={() => setCurrentStep('confirm')}
              />
            )}
            {currentStep === 'confirm' && (
              <StepConfirm
                onSwitchToRunning={() => setCurrentStep('running')}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
