import { Card, Typography, Button, Image, Tooltip, List, message } from 'antd'
import { RedoOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import type { Task } from '../../../server/common/task-manager'
import { useTasks } from '../../hooks/useTasks'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import styles from './index.module.scss'
import { TaskItemDownloadButton } from './components/TaskItemDownloadButton'
import { TRIAL_TEMPLATE_TITLE } from '../../../server/common/template-manager/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../../../server/module/gpt-image/enum'
import { TaskItemTags } from './components/TaskItemTags'
import { TaskListHeader } from './TaskListHeader'

const client = hc<AppType>('/')

export function TaskList() {
  const { data: tasks = [], loading, refresh: fetchTasks } = useTasks()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] }
  )

  const handleRetry = async (task: Task) => {
    await client.api.gptImage.generate.$post({
      json: {
        templateId: task.rawTemplate?.id || '',
        size: (task.size as any) || '2k',
        quality: (task.quality as any) || 'medium'
      }
    })
    message.success('已创建重试任务')
    setTimeout(() => {
      fetchTasks()
    }, 500)
  }

  // 暂时仅显示 GPT-Image 任务
  const gptImageTasks = tasks.filter((t) => t.source === GPT_IMAGE_SOURCE_MODEL)

  return (
    <Card
      className="w-full shadow-sm border-slate-200"
      styles={{ body: { paddingTop: 0 } }}
    >
      <TaskListHeader
        tasks={gptImageTasks}
        downloadedIds={downloadedIds || []}
        setDownloadedIds={setDownloadedIds}
        fetchTasks={fetchTasks}
        loading={loading}
      />
      <List
        className={styles['task-list']}
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
        dataSource={gptImageTasks}
        loading={loading}
        pagination={{
          pageSize: 10
        }}
        renderItem={(task) => (
          <List.Item>
            <Card size="small" className="w-full shadow-sm">
              <div className="flex gap-4">
                {/* Left: Image Preview */}
                <div className="shrink-0 w-28 h-36 relative border border-gray-100 rounded overflow-hidden flex items-center justify-center bg-gray-50">
                  {task.status === 'failed' && task.error ? (
                    <Typography.Text
                      type="danger"
                      className="text-xs text-center p-2"
                      ellipsis={{ tooltip: task.error }}
                    >
                      {task.error}
                    </Typography.Text>
                  ) : !task.outputUrl ? (
                    <Typography.Text type="secondary" className="text-xs">
                      暂无图片
                    </Typography.Text>
                  ) : (
                    <Image
                      src={task.outputUrl}
                      alt="result"
                      classNames={{
                        root: 'w-full h-full',
                        image: 'w-full! h-full! object-cover'
                      }}
                    />
                  )}
                </div>

                {/* Right: Info and Actions */}
                <div className="flex-grow flex flex-col justify-between overflow-hidden min-w-0">
                  <div>
                    {/* Tags */}
                    <TaskItemTags
                      task={task}
                      downloadedIds={downloadedIds || []}
                    />

                    {/* Title */}
                    {task.rawTemplate?.title && (
                      <Typography.Text
                        strong
                        className="block mb-1 truncate"
                        title={task.rawTemplate.title}
                      >
                        {task.rawTemplate.title}
                      </Typography.Text>
                    )}

                    {/* Prompt */}
                    {task.rawTemplate?.prompt && (
                      <Typography.Paragraph
                        type="secondary"
                        className="text-xs mb-0!"
                        ellipsis={{ rows: 2, tooltip: task.rawTemplate.prompt }}
                      >
                        {task.rawTemplate.prompt}
                      </Typography.Paragraph>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between items-center gap-1 mt-2">
                    <div className="text-xs text-slate-400">
                      {new Date(task.createdAt).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1">
                      {task.outputUrl && (
                        <TaskItemDownloadButton
                          outputUrl={task.outputUrl}
                          fileName={
                            task.rawTemplate?.title || task.rawTemplate.prompt
                          }
                          onDownloaded={() => {
                            if (!downloadedIds?.includes(task.id)) {
                              setDownloadedIds([
                                ...(downloadedIds || []),
                                task.id
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
                      <TaskItemDeleteButton
                        id={task.id}
                        onSuccess={() => {
                          setTimeout(() => {
                            fetchTasks()
                          }, 500)
                        }}
                      />
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
