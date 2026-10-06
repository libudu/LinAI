import { Modal, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { setEagleLibraryRefreshSuspended } from '../store'
import { StepClassify } from './StepClassify'
import { StepConfirm } from './StepConfirm'
import { StepFormatConversion } from './StepFormatConversion'
import { StepNavBar, type OrganizeStepKey } from './StepNavBar'
import { StepRunning } from './StepRunning'
import { useOrganizeTask } from './hooks/useOrganizeTask'
import { useOrganizeStatus } from './store'

// 图片整理弹窗：左侧/顶部导航卡片栏 + 主操作区
// 支持非互斥自由切换步骤与跨文件夹追加图片
export function OrganizeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { status, loaded } = useOrganizeStatus()
  const [currentStep, setCurrentStep] = useState<OrganizeStepKey>('classify')
  const task = useOrganizeTask(open, status, loaded)
  const hasInitializedStepRef = useRef(false)
  const [conversionRevision, setConversionRevision] = useState(0)

  const phase = status?.phase
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
      } else if (
        phase === 'running' ||
        phase === 'paused' ||
        (status?.failedCount ?? 0) > 0
      ) {
        setCurrentStep('running')
      } else {
        setCurrentStep('classify')
      }
    }
  }, [open, loaded, status?.pendingConfirm, status?.failedCount, phase])

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
      width="calc(100vw - 32px)"
      style={{ maxWidth: 'calc(100vw - 32px)' }}
      centered
      destroyOnHidden
      styles={{
        container: {
          height: 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
        },
        body: {
          flex: 1,
          minHeight: 0,
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
        <div className="flex h-full min-h-0 flex-col gap-3 pt-1 md:flex-row md:gap-4">
          <StepNavBar
            currentStep={currentStep}
            onChange={setCurrentStep}
            status={status}
            task={task}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {open && (
              <div
                className={
                  currentStep === 'convert'
                    ? 'flex min-h-0 flex-1 flex-col'
                    : 'hidden'
                }
              >
                <StepFormatConversion
                  open={open}
                  onConverted={() =>
                    setConversionRevision((revision) => revision + 1)
                  }
                />
              </div>
            )}
            {currentStep === 'classify' && (
              <StepClassify
                conversionRevision={conversionRevision}
                onClose={onClose}
                onSuccess={() => setCurrentStep('running')}
              />
            )}
            {currentStep === 'running' && (
              <StepRunning
                onSwitchToClassify={() => setCurrentStep('classify')}
                onSwitchToConfirm={() => setCurrentStep('confirm')}
              />
            )}
            {currentStep === 'confirm' && (
              <StepConfirm
                task={task}
                onSwitchToRunning={() => setCurrentStep('running')}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
