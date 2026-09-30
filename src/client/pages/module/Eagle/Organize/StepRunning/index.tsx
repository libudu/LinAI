import { Badge, Button, Tabs } from 'antd'
import { retryFailedOrganizeItems, skipFailedOrganizeItems } from '../api'
import { BottomBar } from './BottomBar'
import { CompletedCards } from './CompletedCards'
import { FailedList } from './FailedList'
import { QueueList } from './QueueList'
import { useRunningTask } from './hooks/useRunningTask'

// 步骤 2 执行中任务：总处理状态 + 进度（已执行/总数、成功/失败）+ 暂停/继续 +
// 错误任务集中管理与重试 + 队列预览 + 随时跳转到步骤 3 查验
export function StepRunning({
  onSwitchToConfirm,
  onSwitchToClassify,
}: {
  onSwitchToConfirm?: () => void
  onSwitchToClassify?: () => void
}) {
  const {
    phase,
    status,
    queueItems,
    failedItems,
    queueLoading,
    failedLoading,
    activeTab,
    setActiveTab,
    actionLoading,
    itemActionLoading,
    isAllCompletedAndClean,
    pendingConfirm,
    handleToggle,
    handleBatchAction,
    handleSingleRetry,
    handleSingleSkip,
    handleClear,
    getAddSubtitle,
    getConfirmSubtitle,
  } = useRunningTask()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {isAllCompletedAndClean ? (
        /* 全部完成且无错误：居中展示继续添加 / 开始确认卡片 */
        <CompletedCards
          onSwitchToClassify={onSwitchToClassify}
          onSwitchToConfirm={onSwitchToConfirm}
          addSubtitle={getAddSubtitle()}
          confirmSubtitle={getConfirmSubtitle()}
          pendingConfirm={pendingConfirm}
        />
      ) : (
        /* Tabs: 失败待处理 & 队列预览 */
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'failed' | 'queue')}
            size="small"
            className="flex h-full min-h-0 flex-1 flex-col [&_.ant-tabs-content]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-tabpane]:h-full"
            tabBarExtraContent={
              activeTab === 'failed' && failedItems.length > 0 ? (
                <div className="flex gap-2 pb-1">
                  <Button
                    size="small"
                    onClick={() =>
                      handleBatchAction(
                        skipFailedOrganizeItems,
                        '已跳过全部失败项',
                      )
                    }
                  >
                    全部跳过
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    loading={actionLoading}
                    onClick={() =>
                      handleBatchAction(
                        retryFailedOrganizeItems,
                        '已重新加入执行队列',
                      )
                    }
                  >
                    重试所有错误
                  </Button>
                </div>
              ) : null
            }
            items={[
              {
                key: 'queue',
                label: '排队与执行中',
                children: (
                  <QueueList items={queueItems} loading={queueLoading} />
                ),
              },
              {
                key: 'failed',
                label: (
                  <div className="flex items-center gap-1.5">
                    <span>失败待处理</span>
                    {failedItems.length > 0 && (
                      <Badge
                        count={failedItems.length}
                        style={{ backgroundColor: '#ef4444' }}
                      />
                    )}
                  </div>
                ),
                children: (
                  <FailedList
                    items={failedItems}
                    loading={failedLoading}
                    actionLoadingId={itemActionLoading}
                    onRetry={handleSingleRetry}
                    onSkip={handleSingleSkip}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      {/* 底部操作与引导（全部完成且无错误时不展示） */}
      {!isAllCompletedAndClean && (
        <BottomBar
          phase={phase}
          pausedReason={status?.pausedReason}
          actionLoading={actionLoading}
          pendingConfirm={pendingConfirm}
          onClear={handleClear}
          onToggle={handleToggle}
          onSwitchToConfirm={onSwitchToConfirm}
        />
      )}
    </div>
  )
}
