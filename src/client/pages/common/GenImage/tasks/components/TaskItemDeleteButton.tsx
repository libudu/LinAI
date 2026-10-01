import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { AppType } from '@/server'
import { COMFY_IMAGE_SOURCE } from '@/shared/image/sources'
import { DeleteOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Checkbox, message, Modal, Tooltip } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import { refreshTasks } from '../useTasks'

const client = hc<AppType>('/')

interface DeleteTaskButtonProps {
  id: string
  status?: string
  source?: string
  onSuccess?: () => void
}

export function TaskItemDeleteButton({
  id,
  status,
  source,
  onSuccess,
}: DeleteTaskButtonProps) {
  const { gptImageSettings } = useLocalSetting()
  const [deleting, setDeleting] = useState(false)
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useLocalStorageState(
    'skipDeleteTaskConfirm',
    {
      defaultValue: false,
    },
  )

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await client.api.task[':id'].$delete({
        param: { id },
        query: {
          keepImage: gptImageSettings.keepImageWhenDeleteTask
            ? 'true'
            : 'false',
        },
      })
      const json = await res.json()
      if (json.success) {
        message.success('删除成功')
        refreshTasks()
        onSuccess?.()
      } else {
        const error: unknown = json.error
        message.error(
          typeof error === 'string'
            ? error
            : error && typeof error === 'object' && 'message' in error
              ? String(error.message)
              : '删除失败',
        )
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleDelete = () => {
    if (skipDeleteConfirm || status === 'failed') {
      doDelete()
      return
    }

    let skipNext = false
    const cancelsComfy =
      source === COMFY_IMAGE_SOURCE &&
      (status === 'pending' || status === 'running')

    Modal.confirm({
      title: '确认删除任务？',
      content: (
        <div>
          <p>
            {gptImageSettings.keepImageWhenDeleteTask
              ? '删除任务不会删除其生成的图片文件。'
              : '删除任务将同时删除其生成的图片文件，且不可恢复。'}
          </p>
          {cancelsComfy && <p>删除后也会终止 ComfyUI 中的生成任务。</p>}
          {!cancelsComfy && (status === 'pending' || status === 'running') && (
            <p>
              删除后会停止本地等待并清理未完成输出；云端执行和计费可能继续。
            </p>
          )}
          <Checkbox
            onChange={(e) => {
              skipNext = e.target.checked
            }}
          >
            下次不再提醒
          </Checkbox>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      onOk: () => {
        if (skipNext) {
          setSkipDeleteConfirm(true)
        }
        return doDelete()
      },
    })
  }

  return (
    <Tooltip title="删除">
      <Button
        type="text"
        danger
        icon={<DeleteOutlined />}
        onClick={handleDelete}
        loading={deleting}
      />
    </Tooltip>
  )
}
