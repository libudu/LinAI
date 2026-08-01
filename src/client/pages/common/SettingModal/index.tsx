import { openCommonSettingModal } from '../components/SettingModal'
import { AdminSetting } from './Admin/AdminSetting'

export const isAdmin = () => {
  return (
    window.location.hostname === 'localhost' && !!localStorage.getItem('admin')
  )
}

// 全局设置弹窗：目前仅剩管理员设置（其余模块配置已拆到各模块的设置弹窗）
export function openSettingModal() {
  openCommonSettingModal({
    title: '管理员设置',
    tabs: [
      {
        key: 'admin',
        label: '管理员设置',
        children: <AdminSetting />,
        hideFooter: true,
      },
    ],
  })
}
