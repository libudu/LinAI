import { ReloadOutlined } from '@ant-design/icons'
import { Button, Select, Space, message } from 'antd'
import { useState } from 'react'
import { useEagleStore } from './store'

// 资源列表顶部操作区：排序选项 + 刷新按钮
export function Toolbar() {
  const { sortBy, sortOrder, setSort, reload, total } = useEagleStore()
  const [refreshing, setRefreshing] = useState(false)

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
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
      <Space>
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
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={handleRefresh}
        >
          刷新
        </Button>
      </Space>
      <span className="text-sm text-slate-400">共 {total} 项</span>
    </div>
  )
}
