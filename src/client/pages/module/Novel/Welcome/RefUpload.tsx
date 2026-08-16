import { FileTextOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Input, Modal, Upload, message } from 'antd'
import { useState } from 'react'
import { NovelArtifactCard } from '../components/NovelArtifactCard'
import { REF_MAX_CHARS } from '../service/constants'

// 待上传的参考文（小说创建前先暂存在本地）
export interface PendingRef {
  title: string
  content: string
}

// 粘贴参考文弹窗（写入本地暂存列表，提交时随小说一起落盘）
const PasteRefModal = ({
  open,
  onAdd,
  onClose,
}: {
  open: boolean
  onAdd: (ref: PendingRef) => void
  onClose: () => void
}) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const handleOk = () => {
    if (!title.trim()) {
      message.warning('请输入标题')
      return
    }
    if (!content.trim()) {
      message.warning('内容不能为空')
      return
    }
    onAdd({ title: title.trim(), content })
    setTitle('')
    setContent('')
    onClose()
  }

  return (
    <Modal
      title="粘贴参考文"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="添加"
      width={640}
      destroyOnHidden
    >
      <div className="space-y-3">
        <Input
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
        />
        <Input.TextArea
          rows={10}
          placeholder="粘贴参考文内容（完结/连载中的参考作品、资料文档等）…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="text-xs text-slate-400">
          共 {content.length.toLocaleString()} 字
        </div>
      </div>
    </Modal>
  )
}

// 参考上传：导入 txt/md 文件或粘贴文本，暂存在本地，随小说一起创建
export const RefUpload = ({
  refs,
  onChange,
}: {
  refs: PendingRef[]
  onChange: (refs: PendingRef[]) => void
}) => {
  const [pasteOpen, setPasteOpen] = useState(false)

  // 导入 txt/md 文件，直接加入暂存列表（标题取文件名）
  const handleFile = async (file: File) => {
    const content = await file.text()
    onChange([...refs, { title: file.name.replace(/\.[^.]+$/, ''), content }])
    return false // 阻止 antd 自动上传
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">
          参考上传（可选）
        </span>
        <div className="flex gap-2">
          <Upload
            accept=".txt,.md"
            showUploadList={false}
            beforeUpload={handleFile}
            multiple
          >
            <Button size="small" icon={<UploadOutlined />}>
              导入文件
            </Button>
          </Upload>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => setPasteOpen(true)}
          >
            粘贴文本
          </Button>
        </div>
      </div>
      {refs.length === 0 ? (
        <div className="py-2 text-xs text-slate-400">
          暂无参考文，可在生成时作为参考材料（完结/连载中的参考作品、资料文档等）
        </div>
      ) : (
        <div className="space-y-1.5">
          {refs.map((ref, i) => (
            <NovelArtifactCard
              key={`${ref.title}-${i}`}
              title={ref.title}
              content={ref.content}
              warning={
                ref.content.length > REF_MAX_CHARS
                  ? `上传时将截取末尾 ${REF_MAX_CHARS.toLocaleString()} 字`
                  : undefined
              }
              onDelete={() => onChange(refs.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      <PasteRefModal
        open={pasteOpen}
        onAdd={(ref) => onChange([...refs, ref])}
        onClose={() => setPasteOpen(false)}
      />
    </section>
  )
}
