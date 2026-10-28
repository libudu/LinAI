import type { EagleSettings } from '@/server/module/eagle/settings'
import { Alert, Form, Segmented, message } from 'antd'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
  fetchRoomStatus,
  selectRemoteLibrary,
  type RoomStatus,
} from '../../Interconnect/api'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useEagleStore } from '../store'
import { DirectoryPicker } from './DirectoryPicker'

export interface EagleSettingRef {
  save: () => Promise<void>
}

export const LibrarySetting = forwardRef<EagleSettingRef>((_props, ref) => {
  const [form] = Form.useForm<EagleSettings>()
  const config = useEagleConfig()
  const mode = Form.useWatch('libraryMode', form) || config.libraryMode
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const settings = useEagleConfig.getState()
    form.setFieldsValue({
      ...settings,
      libraryPath: settings.libraryPath || settings.defaultLibraryPath,
    })
    void fetchRoomStatus()
      .then(setStatus)
      .catch((error) =>
        setError(error instanceof Error ? error.message : '读取房间失败'),
      )
  }, [form])
  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      try {
        if (values.libraryMode === 'remote') {
          if (status?.room?.role !== 'guest')
            throw new Error('请先在「远程互联」粘贴邀请加入房间')
          if (status.eagle?.state !== 'approved') await selectRemoteLibrary()
          else await config.setEagleConfig({ libraryMode: 'remote' })
          await config.fetchEagleConfig()
          message.success('已选择远程资源库')
        } else {
          await config.setEagleConfig({
            libraryMode: 'local',
            libraryPath: values.libraryPath?.trim() || '',
          })
          form.setFieldValue(
            'libraryPath',
            useEagleConfig.getState().libraryPath,
          )
          message.success('本地资源库已保存')
          await useEagleStore.getState().reload()
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : '保存失败')
        throw error
      }
    },
  }))
  return (
    <div className="space-y-3 px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item name="libraryMode" initialValue="local">
          <Segmented
            block
            options={[
              { value: 'local', label: '本地资源库' },
              { value: 'remote', label: '远程资源库' },
            ]}
          />
        </Form.Item>
        {mode === 'local' ? (
          <Form.Item
            name="libraryPath"
            label="Eagle 资源库路径"
            extra="默认在 LinAI 所在目录下创建「Eagle资源库」文件夹，保存后即可使用。也可选择其他空文件夹新建资源库，或选择已有 Eagle 资源库继续使用。"
            rules={[
              { required: true, whitespace: true, message: '请选择资源库路径' },
            ]}
          >
            <DirectoryPicker />
          </Form.Item>
        ) : (
          <Alert
            type="info"
            showIcon
            title={
              status?.room?.role === 'guest'
                ? `房间：${status.room.name}`
                : '请先加入共享方的房间'
            }
            description="在左侧「远程互联」中管理邀请和连接。保存时连接房主的 Eagle 远程资源库，连接断开后将不可用，可在此切换回本地资源库；可见范围由房主的文件夹权限决定。"
          />
        )}
      </Form>
      {error && <Alert type="error" showIcon title={error} />}
    </div>
  )
})
