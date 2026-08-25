import type { EagleManualFolderItem } from '@/server/module/eagle/settings'
import type { OrganizeResultDetail } from '@/shared/eagle/organize'
import { DeleteOutlined, FolderAddOutlined } from '@ant-design/icons'
import { Button, Checkbox, Radio, Spin } from 'antd'
import { useState } from 'react'
import {
  FolderSelectModal,
  type SelectedFolderInfo,
} from '../../components/FolderSelectModal'

interface DetailPanelProps {
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
}

export function DetailPanel({
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
}: DetailPanelProps) {
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)

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
              疑似低质图片（分辨率低、画面主体不清晰、美学品味较差等）
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
              <div className="text-xs text-slate-400">原标题</div>
              <div className="break-all">
                {detail.itemName ?? '（条目已不在库中）'}
              </div>
            </div>
          </div>

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

          <div>
            <div className="mb-1 text-xs text-slate-400">选择目标文件夹</div>
            {folderPaths.length > 0 || displayedManualFolders.length > 0 ? (
              <Radio.Group
                value={activeOptionKey}
                onChange={(event) => onSelectOptionKey(event.target.value)}
                className="flex w-full flex-col gap-1.5"
              >
                {folderPaths.map((folderPath) => (
                  <div key={`ai-${folderPath}`}>
                    <Radio value={`ai:${folderPath}`}>
                      <span className="text-base font-bold break-all">
                        {folderPath}
                      </span>
                    </Radio>
                  </div>
                ))}
                {displayedManualFolders.map((manual) => (
                  <div
                    key={`manual-${manual.folderId}`}
                    className="group flex items-center justify-between"
                  >
                    <Radio value={`manual:${manual.folderId}`}>
                      <span className="text-base font-bold break-all">
                        <span className="text-blue-500">
                          【{manual.count}】
                        </span>
                        {manual.folderPath}
                      </span>
                    </Radio>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveManualFolder(manual)
                      }}
                      className="text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                    />
                  </div>
                ))}
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
        </>
      )}

      <FolderSelectModal
        open={folderSelectOpen}
        onClose={() => setFolderSelectOpen(false)}
        onConfirm={onManualFolderSelect}
      />
    </div>
  )
}
