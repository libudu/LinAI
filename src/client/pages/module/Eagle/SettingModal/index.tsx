import { message } from 'antd'
import { createRef } from 'react'
import {
  openCommonSettingModal,
  type CommonSettingTab,
} from '../../../common/components/SettingModal'
import { useEagleConfig } from '../settings/useEagleConfig'
import { LibrarySetting, type EagleSettingRef } from './LibrarySetting'
import {
  VisionEndpointSetting,
  type VisionEndpointSettingRef,
} from './VisionEndpointSetting'

// 资源库与视觉设置独立保存；连接和人员统一由远程互联管理。
export async function openEagleSettingModal(options?: {
  initialTab?: string
  initialOnly?: boolean
  onSuccess?: (apiKey: string) => void
}) {
  try {
    await useEagleConfig.getState().fetchEagleConfig()
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '读取 Eagle 设置失败',
    )
    return
  }
  const eagleRef = createRef<EagleSettingRef>()
  const visionEndpointRef = createRef<VisionEndpointSettingRef>()

  const tabs: CommonSettingTab[] = [
    {
      key: 'eagle',
      label: '资源库',
      children: <LibrarySetting ref={eagleRef} />,
      onSave: () => eagleRef.current!.save(),
    },
    {
      key: 'vision-endpoint',
      label: '视觉接入点',
      children: <VisionEndpointSetting ref={visionEndpointRef} />,
      onSave: () => visionEndpointRef.current!.save(),
    },
  ]

  const initialTabItem =
    tabs.find((tab) => tab.key === options?.initialTab) ?? tabs[0]
  const visibleTabs = options?.initialOnly ? [initialTabItem] : tabs

  openCommonSettingModal({
    title: options?.initialOnly ? initialTabItem.label : 'Eagle 图片管理设置',
    tabs: visibleTabs,
    initialTab: options?.initialTab,
    okText: options?.onSuccess ? '保存并继续' : '保存',
    onSuccess: (result) => options?.onSuccess?.(result as string),
  })
}
