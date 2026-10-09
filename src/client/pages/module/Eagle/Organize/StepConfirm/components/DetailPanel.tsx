import { usePlatform } from '@/client/hooks/usePlatform'
import {
  buildFolderMap,
  type SelectedFolderInfo,
} from '@/client/pages/module/Eagle/folders'
import type { EagleManualFolderItem } from '@/client/pages/module/Eagle/preferenceTypes'
import { useEagleStore } from '@/client/pages/module/Eagle/store'
import type { OrganizeResultDetail } from '@/shared/eagle/organize'
import {
  DeleteOutlined,
  FolderAddOutlined,
  PushpinFilled,
  PushpinOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, Radio, Spin } from 'antd'
import { useMemo, useState } from 'react'
import { FolderSelectModal } from '../../../components/FolderSelectModal'
import type { PinnedFolderOption } from '../types'

export type { PinnedFolderOption } from '../types'

interface DetailPanelProps {
  renameOnly?: boolean
  loading: boolean
  detail: OrganizeResultDetail | null
  withTitle: boolean
  onToggleTitle: (checked: boolean) => void
  activeOptionKey: string | null
  onSelectOptionKey: (key: string) => void
  folderPaths: string[]
  displayedManualFolders: EagleManualFolderItem[]
  onRemoveManualFolder: (folder: EagleManualFolderItem) => void
  onManualFolderSelect: (folder: SelectedFolderInfo) => void
  pinnedOption: PinnedFolderOption | null
  onTogglePin: (option: PinnedFolderOption) => void
}

