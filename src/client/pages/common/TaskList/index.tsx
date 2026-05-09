import {
  RedoOutlined,
  SyncOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Card, Image, List, Tooltip, Typography, message } from 'antd'
import copy from 'copy-to-clipboard'
import dayjs from 'dayjs'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import type { Task } from '../../../../server/common/task-manager'
import { TRIAL_TEMPLATE_TITLE } from '../../../../server/common/template-manager/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../../../../server/module/gpt-image/enum'
import { useTasks } from '../../../hooks/useTasks'
import { ImageGroup } from '../../../pages/common/components/ImageGroup'
import { useGlobalStore } from '../../../store/global'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import { TaskItemDownloadButton } from './components/TaskItemDownloadButton'
import { TaskItemTags } from './components/TaskItemTags'
import styles from './index.module.scss'
import { TaskListHeader } from './TaskListHeader'

const client = hc<AppType>('/')

export function TaskList() {
  const { data: tasks = [], loading } = useTasks()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] },
  )

  const handleRetry = async (task: Task) => {
    await client.api.gptImage.generate.$post({
      json: {
        templateId: task.rawTemplate?.id || '',
        size: (task.size as any) || '2k',
        quality: (task.quality as any) || 'medium',
      },
    })
    message.success('已创建重试任务')
  }

  // 暂时仅显示 GPT-Image 任务
  const gptImageTasks = tasks
    .filter((t) => t.source === GPT_IMAGE_SOURCE_MODEL)
    .map((t) => ({
      ...t,
      outputUrls: t.outputUrls
        ? t.outputUrls
        : t.outputUrl
          ? [t.outputUrl]
          : [],
    }))

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
      <List
        className={styles['task-list']}
        grid={{
          gutter: 16,
          xs: 1,
          sm: 1,
          md: 2,
          lg: 2,
          xl: 2,
          xxl: 2,
          xxxl: 2,
        }}
        dataSource={gptImageTasks}
        loading={loading}
        pagination={{
          pageSize: 10,
        }}
        renderItem={(task) => (
          <List.Item>
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
                        className="w-full text-center text-xs"
                        ellipsis={{ tooltip: task.error }}
                      >
                        {task.error}
                      </Typography.Text>
                    </div>
                  ) : !task.outputUrls || task.outputUrls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-2">
                      <Typography.Text strong className="mb-1 text-blue-500!">
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
                      />
                    </div>
                  ) : (
                    <Image
                      src={task.outputUrls[0]}
                      alt="result"
                      classNames={{
                        root: 'w-full h-full',
                        image: 'w-full! h-full! object-cover',
                      }}
                    />
                  )}
                </div>

                {/* Right: Info and Actions */}
                <div className="flex min-w-0 grow flex-col justify-between overflow-hidden">
                  <div>
                    {/* Tags */}
                    <TaskItemTags
                      task={task}
                      downloadedIds={downloadedIds || []}
                    />
                    {/* Title */}
                    <div className="flex items-center gap-2">
                      {task.rawTemplate?.title && (
                        <Typography.Text
                          strong
                          className="truncate"
                          title={task.rawTemplate.title}
                        >
                          {task.rawTemplate.title}
                        </Typography.Text>
                      )}
                      <div className="shrink-0 text-xs text-slate-400">
                        {dayjs(task.createdAt).format('YY/MM/DD HH:mm')}
                      </div>
                    </div>
                    {/* Prompt */}
                    {task.rawTemplate?.prompt && (
                      <Typography.Paragraph
                        type="secondary"
                        className="mb-0! cursor-pointer text-xs transition-colors hover:text-blue-500"
                        ellipsis={{
                          rows: 2,
                          tooltip: {
                            title: task.rawTemplate.prompt,
                            placement: 'top',
                          },
                        }}
                        onClick={() => {
                          if (task.rawTemplate?.prompt) {
                            copy(task.rawTemplate.prompt)
                            message.success('提示词已复制')
                          }
                        }}
                      >
                        {task.rawTemplate.prompt}
                      </Typography.Paragraph>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end">
                    <div className="flex items-center gap-1">
                      {task.rawTemplate && (
                        <Tooltip title="重新填入">
                          <Button
                            type="text"
                            icon={<VerticalAlignTopOutlined />}
                            onClick={() => {
                              useGlobalStore
                                .getState()
                                .setFillTemplateData(task.rawTemplate)
                              message.success('已重新填入表单')
                            }}
                          />
                        </Tooltip>
                      )}
                      {task.outputUrls && task.outputUrls.length > 0 && (
                        <TaskItemDownloadButton
                          outputUrls={task.outputUrls}
                          fileName={
                            task.rawTemplate?.title ||
                            task.rawTemplate?.prompt ||
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
                      {task.rawTemplate?.title !== TRIAL_TEMPLATE_TITLE && (
                        <Tooltip title="重试">
                          <Button
                            type="text"
                            icon={<RedoOutlined />}
                            onClick={() => handleRetry(task)}
                          />
                        </Tooltip>
                      )}
                      <TaskItemDeleteButton id={task.id} status={task.status} />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </List.Item>
        )}
      />
    </Card>
  )
}
