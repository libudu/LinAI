import { useLoginAccess } from '@/client/service/auth'
import type { EagleSettings } from '@/server/module/eagle/settings'
import { Alert, Button, Form, Input, Segmented, Tooltip, message } from 'antd'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useEagleConfig } from '../settings/useEagleConfig'
import {
  connectRemoteLibrary,
  disconnectRemoteLibrary,
  fetchSharingStatus,
  validateDirectory,
} from '../sharing/api'
import { useEagleSharing } from '../sharing/store'
import { useEagleStore } from '../store'
import { DirectoryPicker } from './DirectoryPicker'

export interface EagleSettingRef {
  save: () => Promise<void>
}

export const LibrarySetting = forwardRef<EagleSettingRef>((_props, ref) => {
  const [form] = Form.useForm<EagleSettings>()
  const canUseRemote = useLoginAccess((state) =>
    Boolean(state.status?.configured && state.status.authenticated),
  )
  const config = useEagleConfig()
  const mode = Form.useWatch('libraryMode', form) || config.libraryMode
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [saving, setSaving] = useState(false)
  const operation = useRef<{
    cancelled: boolean
    connecting: boolean
    saved: boolean
  } | null>(null)
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    form.setFieldsValue(config)
  }, [config, form])
  const cancel = () => {
    const current = operation.current
    if (!current || current.saved) return
    current.cancelled = true
    if (current.connecting) void disconnectRemoteLibrary().catch(console.error)
  }
  useEffect(() => () => cancel(), [])

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (
        operation.current &&
        !operation.current.cancelled &&
        !operation.current.saved
      )
        throw new Error('正在保存')
      const values = await form.validateFields()
      const current = { cancelled: false, connecting: false, saved: false }
      operation.current = current
      setError('')
      setSaving(true)
      try {
        if (values.libraryMode === 'remote') {
          if (!canUseRemote)
            throw new Error(
              '请先在系统设置中配置六位登录验证码，再使用远程资源库',
            )
          if (!useEagleSharing.getState().connected)
            throw new Error('当前前端未连接服务，请刷新页面后重试')
          current.connecting = true
          const connection = await connectRemoteLibrary({
            url: values.remoteUrl.trim(),
            localPath: values.remoteLibraryPath.trim(),
            invitationCode: values.invitationCode.trim(),
          })
          if (current.cancelled) throw new Error('已取消共享请求')
          setWaiting(true)
          const deadline = Date.now() + 120000
          while (true) {
            if (current.cancelled) throw new Error('已取消共享请求')
            const { outgoing } = await fetchSharingStatus()
            if (current.cancelled) throw new Error('已取消共享请求')
            if (!outgoing || outgoing.id !== connection.id)
              throw new Error('共享连接已终止')
            if (outgoing.state === 'error' || outgoing.state === 'closed')
              throw new Error(outgoing.error || '对方拒绝了请求或连接已终止')
            if (outgoing.state === 'approved') break
            if (Date.now() > deadline)
              throw new Error('等待同意超时，请重新发送共享请求')
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
          await config.setEagleConfig({
            libraryMode: 'remote',
            remoteUrl: new URL(values.remoteUrl.trim()).href.replace(
              /\/+$/,
              '',
            ),
            remoteLibraryPath: connection.localPath,
            invitationCode: values.invitationCode.trim(),
          })
        } else {
          const directory = await validateDirectory(
            values.libraryPath?.trim() || '',
            false,
          )
          if (current.cancelled) throw new Error('已取消保存')
          await config.setEagleConfig({
            libraryMode: 'local',
            libraryPath: directory.path,
          })
          await disconnectRemoteLibrary()
        }
        current.saved = true
        message.success('配置保存成功')
        await useEagleStore.getState().reload()
      } catch (error) {
        if (current.connecting && !current.saved)
          await disconnectRemoteLibrary().catch(console.error)
        if (!current.cancelled)
          setError(error instanceof Error ? error.message : '设置保存失败')
        throw error
      } finally {
        setWaiting(false)
        setSaving(false)
        if (operation.current === current) operation.current = null
      }
    },
  }))

  return (
    <div className="space-y-3 px-4 py-2">
      <Form form={form} layout="vertical" disabled={saving}>
        <Form.Item name="libraryMode" initialValue="local">
          <Segmented
            block
            className="[&_.ant-segmented-item-disabled]:pointer-events-auto"
            options={[
              { value: 'local', label: '本地资源库路径' },
              {
                value: 'remote',
                disabled: !canUseRemote,
                label: (
                  <Tooltip
                    title={
                      canUseRemote
                        ? undefined
                        : '请先在系统设置中配置六位登录验证码，再使用远程资源库'
                    }
                  >
                    <span className="inline-block">远程资源库路径</span>
                  </Tooltip>
                ),
              },
            ]}
          />
        </Form.Item>
        {mode === 'local' ? (
          <Form.Item
            name="libraryPath"
            label="Eagle 资源库路径"
            extra="选择已有 .library 资源库。编辑、整理确认和回收站操作会写入资源库。"
            rules={[
              { required: true, whitespace: true, message: '请选择资源库路径' },
            ]}
          >
            <DirectoryPicker allowEmpty={false} disabled={saving} />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              name="remoteUrl"
              label="目标 LinAI 地址"
              extra="输入共享方可访问的 LinAI 地址，包含端口，例如 http://192.168.1.10:3000。"
              rules={[
                { required: true, message: '请输入目标 LinAI 地址' },
                {
                  validator: async (_, value: string) => {
                    if (!value) return
                    const url = new URL(value.trim())
                    if (
                      !['http:', 'https:'].includes(url.protocol) ||
                      url.username ||
                      url.password ||
                      url.search ||
                      url.hash
                    )
                      throw new Error('请输入有效的 HTTP(S) LinAI 地址')
                  },
                },
              ]}
            >
              <Input placeholder="http://192.168.1.10:3000" />
            </Form.Item>
            <Form.Item
              name="remoteLibraryPath"
              label="本地文件夹 / 资源库路径"
              extra="请选择空文件夹或已有 Eagle 资源库，作为后续下载的本地位置；当前仅浏览远程数据。"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: '请选择本地文件夹或资源库',
                },
              ]}
            >
              <DirectoryPicker disabled={saving} />
            </Form.Item>
            <Form.Item
              name="invitationCode"
              label="邀请码"
              rules={[
                {
                  required: true,
                  pattern: /^[A-Za-z0-9]{8}$/,
                  message: '请输入共享方提供的八位邀请码',
                },
              ]}
            >
              <Input maxLength={8} placeholder="八位字母或数字" />
            </Form.Item>
          </>
        )}
      </Form>
      {waiting && (
        <Alert
          type="info"
          showIcon
          title="等待对方同意共享请求…"
          description="双方需保持前端页面打开；同意后自动保存。"
          action={<Button onClick={cancel}>取消请求</Button>}
        />
      )}
      {error && <Alert type="error" showIcon title={error} />}
    </div>
  )
})