export function DetailPanel({
  renameOnly = false,
  loading,
  detail,
  withTitle,
  onToggleTitle,
  activeOptionKey,
  onSelectOptionKey,
  folderPaths,
  displayedManualFolders,
  onRemoveManualFolder,
  onManualFolderSelect,
  pinnedOption,
  onTogglePin,
}: DetailPanelProps) {
  const { isMobile } = usePlatform()
  const folders = useEagleStore((s) => s.folders)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)

  // 组装所有渲染选项：若存在 pinnedOption，强制将其置顶为首项，其余项自然排后并去重
  const renderedOptions = useMemo(() => {
    const items: Array<{
      key: string
      type: 'ai' | 'manual'
      folderPath: string
      folderId?: string
      count?: number
      isPinned: boolean
      canDelete: boolean
      manualItem?: EagleManualFolderItem
    }> = []

    if (pinnedOption) {
      const manualItem = displayedManualFolders.find(
        (m) =>
          m.folderId === pinnedOption.folderId ||
          m.folderPath === pinnedOption.folderPath,
      )
      items.push({
        key: pinnedOption.key,
        type: pinnedOption.type,
        folderPath: pinnedOption.folderPath,
        folderId: pinnedOption.folderId,
        count: manualItem?.count ?? pinnedOption.count,
        isPinned: true,
        canDelete: pinnedOption.type === 'manual',
        manualItem:
          manualItem ??
          (pinnedOption.folderId
            ? {
                folderId: pinnedOption.folderId,
                folderPath: pinnedOption.folderPath,
                count: pinnedOption.count ?? 0,
              }
            : undefined),
      })
    }

    // AI 推荐项（排除与置顶项重复的）
    for (const fp of folderPaths) {
      if (pinnedOption && pinnedOption.folderPath === fp) {
        continue
      }
      items.push({
        key: `ai:${fp}`,
        type: 'ai',
        folderPath: fp,
        isPinned: false,
        canDelete: false,
      })
    }

    // 手动选择记录项（排除与置顶项重复的）
    for (const manual of displayedManualFolders) {
      if (
        pinnedOption &&
        (pinnedOption.folderId === manual.folderId ||
          pinnedOption.folderPath === manual.folderPath)
      ) {
        continue
      }
      items.push({
        key: `manual:${manual.folderId}`,
        type: 'manual',
        folderPath: manual.folderPath,
        folderId: manual.folderId,
        count: manual.count,
        isPinned: false,
        canDelete: true,
        manualItem: manual,
      })
    }

    return items
  }, [pinnedOption, folderPaths, displayedManualFolders])

  const initialFolderId = useMemo(() => {
    const selectedOption = renderedOptions.find(
      (option) => option.key === activeOptionKey,
    )
    if (!selectedOption) return undefined
    return (
      selectedOption.folderId ??
      [...buildFolderMap(folders).values()].find(
        (folder) => folder.path === selectedOption.folderPath,
      )?.id
    )
  }, [activeOptionKey, renderedOptions, folders])

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      {loading || !detail ? (
        <div className="flex flex-1 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <>
          {detail.lowQuality && (
            <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              疑似低质内容（分辨率低、画面主体不清晰、美学品味较差等）
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div>
              <div className="text-xs text-slate-400">原文件夹</div>
              <div className="break-all">
                {detail.itemFolderPaths.length > 0
                  ? detail.itemFolderPaths.join('、')
                  : '（未归入文件夹）'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">
                {detail.needsRename === false ? '文件名' : '原标题'}
              </div>
              <div className="break-all">
                {detail.itemName ?? '（条目已不在库中）'}
              </div>
            </div>
          </div>

          {detail.needsRename !== false && (
            <div>
              <div className="text-xs text-slate-400">建议标题</div>
              <Checkbox
                className="items-start"
                checked={withTitle}
                onChange={(event) => onToggleTitle(event.target.checked)}
              >
                <span
                  className={`break-all transition-colors ${
                    withTitle ? '' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {detail.title}
                </span>
              </Checkbox>
            </div>
          )}

          {renameOnly ? (
            <div className="text-xs text-slate-400">
              仅重命名，保留全部原目录归属
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs text-slate-400">选择目标文件夹</div>
              {renderedOptions.length > 0 ? (
                <Radio.Group
                  value={activeOptionKey}
                  onChange={(event) => onSelectOptionKey(event.target.value)}
                  className="flex w-full flex-col gap-1"
                >
                  {renderedOptions.map((option) => {
                    const isChecked = activeOptionKey === option.key
                    return (
                      <div
                        key={option.key}
                        onClick={() => onSelectOptionKey(option.key)}
                        className={`group flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 transition-colors ${
                          isChecked
                            ? 'bg-blue-50/70 dark:bg-blue-900/20'
                            : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center pr-2">
                          <Radio value={option.key} className="w-full">
                            <span className="text-base font-bold break-all">
                              {option.type === 'manual' && (
                                <span className="text-blue-500">
                                  【{option.count ?? 0}】
                                </span>
                              )}
                              {option.folderPath}
                            </span>
                          </Radio>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {option.canDelete && option.manualItem && (
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              title="删除记录"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveManualFolder(option.manualItem!)
                              }}
                              className={`text-slate-400 transition-opacity hover:text-red-500 ${
                                isMobile
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100'
                              }`}
                            />
                          )}
                          <Button
                            type="text"
                            size="small"
                            icon={
                              option.isPinned ? (
                                <PushpinFilled />
                              ) : (
                                <PushpinOutlined />
                              )
                            }
                            title={
                              option.isPinned
                                ? '取消置顶'
                                : '置顶此选项（下一张图默认选中）'
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              onTogglePin({
                                key: option.key,
                                type: option.type,
                                folderPath: option.folderPath,
                                folderId: option.folderId,
                                count: option.count,
                              })
                            }}
                            className={
                              option.isPinned
                                ? 'text-blue-500 opacity-100 hover:text-blue-600'
                                : `text-slate-400 transition-opacity hover:text-blue-500 ${
                                    isMobile
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100'
                                  }`
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </Radio.Group>
              ) : (
                <div className="text-slate-500 dark:text-slate-400">
                  不属于任何已知分类
                </div>
              )}
              <div className="flex justify-end pt-1">
                <Button
                  type="link"
                  size="small"
                  icon={<FolderAddOutlined />}
                  onClick={() => setFolderSelectOpen(true)}
                >
                  手动选择文件夹
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <FolderSelectModal
        open={folderSelectOpen}
        initialFolderId={initialFolderId}
        onClose={() => setFolderSelectOpen(false)}
        onConfirm={onManualFolderSelect}
      />
    </div>
  )
}
