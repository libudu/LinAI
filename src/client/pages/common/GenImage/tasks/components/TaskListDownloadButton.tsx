import {
  DOWNLOAD_ZIP_MAX_FILES,
  downloadFile,
  downloadFilesZip,
} from '@/client/utils/download'
import { DownloadOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'
import { useState } from 'react'
import { loadTaskOutputs } from '../useTasks'

interface TaskListDownloadButtonProps {
  downloadedIds: string[]
  setDownloadedIds: (ids: string[]) => void
}

export function TaskListDownloadButton({
  downloadedIds,
  setDownloadedIds,
}: TaskListDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false)

  const handleDownloadAll = async () => {
    setDownloading(true)
    try {
      const unDownloadedTasks = (await loadTaskOutputs()).filter(
        (task) =>
          task.outputUrls.length > 0 && !downloadedIds.includes(task.id),
      )
      if (!unDownloadedTasks.length) {
        message.info('没有需要下载的任务')
        return
      }
      const filesToDownload = unDownloadedTasks.flatMap((task) => {
        const baseName = task.name

        return task.outputUrls.map((url, index) => ({
          url,
          fileName:
            task.outputUrls.length > 1 ? `${baseName}_${index + 1}` : baseName,
          id: `${task.id}_${index}`,
        }))
      })

      if (filesToDownload.length > DOWNLOAD_ZIP_MAX_FILES) {
        message.loading({ content: '正在打包压缩...', key: 'download' })
        await downloadFilesZip(filesToDownload, `tasks_${new Date().getTime()}`)
        message.success({ content: '打包下载完成', key: 'download' })
      } else {
        message.loading({ content: '正在下载...', key: 'download' })
        await Promise.all(
          filesToDownload.map((file) => downloadFile(file.url, file.fileName)),
        )
        message.success({ content: '下载完成', key: 'download' })
      }

      // 标记为已下载
      setDownloadedIds([
        ...new Set([...downloadedIds, ...unDownloadedTasks.map((t) => t.id)]),
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
