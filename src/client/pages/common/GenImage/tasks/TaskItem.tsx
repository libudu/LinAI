import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { Task } from '@/server/common/task'
import { COMFY_IMAGE_SOURCE } from '@/shared/image/sources'
import {
  RedoOutlined,
  SyncOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Card, Tooltip, Typography, message } from 'antd'
import copy from 'copy-to-clipboard'
import dayjs from 'dayjs'
import { ImageGroup } from '../../components/ImageGroup'
import { useImageGeneration } from '../generation/useImageGeneration'
import { useTemplateDraftStore } from '../templates/draftStore'
import { TaskImage } from './components/TaskImage'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import { TaskItemDownloadButton } from './components/TaskItemDownloadButton'
import { TaskItemTags } from './components/TaskItemTags'

interface TaskItemProps {
  task: Task & { outputUrls: string[] }
  downloadedIds: string[]
  onDownloaded: () => void
}

export function TaskItem({ task, downloadedIds, onDownloaded }: TaskItemProps) {
  const { gptImageSettings } = useLocalSetting()
  const { retry: handleRetry } = useImageGeneration()

  return (
    <Card
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
              <Typography.Text type="danger" strong className="mb-1">
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
          ) : task.status === 'pending' || task.status === 'running' ? (
            <div className="flex flex-col items-center justify-center p-2">
              <Typography.Text strong className="mb-1 text-blue-500!">
                {task.status === 'pending' ? '等待中' : '运行中'}
                <SyncOutlined className="ml-1" spin />
              </Typography.Text>
            </div>
          ) : !task.outputUrls?.length ? (
            <Typography.Text
              type="secondary"
              className="p-2 text-center text-xs"
            >
              无可用图片
            </Typography.Text>
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
              showSize={gptImageSettings.showImageSizeInTaskList ?? true}
            />
          )}
        </div>

        {/* Right: Info and Actions */}
        <div className="flex min-w-0 grow flex-col justify-between overflow-hidden">
          <div>
            <TaskItemTags task={task} downloadedIds={downloadedIds} />
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
                      useTemplateDraftStore
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
                  onDownloaded={onDownloaded}
                />
              )}
              {(task.source === COMFY_IMAGE_SOURCE ||
                task.mode !== 'trial') && (
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
                source={task.source}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
