import type { OrganizeClassificationMode } from '@/shared/eagle/organize'
import { Alert, Modal, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { findFolder } from '../folders'
import { setEagleLibraryRefreshSuspended, useEagleStore } from '../store'
import { StepClassify } from './StepClassify'
import { StepConfirm } from './StepConfirm'
import { StepFormatConversion } from './StepFormatConversion'
import { StepNavBar, type OrganizeStepKey } from './StepNavBar'
import { StepRunning } from './StepRunning'
import { useFormatConversion } from './hooks/useFormatConversion'
import { useOrganizeTask } from './hooks/useOrganizeTask'
import { OrganizeMediaContext } from './media'
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
  const currentFolderId = useEagleStore((state) => state.currentFolderId)
  const folders = useEagleStore((state) => state.folders)
  const mediaType = useEagleStore((state) => state.mediaType)
  const taskTypeMismatch = Boolean(
    status && status.phase !== 'done' && status.mediaType !== mediaType,
  )
  const canAddImages =
    !taskTypeMismatch &&
    Boolean(currentFolderId) &&
    Boolean(findFolder(folders, currentFolderId))
  const [currentStep, setCurrentStep] = useState<OrganizeStepKey>('classify')
  const displayMediaType =
    status && (status.phase !== 'done' || currentStep !== 'classify')
      ? status.mediaType
      : mediaType
  const [selectedClassificationMode, setSelectedClassificationMode] =
    useState<OrganizeClassificationMode>('global')
  const task = useOrganizeTask(open, status, loaded)
  const hasInitializedStepRef = useRef(false)
  const [conversionRevision, setConversionRevision] = useState(0)
  const conversion = useFormatConversion(open && mediaType === 'image', () =>
    setConversionRevision((revision) => revision + 1),
  )
  const showFormatConversion =
    open && mediaType === 'image' && conversion.availableAtOpen === true
  const classificationMode =
    status &&
    (status.phase !== 'done' || currentStep !== 'classify' || !canAddImages)
      ? status.classificationMode
      : selectedClassificationMode
  const showConfirm = classificationMode !== 'recursive-rename'
  const activeStep =
    currentStep === 'convert' && !showFormatConversion
      ? canAddImages
        ? 'classify'
        : 'running'
      : currentStep === 'classify' && !canAddImages
        ? 'running'
        : currentStep === 'confirm' && !showConfirm
          ? 'running'
          : currentStep

  const phase = status?.phase
  // 打开弹窗或状态首次加载时，智能推荐初始展示步骤
  useEffect(() => {
    if (!open) {
      hasInitializedStepRef.current = false
      return
    }
    if (loaded && !hasInitializedStepRef.current) {
      hasInitializedStepRef.current = true
      if (
        status?.classificationMode !== 'recursive-rename' &&
        status?.pendingConfirm &&
        status.pendingConfirm > 0
      ) {
        setCurrentStep('confirm')
      } else if (
        phase === 'running' ||
        phase === 'paused' ||
        (status?.failedCount ?? 0) > 0 ||
        (status?.classificationMode === 'recursive-rename' &&
          (status.pendingConfirm ?? 0) > 0)
      ) {
        setCurrentStep('running')
      } else {
        setCurrentStep('classify')
      }
    }
  }, [
    open,
    loaded,
    status?.pendingConfirm,
    status?.failedCount,
    status?.classificationMode,
    phase,
  ])

  useEffect(() => {
    // 弹窗内转换/整理的逐项事件只记脏，关闭后统一补拉主页面目录和列表。
    setEagleLibraryRefreshSuspended(open).catch((error) =>
      console.error('刷新 Eagle 列表失败', error),
    )
  }, [open])

  useEffect(() => {
    return () => {
      void setEagleLibraryRefreshSuspended(false)
    }
  }, [])

  return (
    <Modal
      title={displayMediaType === 'video' ? '视频整理' : '图片整理'}
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
      <OrganizeMediaContext.Provider value={displayMediaType}>
        {taskTypeMismatch && (
          <Alert
            className="mb-3"
            type="info"
            showIcon
            title={`当前有未完成的${status?.mediaType === 'video' ? '视频' : '图片'}整理任务。请先完成或清空当前任务，再添加${mediaType === 'video' ? '视频' : '图片'}。`}
          />
        )}
        {!loaded ? (
          <div className="flex flex-1 items-center justify-center">
            <Spin />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3 pt-1 md:flex-row md:gap-4">
            <StepNavBar
              currentStep={activeStep}
              showFormatConversion={showFormatConversion}
              showConfirm={showConfirm}
              canAddImages={canAddImages}
              onChange={setCurrentStep}
              status={status}
              task={task}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {showFormatConversion && (
                <div
                  className={
                    activeStep === 'convert'
                      ? 'flex min-h-0 flex-1 flex-col'
                      : 'hidden'
                  }
                >
                  <StepFormatConversion conversion={conversion} />
                </div>
              )}
              {activeStep === 'classify' && (
                <StepClassify
                  conversionRevision={conversionRevision}
                  onClassificationModeChange={setSelectedClassificationMode}
                  onClose={onClose}
                  onSuccess={() => setCurrentStep('running')}
                />
              )}
              {activeStep === 'running' && (
                <StepRunning
                  onSwitchToClassify={
                    canAddImages ? () => setCurrentStep('classify') : undefined
                  }
                  onSwitchToConfirm={
                    showConfirm ? () => setCurrentStep('confirm') : undefined
                  }
                  renameOnly={!showConfirm}
                />
              )}
              {activeStep === 'confirm' && (
                <StepConfirm
                  task={task}
                  onSwitchToRunning={() => setCurrentStep('running')}
                />
              )}
            </div>
          </div>
        )}
      </OrganizeMediaContext.Provider>
    </Modal>
  )
}
