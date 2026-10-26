import { usePlatform } from '@/client/hooks/usePlatform'
import type { SelectedFolderInfo } from '@/client/pages/module/Eagle/folders'
import type { EagleManualFolderItem } from '@/client/pages/module/Eagle/preferenceTypes'
import type { OrganizeResultDetail } from '@/shared/eagle/organize'
import {
  DeleteOutlined,
  FolderAddOutlined,
  PushpinFilled,
  PushpinOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, Radio, Spin } from 'antd'
import { useState } from 'react'
import { FolderSelectModal } from '../../../components/FolderSelectModal'
import type { PinnedFolderOption } from '../types'
import type { ConfirmFolderOption } from '../utils/folderOptions'

export type { PinnedFolderOption } from '../types'

interface DetailPanelProps {
  renameOnly?: boolean
  loading: boolean
  detail: OrganizeResultDetail | null
  withTitle: boolean
  onToggleTitle: (checked: boolean) => void
  activeOptionKey: string | null
  onSelectOptionKey: (key: string) => void
  folderOptions: ConfirmFolderOption[]
  initialFolderId?: string
  onRemoveManualFolder: (folder: EagleManualFolderItem) => void
  onManualFolderSelect: (folder: SelectedFolderInfo) => void
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
  folderOptions,
  initialFolderId,
  onRemoveManualFolder,
  onManualFolderSelect,
  onTogglePin,
}: DetailPanelProps) {
  const { isMobile } = usePlatform()
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      {loading || !detail ? (
        <div className="flex flex-1 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {detail.lowQuality && (
              <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                疑似低质内容（分辨率低、画面主体不清晰、美学品味较差等）
              </div>
            )}

            <div>
              <div className="text-xs text-slate-400">
                {detail.needsRename === false ? '文件名' : '原标题'}
              </div>
              <div className="break-all">
                {detail.itemName ?? '（条目已不在库中）'}
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
                <div className="mb-1 text-xs text-slate-400">
                  选择目标文件夹
                </div>
                {folderOptions.length > 0 ? (
                  <Radio.Group
                    value={activeOptionKey}
                    onChange={(event) => onSelectOptionKey(event.target.value)}
                    className="flex w-full flex-col gap-1"
                  >
                    {folderOptions.map((option) => {
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
                            {option.type === 'manual' && option.manualItem && (
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
              </div>
            )}
          </div>
          {!renameOnly && (
            <div className="flex shrink-0 justify-end pt-2">
              <Button
                type="link"
                size="small"
                icon={<FolderAddOutlined />}
                onClick={() => setFolderSelectOpen(true)}
              >
                手动选择文件夹
              </Button>
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
