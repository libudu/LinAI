import { Card, Spin, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { getMediaWorkspace, saveMediaWorkspace } from './api'
import { DirectorySelector } from './components/DirectorySelector'
import { OriginalImageTab } from './components/OriginalImageTab'
import { PlaceholderTab } from './components/PlaceholderTab'
import { ScreenedImageTab } from './components/ScreenedImageTab'
import { TrashImageTab } from './components/TrashImageTab'
import type { MediaWorkspaceSnapshot } from './types'

export function MediaClassifier() {
  const [workspace, setWorkspace] = useState<MediaWorkspaceSnapshot | null>(
    null,
  )
  const [sourceDir, setSourceDir] = useState('')
  const [resultDir, setResultDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const syncWorkspace = (nextWorkspace: MediaWorkspaceSnapshot) => {
    setWorkspace(nextWorkspace)
    setSourceDir(nextWorkspace.sourceDir)
    setResultDir(nextWorkspace.resultDir)
  }

  const loadWorkspace = async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const nextWorkspace = await getMediaWorkspace()
      syncWorkspace(nextWorkspace)
    } catch (error: any) {
      message.error(error.message || '获取图片整理工作区失败')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadWorkspace()
  }, [])

  const handleSaveWorkspace = async () => {
    setSaving(true)
    try {
      const nextWorkspace = await saveMediaWorkspace(sourceDir, resultDir)
      syncWorkspace(nextWorkspace)
      setRefreshKey((value) => value + 1)
      message.success('目录已应用')
    } catch (error: any) {
      message.error(error.message || '保存目录失败')
    } finally {
      setSaving(false)
    }
  }

  const handleMutated = async () => {
    await loadWorkspace(true)
    setRefreshKey((value) => value + 1)
  }

  const configured = Boolean(workspace?.sourceDir && workspace?.resultDir)

  if (loading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <div className="flex min-h-[320px] items-center justify-center">
          <Spin />
        </div>
      </Card>
    )
  }

  if (!configured) {
    return (
      <DirectorySelector
        sourceDir={sourceDir}
        resultDir={resultDir}
        saving={saving}
        onSourceDirChange={setSourceDir}
        onResultDirChange={setResultDir}
        onSave={handleSaveWorkspace}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Tabs
        size="large"
        defaultActiveKey="original"
        items={[
          {
            key: 'original',
            label: `总图片（${workspace?.summary.originalCount ?? 0}）`,
            children: (
              <OriginalImageTab
                refreshKey={refreshKey}
                onMutated={handleMutated}
              />
            ),
          },
          {
            key: 'screened',
            label: `筛选后的图片（${workspace?.summary.screenedCount ?? 0}）`,
            children: <ScreenedImageTab refreshKey={refreshKey} />,
          },
          {
            key: 'classified',
            label: `分类后的图片（${workspace?.summary.classifiedCount ?? 0}）`,
            children: (
              <PlaceholderTab
                title="分类后的图片"
                description="该页先搭建分类展示结构，后续会继续补充自动分类和目录归档能力。"
              />
            ),
          },
          {
            key: 'trash',
            label: `回收站（${workspace?.summary.trashCount ?? 0}）`,
            children: (
              <TrashImageTab
                refreshKey={refreshKey}
                onMutated={handleMutated}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
