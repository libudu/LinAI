import { usePlatform } from '@/client/hooks/usePlatform'
import { FolderOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Drawer, Segmented, Select, Space, message } from 'antd'
import { useState } from 'react'
import { FolderTree } from './FolderTree'
import { useEagleStore } from './store'
import type { EagleImageSize } from './store'

// 资源列表顶部操作区：排序选项 + 图片大小档位 + 刷新按钮；移动端提供文件夹抽屉入口
export function Toolbar() {
  const { sortBy, sortOrder, setSort, reload, total, imageSize, setImageSize } =
    useEagleStore()
  const { isMobile } = usePlatform()
  const [refreshing, setRefreshing] = useState(false)
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false)

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
        <Select
          value={`${sortBy}_${sortOrder}`}
          style={{ width: 160 }}
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
        <Segmented<EagleImageSize>
          value={imageSize}
          onChange={setImageSize}
          options={[
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
          ]}
        />
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={handleRefresh}
        >
          刷新
        </Button>
      </Space>
      <span className="text-sm text-slate-400">共 {total} 项</span>

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
    </div>
  )
}
