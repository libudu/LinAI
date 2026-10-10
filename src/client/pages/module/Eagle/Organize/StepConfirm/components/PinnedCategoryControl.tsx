import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { PushpinOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Button } from 'antd'
import { useMemo, useState } from 'react'
import { FolderTreeSelectModal } from '../../../components/FolderTreeSelectModal'
import { buildFolderOrderMap } from '../../../folders'
import { useEagleStore } from '../../../store'
import {
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
} from '../types'
import { getOrganizeItemCategory } from '../utils/sort'

interface PinnedCategoryControlProps {
  results: OrganizeResultListItem[]
  pinnedCategory: string | null
  onChange: (category: string | null) => void
}

const SPECIAL_CATEGORIES = [
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
]

const getCategoryKey = (category: string) =>
  `${SPECIAL_CATEGORIES.includes(category) ? 'special' : 'folder'}:${category}`

export function PinnedCategoryControl({
  results,
  pinnedCategory,
  onChange,
}: PinnedCategoryControlProps) {
  const folders = useEagleStore((s) => s.folders)
  const [open, setOpen] = useState(false)
  const counts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of results) {
      const category = getOrganizeItemCategory(item)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return counts
  }, [results])
  const activeCategory =
    pinnedCategory && counts.has(pinnedCategory) ? pinnedCategory : null
  const buttonLabel = activeCategory?.split('/').pop() || '选择类别'
  const treeData = useMemo<TreeDataNode[]>(() => {
    const tree: TreeDataNode[] = SPECIAL_CATEGORIES.filter((category) =>
      counts.has(category),
    ).map((category) => ({
      key: getCategoryKey(category),
      title: `${category}（${counts.get(category)}）`,
    }))
    const order = buildFolderOrderMap(folders)
    const categories = [...counts.keys()]
      .filter((category) => !SPECIAL_CATEGORIES.includes(category))
      .sort(
        (a, b) =>
          (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b) ?? Number.MAX_SAFE_INTEGER),
      )
    const nodes = new Map<string, TreeDataNode>()
    // 根据完整分类路径补齐父节点，库中已失效的推荐路径仍保留供分堆选择。
    for (const category of categories) {
      const parts = category.split('/')
      let children = tree
      for (let index = 0; index < parts.length; index++) {
        const path = parts.slice(0, index + 1).join('/')
        let node = nodes.get(path)
        if (!node) {
          const count = SPECIAL_CATEGORIES.includes(path)
            ? undefined
            : counts.get(path)
          node = {
            key: `folder:${path}`,
            title: count ? `${parts[index]}（${count}）` : parts[index],
            selectable: count !== undefined,
            children: [],
          }
          nodes.set(path, node)
          children.push(node)
        }
        children = node.children!
      }
    }
    return tree
  }, [counts, folders])

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
          <PushpinOutlined />
          <span>置顶类别</span>
        </div>
        <Button
          type={activeCategory ? 'primary' : 'default'}
          title={
            activeCategory ? `已置顶：${activeCategory}` : '选择优先整理的类别'
          }
          aria-label={
            activeCategory
              ? `置顶待确认类别：${activeCategory}`
              : '选择置顶待确认类别'
          }
          className="w-36 shrink-0"
          onClick={() => setOpen(true)}
        >
          <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        </Button>
      </div>
      <FolderTreeSelectModal
        open={open}
        title="置顶待确认类别"
        treeData={treeData}
        initialKey={activeCategory ? getCategoryKey(activeCategory) : undefined}
        searchPlaceholder="搜索类别名称"
        emptyDescription="没有匹配的待确认类别"
        onClose={() => setOpen(false)}
        onConfirm={(key) => {
          const category = key.slice(key.indexOf(':') + 1)
          if (counts.has(category)) onChange(category)
        }}
        onClear={() => onChange(null)}
        clearDisabled={!activeCategory}
      />
    </>
  )
}
