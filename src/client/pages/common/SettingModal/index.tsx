import { createRef } from 'react'
import {
  openCommonSettingModal,
  type CommonSettingTab,
} from '../components/SettingModal'
import { AdminSetting } from './Admin/AdminSetting'
import { EndpointSetting, EndpointSettingRef } from './Endpoint/EndpointSetting'
import { SideSetting } from './SideSetting'
import { UploadImageSetting } from './UploadImageSetting'

export const isAdmin = () => {
  return (
    window.location.hostname === 'localhost' && !!localStorage.getItem('admin')
  )
}

export function openSettingModal(options?: {
  initialTab?: string
  onSuccess?: (apiKey: string) => void
}) {
  const endpointRef = createRef<EndpointSettingRef>()

  const tabs: CommonSettingTab[] = [
    {
      key: 'endpoint',
      label: '接入点配置',
      children: <EndpointSetting ref={endpointRef} />,
      onSave: () => endpointRef.current!.save(),
    },
    {
      key: 'upload-image',
      label: '通用图片设置',
      children: <UploadImageSetting />,
    },
    {
      key: 'side-setting',
      label: '辅助功能',
      children: <SideSetting />,
    },
  ]

  if (isAdmin()) {
    tabs.push({
      key: 'admin',
      label: '管理员设置',
      children: <AdminSetting />,
      hideFooter: true,
    })
  }

  openCommonSettingModal({
    title: '设置',
    tabs,
    initialTab: options?.initialTab,
    okText: options?.onSuccess ? '保存并继续' : '保存',
    onSuccess: (result) => options?.onSuccess?.(result as string),
  })
}
