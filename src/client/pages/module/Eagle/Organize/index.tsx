import type { OrganizeTaskView } from '@/shared/eagle/organize'
import { Modal, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { setEagleLibraryRefreshSuspended } from '../store'
import { StepClassify } from './StepClassify'
import { StepConfirm } from './StepConfirm'
import { StepNavBar, type OrganizeStepKey } from './StepNavBar'
import { StepRunning } from './StepRunning'
import { fetchOrganizeTask } from './api'
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
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const hasInitializedStepRef = useRef(false)

  const phase = status?.phase
  const isFetchingTaskRef = useRef(false)
  const pendingTaskFetchRef = useRef(false)
  const taskSequenceRef = useRef(0)
  const prevPhaseRef = useRef(phase)
  const prevOpenRef = useRef(open)
  const prevTotalRef = useRef(status?.total ?? 0)

  // 拉取任务快照以同步导航卡片展示（带单飞保护）
  const doLoadTask = useCallback(async () => {
    if (isFetchingTaskRef.current) {
      pendingTaskFetchRef.current = true
      return
    }
    isFetchingTaskRef.current = true
    const sequence = ++taskSequenceRef.current
    try {
      const nextTask = await fetchOrganizeTask()
      if (sequence === taskSequenceRef.current) {
        setTask(nextTask)
      }
    } catch (err) {
      console.error('拉取任务详情失败', err)
    } finally {
      isFetchingTaskRef.current = false
      if (pendingTaskFetchRef.current) {
        pendingTaskFetchRef.current = false
        queueMicrotask(() => {
          void doLoadTask()
        })
      }
    }
  }, [])

  // 弹窗打开、阶段变化、追加/调整队列使总数变化或无 task 时拉取
  // 队列执行中（phase 为 running 期间的数值变动）无需重复拉取整包 task
  useEffect(() => {
    const isJustOpened = open && !prevOpenRef.current
    const isPhaseChanged = open && phase !== prevPhaseRef.current
    const total = status?.total ?? 0
    const isQueueChanged = open && total !== prevTotalRef.current
    prevOpenRef.current = open
    prevPhaseRef.current = phase
    prevTotalRef.current = total

    if (isJustOpened || isPhaseChanged || isQueueChanged || (open && !task)) {
      void doLoadTask()
    }
  }, [open, phase, status?.total, task, doLoadTask])

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
            {currentStep === 'classify' && (
              <StepClassify
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
