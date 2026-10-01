import {
  COMFY_IMAGE_SOURCE,
  GPT_IMAGE_SOURCE_MODEL,
} from '@/shared/image/sources'
import { useLocalStorageState } from 'ahooks'
import { Alert, Card, Image, Pagination, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { TaskItem } from './TaskItem'
import { TaskListHeader } from './TaskListHeader'
import { useTasks } from './useTasks'

const PAGE_SIZE = 10

export function TaskList() {
  const { data: tasks = [], loading, error, refresh } = useTasks()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] },
  )

  // 仅显示云端生图与 ComfyUI 任务
  const gptImageTasks = tasks
    .filter(
      (t) =>
        t.source === GPT_IMAGE_SOURCE_MODEL || t.source === COMFY_IMAGE_SOURCE,
    )
    .map((t) => ({
      ...t,
      outputUrls: t.outputUrls?.length
        ? t.outputUrls
        : t.outputUrl
          ? [t.outputUrl]
          : [],
    }))
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(gptImageTasks.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const pageTasks = gptImageTasks.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )

  useEffect(() => {
    if (page > lastPage) setPage(lastPage)
  }, [page, lastPage])
  return (
    <Card
      className="w-full border-slate-200 shadow-sm"
      classNames={{
        body: 'px-3! md:px-6!',
      }}
      styles={{ body: { paddingTop: 0 } }}
    >
      <TaskListHeader
        tasks={gptImageTasks}
        downloadedIds={downloadedIds || []}
        setDownloadedIds={setDownloadedIds}
        loading={loading}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          title="任务列表加载失败"
          description={error.message}
          action={<a onClick={refresh}>重试</a>}
          className="mb-4"
        />
      )}

      {loading && !gptImageTasks.length ? (
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Image.PreviewGroup
            items={pageTasks.flatMap((task) => task.outputUrls)}
            classNames={{ popup: { root: 'task-list-image-preview' } }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pageTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  downloadedIds={downloadedIds || []}
                  onDownloaded={() => {
                    if (!downloadedIds?.includes(task.id)) {
                      setDownloadedIds([...(downloadedIds || []), task.id])
                    }
                  }}
                />
              ))}
            </div>
          </Image.PreviewGroup>
          {gptImageTasks.length > 10 && (
            <div className="mt-4 flex justify-center">
              <Pagination
                current={currentPage + 1}
                pageSize={PAGE_SIZE}
                total={gptImageTasks.length}
                onChange={(p) => setPage(p - 1)}
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
