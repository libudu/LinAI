import { useLocalStorageState } from 'ahooks'
import { Alert, Card, Image, Pagination, Spin } from 'antd'
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import { TaskItem } from './TaskItem'
import { TaskListHeader } from './TaskListHeader'
import { PAGE_SIZE, useTasks, useTaskSummary } from './useTasks'

export function TaskList() {
  const [page, setPage] = useState(1)
  const [previewImage, setPreviewImage] = useState<{
    taskId: string
    imageIndex: number
  } | null>(null)
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
  const previewImages = pageTasks.flatMap((task) =>
    task.outputUrls.map((url, imageIndex) => ({ task, url, imageIndex })),
  )
  const previousPreviewImages = useRef(previewImages)
  // 按任务和图片标识定位，前方任务新增输出时不改变当前查看的图片。
  let previewCurrent = previewImage
    ? previewImages.findIndex(
        ({ task, imageIndex }) =>
          task.id === previewImage.taskId &&
          imageIndex === previewImage.imageIndex,
      )
    : -1
  if (previewImage && previewCurrent < 0 && previewImages.length) {
    const previousImages = previousPreviewImages.current
    const previousIndex = previousImages.findIndex(
      ({ task, imageIndex }) =>
        task.id === previewImage.taskId &&
        imageIndex === previewImage.imageIndex,
    )
    // 整个任务（含多张输出）删除后，优先查看后方仍存在的图片，再回退到前方。
    const candidates = [
      ...previousImages.slice(previousIndex + 1),
      ...previousImages.slice(0, Math.max(0, previousIndex)).reverse(),
    ]
    for (const candidate of candidates) {
      previewCurrent = previewImages.findIndex(
        ({ task, imageIndex }) =>
          task.id === candidate.task.id && imageIndex === candidate.imageIndex,
      )
      if (previewCurrent >= 0) break
    }
    // 同次刷新可能替换整页数据，此时继续查看新列表的第一张。
    if (previewCurrent < 0) previewCurrent = 0
  }
  useEffect(() => {
    previousPreviewImages.current = previewImages
    if (!previewImage) return
    const image = previewImages[previewCurrent]
    if (!image) {
      setPreviewImage(null)
    } else if (
      image.task.id !== previewImage.taskId ||
      image.imageIndex !== previewImage.imageIndex
    ) {
      setPreviewImage({
        taskId: image.task.id,
        imageIndex: image.imageIndex,
      })
    }
  }, [previewCurrent, previewImage, previewImages])
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
            items={previewImages.map(({ url }) => url)}
            classNames={{ popup: { root: 'task-list-image-preview' } }}
            preview={{
              open: previewCurrent >= 0,
              current: Math.max(0, previewCurrent),
              onOpenChange: (open) => {
                if (!open) setPreviewImage(null)
              },
              onChange: (current) => {
                const image = previewImages[current]
                if (image)
                  setPreviewImage({
                    taskId: image.task.id,
                    imageIndex: image.imageIndex,
                  })
              },
              actionsRender: (originalNode, { current }) => {
                const task = previewImages[current]?.task
                if (
                  !task ||
                  !isValidElement<{ children?: ReactNode }>(originalNode)
                )
                  return originalNode
                return cloneElement(
                  originalNode,
                  {},
                  <>
                    {originalNode.props.children}
                    <TaskItemDeleteButton
                      key={task.id}
                      id={task.id}
                      status={task.status}
                      source={task.source}
                      className="h-auto! self-center text-xl!"
                    />
                  </>,
                )
              },
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pageTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onPreview={(imageIndex) =>
                    setPreviewImage({ taskId: task.id, imageIndex })
                  }
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
