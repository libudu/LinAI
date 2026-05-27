import {
  FolderOpenOutlined,
  PlusOutlined,
  SoundOutlined,
  SyncOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Input, Modal, message } from 'antd'
import { hc } from 'hono/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppType } from '../../../../../../server'
import { TTSCharacter, TTSDialogue } from '../../../../../../server/module/tts'
import { ExportAudioButton } from './ExportAudioButton'
import { ImportRenpyModal, ImportRenpyModalRef } from './ImportRenpyModal'

const client = hc<AppType>('/')

interface RenpySyncStatus {
  workDir: string | null
  syncedCount: number
  totalCount: number
}

interface ControlPanelProps {
  projectId: string
  dialogues: TTSDialogue[]
  characters: TTSCharacter[]
  onAddClick: () => void
  onUpdateProject: (updates: any) => void
}

export const ControlPanel = ({
  projectId,
  dialogues,
  characters,
  onAddClick,
  onUpdateProject,
}: ControlPanelProps) => {
  const importModalRef = useRef<ImportRenpyModalRef>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [syncStatus, setSyncStatus] = useState<RenpySyncStatus | null>(null)
  const [isLoadingSyncStatus, setIsLoadingSyncStatus] = useState(false)
  const [isDirModalOpen, setIsDirModalOpen] = useState(false)
  const [dirInput, setDirInput] = useState('')
  const [isSavingDir, setIsSavingDir] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const issues = useMemo(() => {
    const list: string[] = []
    const hasMissingCharacter = dialogues.some(
      (d) => !characters.find((c) => c.id === d.characterId),
    )
    if (hasMissingCharacter) {
      list.push('语句对应的人物不存在')
    }
    return list
  }, [dialogues, characters])

  const hasIssues = issues.length > 0

  const loadRenpySyncStatus = useCallback(async () => {
    setIsLoadingSyncStatus(true)
    try {
      const response = await client.api.tts.projects[':id']['renpy-sync'].$get({
        param: { id: projectId },
      })
      const data = await response.json()
      if (data.success) {
        setSyncStatus(data.data)
      } else {
        message.error(data.error || '获取同步状态失败')
      }
    } catch (error: any) {
      message.error(error.message || '获取同步状态失败')
    } finally {
      setIsLoadingSyncStatus(false)
    }
  }, [projectId])

  useEffect(() => {
    loadRenpySyncStatus()
  }, [loadRenpySyncStatus, dialogues])

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importModalRef.current?.open(file)
    }
    e.target.value = ''
  }

  const handleImportConfirm = (
    newCharacters: TTSCharacter[],
    newDialogues: TTSDialogue[],
  ) => {
    onUpdateProject({
      characters: [...characters, ...newCharacters],
      dialogues: [...dialogues, ...newDialogues],
    })
  }

  const openDirModal = () => {
    setDirInput(syncStatus?.workDir || '')
    setIsDirModalOpen(true)
  }

  const handleSaveRenpyDir = async () => {
    const workDir = dirInput.trim()
    if (!workDir) {
      message.warning('请输入 RenPy 导出目录')
      return
    }

    setIsSavingDir(true)
    try {
      const response = await client.api.tts.projects[':id']['renpy-sync'][
        'work-dir'
      ].$post({
        param: { id: projectId },
        json: { workDir },
      })
      const data = await response.json()
      if (!data.success) {
        message.error(data.error || '设置目录失败')
        return
      }

      setSyncStatus(data.data.status)
      setIsDirModalOpen(false)
      message.success('RenPy 导出目录已更新')
    } catch (error: any) {
      message.error(error.message || '设置目录失败')
    } finally {
      setIsSavingDir(false)
    }
  }

  const handleSyncToRenpy = async () => {
    setIsSyncing(true)
    try {
      const response = await client.api.tts.projects[':id']['renpy-sync'].$post(
        {
          param: { id: projectId },
        },
      )
      const data = await response.json()
      if (!data.success) {
        message.error(data.error || '同步失败')
        return
      }

      setSyncStatus(data.data)
      message.success(`已同步 ${data.data.syncedCount} 个音频文件`)
    } catch (error: any) {
      message.error(error.message || '同步失败')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <>
      <input
        type="file"
        accept=".tab,.txt"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div>
            <h3 className="mb-2 text-base font-medium text-slate-800">
              创建对话
            </h3>
            <p className="mb-5 text-sm text-slate-500">
              从外部文件导入或手动添加单条对话记录
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleImportClick} icon={<UploadOutlined />}>
              从 Renpy Dialogue.tab 导入
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddClick}>
              添加单条对话
            </Button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div>
            <h3 className="mb-2 text-base font-medium text-slate-800">
              生成语音
            </h3>
            {hasIssues ? (
              <div className="mb-5 flex flex-col gap-1 text-sm text-amber-600">
                <div className="flex items-center gap-1 font-medium">
                  <WarningOutlined />
                  <span>当前存在以下问题，暂无法生成：</span>
                </div>
                <ul className="list-disc pl-5 text-amber-500">
                  {issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-5 text-sm text-slate-500">
                所有语句均已就绪，可一键批量生成音频
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              type="primary"
              icon={<SoundOutlined />}
              onClick={() => {
                message.info('批量生成功能暂未实现')
              }}
              disabled={hasIssues}
            >
              批量生成语音
            </Button>
            <ExportAudioButton dialogues={dialogues} />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div>
            <h3 className="mb-2 text-base font-medium text-slate-800">
              RenPy 项目同步
            </h3>
            <p className="mb-5 text-sm text-slate-500">
              选择 RenPy 导出目录后，可将有效音频一键覆盖同步到项目中
            </p>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Button icon={<FolderOpenOutlined />} onClick={openDirModal}>
                设置 RenPy 导出目录
              </Button>
              {syncStatus?.workDir && (
                <span
                  className="max-w-full flex-1 truncate text-right text-xs text-slate-500"
                  title={syncStatus.workDir}
                >
                  {syncStatus.workDir}
                </span>
              )}
            </div>
            {isLoadingSyncStatus ? (
              <p className="mb-5 text-sm text-slate-400">正在加载同步状态...</p>
            ) : syncStatus?.workDir ? (
              syncStatus.totalCount > 0 ? (
                <p className="mb-5 text-sm text-slate-600">
                  已同步
                  <span className="mx-1 font-semibold text-slate-800">
                    {syncStatus.syncedCount}
                  </span>
                  /
                  <span className="mx-1 font-semibold text-slate-800">
                    {syncStatus.totalCount}
                  </span>
                  个有效对话
                </p>
              ) : (
                <p className="mb-5 text-sm text-slate-400">
                  暂无可同步的有效对话，需要同时具备 RenpyID 和已生成音频
                </p>
              )
            ) : (
              <p className="mb-5 text-sm text-slate-400">
                请先设置工作目录，再查看同步状态并执行同步
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleSyncToRenpy}
              loading={isSyncing}
              disabled={
                !syncStatus?.workDir || (syncStatus?.totalCount || 0) === 0
              }
            >
              同步到 RenPy 目录
            </Button>
          </div>
        </div>
      </div>

      <ImportRenpyModal
        ref={importModalRef}
        characters={characters}
        onConfirm={handleImportConfirm}
      />
      <Modal
        title="设置 RenPy 导出目录"
        open={isDirModalOpen}
        onOk={handleSaveRenpyDir}
        onCancel={() => !isSavingDir && setIsDirModalOpen(false)}
        confirmLoading={isSavingDir}
        okText="保存"
        cancelText="取消"
        cancelButtonProps={{ disabled: isSavingDir }}
      >
        <div className="space-y-3 pt-3">
          <p className="text-sm text-slate-500">
            请输入本地绝对路径，保存时会校验目录是否存在且可读写
          </p>
          <Input
            placeholder="例如：D:\\RenPy\\MyProject\\game\\audio"
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onPressEnter={() => {
              if (!isSavingDir) {
                handleSaveRenpyDir()
              }
            }}
          />
        </div>
      </Modal>
    </>
  )
}
