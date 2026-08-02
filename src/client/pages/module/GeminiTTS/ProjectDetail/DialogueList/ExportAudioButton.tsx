import { TTSDialogue } from '@/server/module/tts'
import { DownloadOutlined } from '@ant-design/icons'
import { Button, message, Modal, Progress } from 'antd'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import React, { useState } from 'react'

interface ExportAudioButtonProps {
  dialogues: TTSDialogue[]
}

const sanitizeFilename = (name: string) => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

export const ExportAudioButton: React.FC<ExportAudioButtonProps> = ({
  dialogues,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const generatedDialogues = dialogues.filter((d) => d.audioUrl)

  const handleExport = async () => {
    if (generatedDialogues.length === 0) {
      message.warning('没有可导出的已生成语音')
      return
    }

    setIsExporting(true)
    setProgress(0)
    const zip = new JSZip()
    const nameCountMap: Record<string, number> = {}

    try {
      let completed = 0
      for (const dialogue of generatedDialogues) {
        if (!dialogue.audioUrl) continue

        let baseName = dialogue.data?.renpyId || dialogue.content
        baseName = sanitizeFilename(baseName).substring(0, 100)

        if (!baseName) {
          baseName = 'audio'
        }

        if (nameCountMap[baseName] !== undefined) {
          nameCountMap[baseName] += 1
          baseName = `${baseName}（${nameCountMap[baseName]}）`
        } else {
          nameCountMap[baseName] = 0
        }

        const fileName = `${baseName}.mp3`

        const response = await fetch(dialogue.audioUrl)
        if (!response.ok) {
          throw new Error(`无法下载音频: ${fileName}`)
        }
        const blob = await response.blob()

        zip.file(fileName, blob)

        completed++
        setProgress(Math.round((completed / generatedDialogues.length) * 100))
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      saveAs(zipBlob, 'audios.zip')

      message.success('导出成功')
      setIsModalOpen(false)
    } catch (error: any) {
      message.error(error.message || '导出过程中发生错误')
    } finally {
      setIsExporting(false)
      setProgress(0)
    }
  }

  return (
    <>
      <Button
        icon={<DownloadOutlined />}
        onClick={() => setIsModalOpen(true)}
        disabled={generatedDialogues.length === 0}
      >
        导出音频
      </Button>

      <Modal
        title="导出音频"
        open={isModalOpen}
        onCancel={() => !isExporting && setIsModalOpen(false)}
        onOk={handleExport}
        confirmLoading={isExporting}
        cancelButtonProps={{ disabled: isExporting }}
        okText="确认导出"
        cancelText="取消"
      >
        <div className="py-4">
          <p className="mb-4">
            即将导出 {generatedDialogues.length} 个已生成的语音文件。
          </p>
          {/* 后续会增加模态框确定相关的内容 */}
          {isExporting && (
            <div className="mt-4">
              <Progress percent={progress} size="small" />
              <div className="mt-2 text-center text-xs text-slate-500">
                正在打包下载中，请稍候...
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
