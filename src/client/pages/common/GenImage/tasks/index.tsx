import { useLocalStorageState } from 'ahooks'
import { Alert, Card, Image, Pagination, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { TaskItem } from './TaskItem'
import { TaskListHeader } from './TaskListHeader'
import { PAGE_SIZE, useTasks, useTaskSummary } from './useTasks'

export function TaskList() {
  const [page, setPage] = useState(1)
  const { data, loading, error, refresh } = useTasks(page)
  const {
    data: summary,
    loaded: summaryLoaded,
    error: summaryError,
    refresh: refreshSummary,
  } = useTaskSummary()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] },
  )

  const pageTasks = data.items.map((task) => ({
    ...task,
    outputUrls: task.outputUrls?.length
      ? task.outputUrls
      : task.outputUrl
        ? [task.outputUrl]
        : [],
  }))
  const observedResponse = useRef({ page, data })
  useEffect(() => {
    const previous = observedResponse.current
    observedResponse.current = { page, data }
    // 缓存中的折返页码可能已过期；只按当前查询的新响应纠正页码。
    if (
      previous.page === page &&
      previous.data !== data &&
      data.page !== page &&
      !error
    )
      setPage(data.page)
  }, [data, page, error])
  return (
    <Card
      className="w-full border-slate-200 shadow-sm"
      classNames={{
        body: 'px-3! md:px-6!',
      }}
      styles={{ body: { paddingTop: 0 } }}
    >
      <TaskListHeader
        summary={summaryLoaded ? summary : null}
        downloadedIds={downloadedIds || []}
        setDownloadedIds={setDownloadedIds}
      />
      {(error || summaryError) && (
        <Alert
          type="error"
          showIcon
          title="任务列表加载失败"
          description={(error || summaryError)?.message}
          action={
            <a
              onClick={() => {
                refresh()
                refreshSummary()
              }}
            >
              重试
            </a>
          }
          className="mb-4"
        />
      )}

      {loading && !pageTasks.length ? (
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
          {data.total > PAGE_SIZE && (
            <div className="mt-4 flex justify-center">
              <Pagination
                current={data.page}
                pageSize={PAGE_SIZE}
                total={data.total}
                onChange={setPage}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
