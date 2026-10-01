import {
  DeleteOutlined,
  EllipsisOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'

import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { AppType } from '@/server'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Modal, Space, message } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import { TaskListDownloadButton } from './components/TaskListDownloadButton'
import { TaskListFinishedAlertButton } from './components/TaskListFinishedAlertButton'
import { loadTaskIds, type ImageTaskSummary } from './useTasks'

const client = hc<AppType>('/')

interface TaskListHeaderProps {
  summary: ImageTaskSummary | null
  downloadedIds: string[]
  setDownloadedIds: (ids: string[]) => void
}

export function TaskListHeader({
  summary,
  downloadedIds,
  setDownloadedIds,
}: TaskListHeaderProps) {
  const { gptImageSettings } = useLocalSetting()
  const [deletingErrors, setDeletingErrors] = useState(false)
  const [deletingDownloaded, setDeletingDownloaded] = useState(false)

  const handleDeleteErrors = async () => {
    setDeletingErrors(true)
    try {
      const errorTasks = await loadTaskIds('failed')
      if (errorTasks.length === 0) {
        message.info('没有错误任务')
        return
      }
      let successCount = 0
      for (const task of errorTasks) {
        try {
          const res = await client.api.task[':id'].$delete({
            param: { id: task },
            query: {
              keepImage: gptImageSettings.keepImageWhenDeleteTask
                ? 'true'
                : 'false',
            },
          })
          const json = await res.json()
          if (json.success) successCount++
        } catch (e) {
          // ignore individual errors
        }
      }
      message.success(`成功删除 ${successCount} 个错误任务`)
    } catch (error) {
      message.error('删除错误任务失败')
    } finally {
      setDeletingErrors(false)
    }
  }

  const handleDeleteDownloaded = async () => {
    let toDelete: string[]
    try {
      const ids = new Set(await loadTaskIds())
      toDelete = downloadedIds.filter((id) => ids.has(id))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '查询任务失败')
      return
    }
    if (toDelete.length === 0) {
      message.info('没有已下载的任务')
      return
    }

    Modal.confirm({
      title: '确认删除所有已下载任务？',
      content: (
        <div>
          <p className="mb-2 font-bold text-red-500">
            {gptImageSettings.keepImageWhenDeleteTask
              ? '警告：将删除任务记录，但图片文件将保留。'
              : '警告：将删除源文件且无法找回！'}
          </p>
          <p>请确保您已妥善保存好下载的图片。</p>
          <p>共将删除 {toDelete.length} 个任务。</p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      onOk: async () => {
        setDeletingDownloaded(true)
        try {
          let successCount = 0
          for (const task of toDelete) {
            try {
              const res = await client.api.task[':id'].$delete({
                param: { id: task },
                query: {
                  keepImage: gptImageSettings.keepImageWhenDeleteTask
                    ? 'true'
                    : 'false',
                },
              })
              const json = await res.json()
              if (json.success) successCount++
            } catch (e) {
              // ignore individual errors
            }
          }
          message.success(`成功删除 ${successCount} 个已下载任务`)
        } catch (error) {
          message.error('批量删除失败')
        } finally {
          setDeletingDownloaded(false)
        }
      },
    })
  }

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'delete-errors') {
      handleDeleteErrors()
    } else if (key === 'delete-downloaded') {
      handleDeleteDownloaded()
    }
  }

  const deleteMenuItems: MenuProps['items'] = [
    {
      key: 'delete-errors',
      danger: true,
      icon: <DeleteOutlined />,
      label: '所有错误任务',
      disabled: deletingErrors || deletingDownloaded,
    },
    {
      key: 'delete-downloaded',
      danger: true,
      icon: <DeleteOutlined />,
      label: '所有已下载任务',
      disabled: deletingErrors || deletingDownloaded,
    },
  ]

  return (
    <div className="mt-4 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="hidden items-center justify-center rounded-lg bg-blue-100 p-2 text-blue-600 sm:flex">
            <ScheduleOutlined className="text-xl" />
          </div>
          <h2 className="text-lg font-bold">任务列表</h2>
        </div>

        <Space className="ml-4">
          <TaskListFinishedAlertButton summary={summary} />
        </Space>
      </div>

      <div className="flex gap-4">
        <div className="hidden md:block">
          <Space.Compact>
            <TaskListDownloadButton
              downloadedIds={downloadedIds}
              setDownloadedIds={setDownloadedIds}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteErrors}
              loading={deletingErrors}
              disabled={deletingErrors || deletingDownloaded}
            >
              所有错误任务
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteDownloaded}
              loading={deletingDownloaded}
              disabled={deletingErrors || deletingDownloaded}
            >
              所有已下载任务
            </Button>
          </Space.Compact>
        </div>

        <div className="block md:hidden">
          <Space.Compact>
            <TaskListDownloadButton
              downloadedIds={downloadedIds}
              setDownloadedIds={setDownloadedIds}
            />

            <Dropdown
              menu={{ items: deleteMenuItems, onClick: onMenuClick }}
              placement="bottomRight"
            >
              <Button
                icon={<EllipsisOutlined />}
                loading={deletingErrors || deletingDownloaded}
              />
            </Dropdown>
          </Space.Compact>
        </div>
      </div>
    </div>
  )
}
