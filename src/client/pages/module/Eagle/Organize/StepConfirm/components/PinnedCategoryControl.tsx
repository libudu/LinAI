import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { PushpinOutlined } from '@ant-design/icons'
import { Button, Popover, Select } from 'antd'
import { useMemo, useState } from 'react'
import { getOrganizeItemCategory } from '../utils/sort'

interface PinnedCategoryControlProps {
  results: OrganizeResultListItem[]
  pinnedCategory: string | null
  onChange: (category: string | null) => void
}

export function PinnedCategoryControl({
  results,
  pinnedCategory,
  onChange,
}: PinnedCategoryControlProps) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of results) {
      const category = getOrganizeItemCategory(item)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts].map(([category, count]) => ({
      value: category,
      label: `${category}（${count} 个）`,
    }))
  }, [results])
  const activeCategory = options.some((item) => item.value === pinnedCategory)
    ? pinnedCategory
    : null

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      title="置顶待确认类别"
      open={open}
      onOpenChange={setOpen}
      content={
        <Select
          aria-label="置顶待确认类别"
          className="w-80"
          showSearch
          optionFilterProp="label"
          allowClear
          placeholder="选择优先整理的类别"
          value={activeCategory ?? undefined}
          options={options}
          onChange={(value: string | undefined) => {
            onChange(value ?? null)
            setOpen(false)
          }}
        />
      }
    >
      <Button
        icon={<PushpinOutlined />}
        type={activeCategory ? 'primary' : 'default'}
        title={
          activeCategory ? `已置顶：${activeCategory}` : '选择优先整理的类别'
        }
        className="shrink-0"
      >
        {activeCategory ? '已置顶类别' : '置顶类别'}
      </Button>
    </Popover>
  )
}
