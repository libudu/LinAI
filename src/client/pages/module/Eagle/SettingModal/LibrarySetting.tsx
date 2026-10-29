import type { EagleSettings } from '@/server/module/eagle/settings'
import { Alert, Button, Form, Input, Segmented, message } from 'antd'
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
  fetchSharingIdentity,
  fetchSharingStatus,
} from '../sharing/api'
import { useEagleSharing } from '../sharing/store'
import { useEagleStore } from '../store'
import { DirectoryPicker } from './DirectoryPicker'

export interface EagleSettingRef {
  save: () => Promise<void>
}

export const LibrarySetting = forwardRef<EagleSettingRef>((_props, ref) => {
  const [form] = Form.useForm<EagleSettings & { memberName: string }>()
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
    form.setFieldsValue({
      ...config,
      libraryPath: config.libraryPath || config.defaultLibraryPath,
      // 旧配置中的非 HTTP 地址或非八位邀请码不作为直连默认值。
      remoteUrl: /^https?:\/\//.test(config.remoteUrl) ? config.remoteUrl : '',
      invitationCode: /^[A-Za-z0-9]{8}$/.test(config.invitationCode)
        ? config.invitationCode
        : '',
    })
  }, [config, form])
  useEffect(() => {
    let active = true
    void fetchSharingIdentity()
      .then((identity) => {
        if (active && !form.isFieldTouched('memberName'))
          form.setFieldValue('memberName', identity?.name ?? '')
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : '读取用户名称失败')
      })
    return () => {
      active = false
    }
  }, [form])
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
          if (!useEagleSharing.getState().connected)
            throw new Error('当前前端未连接服务，请刷新页面后重试')
          current.connecting = true
          const connection = await connectRemoteLibrary({
            url: values.remoteUrl.trim(),
            invitationCode: values.invitationCode.trim(),
            memberName: values.memberName.trim(),
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
            invitationCode: values.invitationCode.trim(),
          })
        } else {
          if (current.cancelled) throw new Error('已取消保存')
          await config.setEagleConfig({
            libraryMode: 'local',
            libraryPath: values.libraryPath?.trim() || '',
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
            options={[
              { value: 'local', label: '本地资源库' },
              {
                value: 'remote',
                label: '远程资源库',
              },
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
            <DirectoryPicker disabled={saving} />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              name="memberName"
              label="你的名称"
              extra="显示在共享方的登录记录和下载日志中，用户标识在重启后保留。"
              rules={[
                { required: true, whitespace: true, message: '请输入你的名称' },
                { max: 80 },
              ]}
            >
              <Input maxLength={80} placeholder="共享方看到的名称" />
            </Form.Item>
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
                      url.pathname !== '/' ||
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
          description="请共享方在 LinAI 页面同意本次请求，同意后自动保存。"
          action={<Button onClick={cancel}>取消请求</Button>}
        />
      )}
      {error && <Alert type="error" showIcon title={error} />}
    </div>
  )
})
