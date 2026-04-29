import { DeleteOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Checkbox, message, Modal, Tooltip } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

interface DeleteTaskButtonProps {
  id: string
  onSuccess?: () => void
}

export function TaskItemDeleteButton({ id, onSuccess }: DeleteTaskButtonProps) {
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useLocalStorageState(
    'skipDeleteTaskConfirm',
    {
      defaultValue: false,
    },
  )

  const doDelete = async () => {
    try {
      const res = await client.api.task[':id'].$delete({
        param: { id },
      })
      const json = await res.json()
      if (json.success) {
        message.success('删除成功')
        onSuccess?.()
      } else {
        message.error(json.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleDelete = () => {
    if (skipDeleteConfirm) {
      doDelete()
      return
    }

    let skipNext = false

    Modal.confirm({
      title: '确认删除任务？',
      content: (
        <div>
          <p>删除任务将同时删除其生成的图片/视频文件，且不可恢复。</p>
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
      cancelText: '取消',
      onOk: () => {
        if (skipNext) {
          setSkipDeleteConfirm(true)
        }
        doDelete()
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
      />
    </Tooltip>
  )
}
