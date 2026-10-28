import { Button, Select, Space, message } from 'antd'
import { useState } from 'react'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useEagleStore } from '../store'
import { useEagleSharing } from './store'

/** 资源库入口只选择本地/已授权房主，连接与人员管理统一在远程互联。 */
export function LibrarySource() {
  const config = useEagleConfig()
  const outgoing = useEagleSharing((state) => state.outgoing)
  const [busy, setBusy] = useState(false)
  return (
    <Space size="small">
      <Select
        aria-label="选择资源库"
        value={config.libraryMode}
        disabled={busy}
        style={{ minWidth: 130 }}
        options={[
          {
            value: 'local',
            label: '本地资源库',
            disabled: !config.libraryPath,
          },
          {
            value: 'remote',
            label: '远程资源库',
            disabled: outgoing?.state !== 'approved',
          },
        ]}
        onChange={async (libraryMode: 'local' | 'remote') => {
          setBusy(true)
          try {
            await config.setEagleConfig({ libraryMode })
            await useEagleStore.getState().init()
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : '切换资源库失败',
            )
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button href="/interconnect" type="link" size="small">
        互联
      </Button>
    </Space>
  )
}
