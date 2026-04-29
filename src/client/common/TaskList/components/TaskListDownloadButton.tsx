import { DownloadOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'
import { useState } from 'react'
import type { Task } from '../../../../server/common/task-manager'
import { downloadFile, downloadFilesZip } from '../../../utils/download'

interface TaskListDownloadButtonProps {
  tasks: Task[]
  downloadedIds: string[]
  setDownloadedIds: (ids: string[]) => void
}

export function TaskListDownloadButton({
  tasks,
  downloadedIds,
  setDownloadedIds,
}: TaskListDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false)

  const handleDownloadAll = async () => {
    const unDownloadedTasks = tasks.filter(
      (t) =>
        t.status === 'completed' &&
        t.outputUrl &&
        !downloadedIds.includes(t.id),
    )

    if (unDownloadedTasks.length === 0) {
      message.info('没有需要下载的任务')
      return
    }

    setDownloading(true)
    try {
      const filesToDownload = unDownloadedTasks.map((task) => ({
        url: task.outputUrl!,
        fileName:
          task.rawTemplate?.title ||
          task.rawTemplate?.prompt ||
          `task_${task.id}`,
        id: task.id,
      }))

      if (unDownloadedTasks.length > 3) {
        message.loading({ content: '正在打包压缩...', key: 'download' })
        await downloadFilesZip(filesToDownload, `tasks_${new Date().getTime()}`)
        message.success({ content: '打包下载完成', key: 'download' })
      } else {
        message.loading({ content: '正在下载...', key: 'download' })
        await Promise.all(
          filesToDownload.map((file) =>
            downloadFile(file.url, file.fileName).catch((error) => {
              console.error(`下载任务 ${file.id} 失败`, error)
            }),
          ),
        )
        message.success({ content: '下载完成', key: 'download' })
      }

      // 标记为已下载
      setDownloadedIds([
        ...downloadedIds,
        ...unDownloadedTasks.map((t) => t.id),
      ])
    } catch (error) {
      message.error({ content: '下载失败', key: 'download' })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleDownloadAll}
      loading={downloading}
    >
      所有未下载
    </Button>
  )
}
