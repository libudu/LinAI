import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import { useGlobalStore } from '@/client/store/global'
import type { AppType } from '@/server'
import type { Task } from '@/server/common/task'
import {
  COMFY_IMAGE_SOURCE,
  GPT_IMAGE_SOURCE_MODEL,
} from '@/server/module/gpt-image/enum'
import { TRIAL_TEMPLATE_TITLE } from '@/shared/image/template'
import {
  RedoOutlined,
  SyncOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import {
  Button,
  Card,
  Image,
  Pagination,
  Spin,
  Tooltip,
  Typography,
  message,
} from 'antd'
import copy from 'copy-to-clipboard'
import dayjs from 'dayjs'
import { hc } from 'hono/client'
import { ImageGroup } from '../../components/ImageGroup'
import { useTasks } from '../hooks/useTasks'
import { TaskImage } from './components/TaskImage'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import { TaskItemDownloadButton } from './components/TaskItemDownloadButton'
import { TaskItemTags } from './components/TaskItemTags'
import { TaskListHeader } from './TaskListHeader'

import { useState } from 'react'
const client = hc<AppType>('/')

export function TaskList() {
  const { data: tasks = [], loading } = useTasks()
  const { gptImageSettings } = useLocalSetting()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] },
  )

  const handleRetry = async (task: Task) => {
    if (task.source === COMFY_IMAGE_SOURCE && !task.comfyEndpointId) {
      message.error('原 ComfyUI 接入点信息缺失，无法重试')
      return
    }
    // 用任务创建时的模板快照重试，不再依赖模板存储中的当前内容
    const snapshot = task.inputSnapshot
    try {
      const response = await client.api.gptImage.generate.$post({
        json: {
          input: {
            title: snapshot?.title,
            prompt: snapshot?.prompt || '',
            images: snapshot?.images || [],
            aspectRatio:
              task.source === COMFY_IMAGE_SOURCE
                ? undefined
                : snapshot?.aspectRatio,
            n: task.source === COMFY_IMAGE_SOURCE ? undefined : snapshot?.n,
          },
          size:
            task.source === COMFY_IMAGE_SOURCE
              ? undefined
              : (task.size as any) || '2k',
          quality:
            task.source === COMFY_IMAGE_SOURCE
              ? undefined
              : (task.quality as any) || 'medium',
          endpointId:
            task.source === COMFY_IMAGE_SOURCE
              ? task.comfyEndpointId
              : undefined,
        },
      })
      const result = await response.json()
      if (result.success) message.success('已创建重试任务')
      else message.error(result.error || '重试失败')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重试请求失败')
    }
  }

  // 暂时仅显示 GPT-Image 任务
  const gptImageTasks = tasks
    .filter(
      (t) =>
        t.source === GPT_IMAGE_SOURCE_MODEL || t.source === COMFY_IMAGE_SOURCE,
    )
    .map((t) => ({
      ...t,
      outputUrls: t.outputUrls
        ? t.outputUrls
        : t.outputUrl
          ? [t.outputUrl]
          : [],
    }))
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10
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

      {loading && !gptImageTasks.length ? (
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Image.PreviewGroup
            items={gptImageTasks
              .slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
              .flatMap((task) => task.outputUrls)}
            classNames={{ popup: { root: 'task-list-image-preview' } }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {gptImageTasks
                .slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
                .map((task) => (
                  <Card
                    key={task.id}
                    size="small"
                    className="w-full shadow-sm transition-shadow hover:shadow-md"
                    classNames={{
                      body: 'p-[10px]! hover:bg-gray-100 transition-colors duration-100',
                    }}
                  >
                    <div className="flex gap-4">
                      {/* Left: Image Preview */}
                      <div className="relative flex h-[130px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded border border-gray-100 bg-gray-50">
                        {task.status === 'failed' && task.error ? (
                          <div className="flex w-full flex-col items-center justify-center p-2">
                            <Typography.Text
                              type="danger"
                              strong
                              className="mb-1"
                            >
                              生成失败
                            </Typography.Text>
                            <Typography.Text
                              type="danger"
                              className="w-full cursor-pointer text-center text-xs transition-colors hover:text-red-400!"
                              ellipsis={{ tooltip: task.error }}
                              onClick={() => {
                                if (task.error) {
                                  copy(task.error)
                                  message.success('错误信息已复制')
                                }
                              }}
                            >
                              {task.error}
                            </Typography.Text>
                          </div>
                        ) : !task.outputUrls || task.outputUrls.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-2">
                            <Typography.Text
                              strong
                              className="mb-1 text-blue-500!"
                            >
                              运行中
                              <SyncOutlined className="ml-1" spin />
                            </Typography.Text>
                          </div>
                        ) : task.outputUrls.length > 1 ? (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageGroup
                              images={task.outputUrls}
                              width={100}
                              height={130}
                              previewGroup={false}
                            />
                          </div>
                        ) : (
                          <TaskImage
                            src={task.outputUrls[0]}
                            showSize={
                              gptImageSettings.showImageSizeInTaskList ?? true
                            }
                          />
                        )}
                      </div>

                      {/* Right: Info and Actions */}
                      <div className="flex min-w-0 grow flex-col justify-between overflow-hidden">
                        <div>
                          <TaskItemTags
                            task={task}
                            downloadedIds={downloadedIds || []}
                          />
                          <div className="flex items-center gap-2">
                            {task.inputSnapshot?.title && (
                              <Typography.Text
                                strong
                                className="truncate"
                                title={task.inputSnapshot.title}
                              >
                                {task.inputSnapshot.title}
                              </Typography.Text>
                            )}
                            <div className="shrink-0 text-xs text-slate-400">
                              {dayjs(task.createdAt).format('YY/MM/DD HH:mm')}
                            </div>
                          </div>
                          {task.inputSnapshot?.prompt && (
                            <Typography.Paragraph
                              type="secondary"
                              className="mb-0! cursor-pointer text-xs transition-colors hover:text-blue-500"
                              ellipsis={{
                                rows: 2,
                                tooltip: {
                                  title: task.inputSnapshot.prompt,
                                  placement: 'top',
                                },
                              }}
                              onClick={() => {
                                if (task.inputSnapshot?.prompt) {
                                  copy(task.inputSnapshot.prompt)
                                  message.success('提示词已复制')
                                }
                              }}
                            >
                              {task.inputSnapshot.prompt}
                            </Typography.Paragraph>
                          )}
                        </div>

                        <div className="flex items-center justify-end">
                          <div className="flex items-center gap-1">
                            {task.inputSnapshot && (
                              <Tooltip title="重新填入">
                                <Button
                                  type="text"
                                  icon={<VerticalAlignTopOutlined />}
                                  onClick={() => {
                                    useGlobalStore
                                      .getState()
                                      .setFillTemplateData(task.inputSnapshot)
                                    message.success('已重新填入表单')
                                  }}
                                />
                              </Tooltip>
                            )}
                            {task.outputUrls && task.outputUrls.length > 0 && (
                              <TaskItemDownloadButton
                                outputUrls={task.outputUrls}
                                fileName={
                                  task.inputSnapshot?.title ||
                                  task.inputSnapshot?.prompt ||
                                  `task_${task.id}`
                                }
                                onDownloaded={() => {
                                  if (!downloadedIds?.includes(task.id)) {
                                    setDownloadedIds([
                                      ...(downloadedIds || []),
                                      task.id,
                                    ])
                                  }
                                }}
                              />
                            )}
                            {(task.source === COMFY_IMAGE_SOURCE ||
                              task.inputSnapshot?.title !==
                                TRIAL_TEMPLATE_TITLE) && (
                              <Tooltip title="重试">
                                <Button
                                  type="text"
                                  icon={<RedoOutlined />}
                                  onClick={() => handleRetry(task)}
                                />
                              </Tooltip>
                            )}
                            <TaskItemDeleteButton
                              id={task.id}
                              status={task.status}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </Image.PreviewGroup>
          {gptImageTasks.length > 10 && (
            <div className="mt-4 flex justify-center">
              <Pagination
                current={page + 1}
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
