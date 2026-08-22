import { usePlatform } from '@/client/hooks/usePlatform'
import {
  AppstoreOutlined,
  FolderOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Segmented,
  Select,
  Space,
  message,
} from 'antd'
import { useState } from 'react'
import { FolderTree } from './FolderTree'
import { OrganizeModal } from './Organize'
import { useOrganizeStatus } from './Organize/store'
import { openEagleSettingModal } from './SettingModal'
import { useEagleVisionConfig } from './SettingModal/useEagleVisionConfig'
import type { EagleImageSize } from './store'
import { useEagleStore } from './store'

// 资源列表顶部操作区：「展示选项」下拉面板（排序/图片大小/文件名/文件大小/文件夹描述）+ 刷新按钮 +「图片整理」入口；移动端提供文件夹抽屉入口
export function Toolbar() {
  const {
    sortBy,
    sortOrder,
    setSort,
    reload,
    imageSize,
    setImageSize,
    showFileName,
    setShowFileName,
    showFileSize,
    setShowFileSize,
    showFolderDescription,
    setShowFolderDescription,
    currentFolderId,
  } = useEagleStore()
  const { isMobile } = usePlatform()
  const visionApiKey = useEagleVisionConfig((s) => s.visionApiKey)
  const { status: organizeStatus } = useOrganizeStatus()
  const [refreshing, setRefreshing] = useState(false)
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false)
  const [organizeOpen, setOrganizeOpen] = useState(false)

  // 徽标：队列未完成时显示剩余任务数；全部执行完有待确认时显示小红点
  const organizePhase = organizeStatus?.phase
  const badgeCount =
    organizeStatus &&
    (organizePhase === 'running' || organizePhase === 'paused')
      ? organizeStatus.remaining
      : 0
  const badgeDot = organizePhase === 'confirming'

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await reload()
      message.success('已刷新')
    } catch (error) {
      console.error('刷新 Eagle 索引失败', error)
      message.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  // 图片整理依赖视觉接入点：未配置时先引导配置，保存成功后继续打开
  const handleOpenOrganize = () => {
    if (visionApiKey) {
      setOrganizeOpen(true)
      return
    }
    openEagleSettingModal({
      initialTab: 'vision-endpoint',
      initialOnly: true,
      onSuccess: () => setOrganizeOpen(true),
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
      <Space wrap>
        {isMobile && (
          <Button
            icon={<FolderOutlined />}
            onClick={() => setFolderDrawerOpen(true)}
          >
            切换文件夹
          </Button>
        )}
        <Dropdown
          trigger={isMobile ? ['click'] : ['hover']}
          menu={{ items: [] }}
          dropdownRender={() => (
            <div className="w-60 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1 text-xs text-slate-400">排列顺序</div>
              <Select
                value={`${sortBy}_${sortOrder}`}
                className="w-full"
                onChange={(value) => {
                  const [by, order] = value.split('_') as [
                    typeof sortBy,
                    typeof sortOrder,
                  ]
                  setSort(by, order)
                }}
                options={[
                  { value: 'mtime_desc', label: '修改时间 新→旧' },
                  { value: 'mtime_asc', label: '修改时间 旧→新' },
                  { value: 'size_desc', label: '文件大小 大→小' },
                  { value: 'size_asc', label: '文件大小 小→大' },
                ]}
              />
              <div className="mt-3 mb-1 text-xs text-slate-400">
                图片展示大小
              </div>
              <Segmented<EagleImageSize>
                block
                value={imageSize}
                onChange={setImageSize}
                options={[
                  { value: 'small', label: '小' },
                  { value: 'medium', label: '中' },
                  { value: 'large', label: '大' },
                ]}
              />
              <div className="mt-3 flex flex-col gap-1">
                <Checkbox
                  checked={showFolderDescription}
                  onChange={(e) => setShowFolderDescription(e.target.checked)}
                >
                  显示文件夹描述
                </Checkbox>
                <Checkbox
                  checked={showFileName}
                  onChange={(e) => setShowFileName(e.target.checked)}
                >
                  展示文件名
                </Checkbox>
                <Checkbox
                  checked={showFileSize}
                  onChange={(e) => setShowFileSize(e.target.checked)}
                >
                  展示文件大小
                </Checkbox>
              </div>
            </div>
          )}
        >
          <Button icon={<SettingOutlined />}>展示选项</Button>
        </Dropdown>
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={handleRefresh}
        >
          刷新
        </Button>
      </Space>

      {currentFolderId && (
        <Badge count={badgeCount} size="small" dot={badgeDot}>
          <Button
            type="primary"
            icon={<AppstoreOutlined />}
            onClick={handleOpenOrganize}
          >
            图片整理
          </Button>
        </Badge>
      )}

      <Drawer
        title="文件夹"
        placement="left"
        open={folderDrawerOpen}
        onClose={() => setFolderDrawerOpen(false)}
        width={280}
        styles={{ body: { padding: 0 } }}
      >
        <FolderTree onSelected={() => setFolderDrawerOpen(false)} />
      </Drawer>

      <OrganizeModal
        open={organizeOpen}
        onClose={() => setOrganizeOpen(false)}
      />
    </div>
  )
}
