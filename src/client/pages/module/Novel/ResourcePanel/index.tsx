import {
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  RobotOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Spin,
  Tooltip,
  Upload,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { REF_MAX_CHARS, REF_TOTAL_MAX_CHARS } from '../service/constants'
import { useNovelStore } from '../store'
import type { NovelRef, NovelSetting } from '../types'

// 新建书籍弹窗
const CreateNovelModal = ({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) => {
  const createNovel = useNovelStore((s) => s.createNovel)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const handleOk = async () => {
    if (!title.trim()) {
      message.warning('请输入书名')
      return
    }
    setSaving(true)
    const ok = await createNovel(title.trim())
    setSaving(false)
    if (ok) {
      setTitle('')
      onClose()
    }
  }

  return (
    <Modal
      title="新建书籍"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="创建"
      destroyOnHidden
    >
      <Input
        placeholder="书名"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onPressEnter={handleOk}
        maxLength={50}
      />
    </Modal>
  )
}

// 上传参考文弹窗（粘贴文本或导入 txt/md 文件，前端截取末尾后上传）
const RefUploadModal = ({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) => {
  const uploadRef = useNovelStore((s) => s.uploadRef)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleFile = async (file: File) => {
    const text = await file.text()
    setContent(text)
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
    return false // 阻止 antd 自动上传
  }

  const handleOk = async () => {
    if (!title.trim()) {
      message.warning('请输入标题')
      return
    }
    if (!content.trim()) {
      message.warning('内容不能为空')
      return
    }
    setSaving(true)
    const ok = await uploadRef(title.trim(), content)
    setSaving(false)
    if (ok) {
      setTitle('')
      setContent('')
      onClose()
    }
  }

  return (
    <Modal
      title="上传参考文"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="上传"
      width={640}
      destroyOnHidden
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
          />
          <Upload
            accept=".txt,.md"
            showUploadList={false}
            beforeUpload={handleFile}
          >
            <Button icon={<UploadOutlined />}>导入文件</Button>
          </Upload>
        </div>
        <Input.TextArea
          rows={10}
          placeholder="粘贴参考文内容（完结/连载中的参考作品、资料文档等）…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="text-xs text-slate-400">
          共 {content.length.toLocaleString()} 字
          {content.length > REF_MAX_CHARS && (
            <span className="text-amber-500">
              ，超过单篇上限，将只保留末尾 {REF_MAX_CHARS.toLocaleString()} 字
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}

// 参考文查看弹窗（参考文不支持编辑，仅查看/删除）
const RefViewModal = ({
  refItem,
  onClose,
}: {
  refItem: NovelRef | null
  onClose: () => void
}) => {
  const fetchRefContent = useNovelStore((s) => s.fetchRefContent)
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    setContent(null)
    if (refItem) {
      fetchRefContent(refItem.id).then((c) =>
        setContent(c ?? '（内容加载失败）'),
      )
    }
  }, [refItem, fetchRefContent])

  return (
    <Modal
      title={refItem?.title}
      open={!!refItem}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {content === null ? (
        <div className="py-8 text-center">
          <Spin />
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto text-sm break-words whitespace-pre-wrap">
          {content}
        </div>
      )}
    </Modal>
  )
}

// 核心设定 新增/编辑弹窗
const SettingEditModal = ({
  editing,
  onClose,
}: {
  editing: NovelSetting | 'new' | null
  onClose: () => void
}) => {
  const createSetting = useNovelStore((s) => s.createSetting)
  const editSetting = useNovelStore((s) => s.editSetting)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing === 'new') {
      setTitle('')
      setContent('')
    } else if (editing) {
      setTitle(editing.title)
      setContent(editing.content)
    }
  }, [editing])

  const handleOk = async () => {
    if (!title.trim()) {
      message.warning('请输入标题')
      return
    }
    setSaving(true)
    const ok =
      editing === 'new'
        ? await createSetting(title.trim(), content)
        : editing
          ? await editSetting(editing.id, { title: title.trim(), content })
          : false
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title={editing === 'new' ? '新增设定' : '编辑设定'}
      open={!!editing}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="保存"
      width={640}
      destroyOnHidden
    >
      <div className="space-y-3">
        <Input
          placeholder="标题，如「世界观」「角色：xx」"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
        />
        <Input.TextArea
          rows={10}
          placeholder="设定内容…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </Modal>
  )
}

const SectionHeader = ({
  title,
  extra,
}: {
  title: string
  extra?: React.ReactNode
}) => (
  <div className="mb-2 flex items-center justify-between">
    <span className="text-sm font-medium text-slate-600">{title}</span>
    <div className="flex items-center gap-1">{extra}</div>
  </div>
)

export const ResourcePanel = () => {
  const {
    novels,
    currentNovelId,
    currentNovel,
    loadingNovels,
    selectNovel,
    removeNovel,
    removeRef,
    removeSetting,
    openDrawer,
    streaming,
    abortGeneration,
  } = useNovelStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [refUploadOpen, setRefUploadOpen] = useState(false)
  const [viewRef, setViewRef] = useState<NovelRef | null>(null)
  const [editingSetting, setEditingSetting] = useState<
    NovelSetting | 'new' | null
  >(null)

  const refs = currentNovel?.refs ?? []
  const settings = currentNovel?.settings ?? []
  const totalRefChars = refs.reduce((sum, r) => sum + r.storedLength, 0)

  return (
    <div className="space-y-4">
      {/* 书籍切换 */}
      <div className="flex items-center gap-1.5">
        <Select
          className="min-w-0 flex-1"
          placeholder="选择书籍"
          value={currentNovelId}
          loading={loadingNovels}
          onChange={(v: string) => selectNovel(v)}
          options={novels.map((n) => ({
            value: n.id,
            label: `${n.title}（${n.chapterCount} 章）`,
          }))}
        />
        <Tooltip title="新建书籍">
          <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />
        </Tooltip>
        {currentNovelId && (
          <Popconfirm
            title="删除整本书？"
            description="包含全部章节、设定与参考文，不可恢复"
            onConfirm={() => removeNovel(currentNovelId)}
          >
            <Tooltip title="删除书籍">
              <Button danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        )}
      </div>

      {!currentNovel ? (
        <Empty
          className="py-8"
          description="请新建或选择一本书"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          {/* 参考文 */}
          <div>
            <SectionHeader
              title={`参考文（${refs.length}）`}
              extra={
                <Tooltip title="上传参考文">
                  <Button
                    size="small"
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={() => setRefUploadOpen(true)}
                  />
                </Tooltip>
              }
            />
            <div className="mb-2">
              <Progress
                percent={Math.min(
                  100,
                  (totalRefChars / REF_TOTAL_MAX_CHARS) * 100,
                )}
                size="small"
                showInfo={false}
              />
              <div className="mt-0.5 text-xs text-slate-400">
                累计 {totalRefChars.toLocaleString()} /{' '}
                {REF_TOTAL_MAX_CHARS.toLocaleString()} 字
              </div>
            </div>
            <div className="space-y-1.5">
              {refs.map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      title={ref.title}
                    >
                      {ref.title}
                    </span>
                    <div className="flex shrink-0 items-center">
                      <Tooltip title="查看内容">
                        <Button
                          size="small"
                          type="text"
                          icon={<EyeOutlined />}
                          onClick={() => setViewRef(ref)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="删除该参考文？"
                        onConfirm={() => removeRef(ref.id)}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {ref.storedLength.toLocaleString()} 字
                    {ref.truncated && (
                      <span className="ml-1 text-amber-500">
                        已截断：原 {ref.originalLength.toLocaleString()} 字 →
                        取末尾 {ref.storedLength.toLocaleString()} 字
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {refs.length === 0 && (
                <div className="py-2 text-xs text-slate-400">
                  暂无参考文，可在生成设定/大纲时作为参考材料勾选
                </div>
              )}
            </div>
          </div>

          {/* 核心设定 */}
          <div>
            <SectionHeader
              title={`核心设定（${settings.length}）`}
              extra={
                <>
                  <Tooltip title="手动新增">
                    <Button
                      size="small"
                      type="text"
                      icon={<PlusOutlined />}
                      onClick={() => setEditingSetting('new')}
                    />
                  </Tooltip>
                  <Tooltip title="AI 生成设定（勾选参考文 + 自由要求）">
                    <Button
                      size="small"
                      type="text"
                      icon={<RobotOutlined />}
                      onClick={() => openDrawer({ kind: 'setting' })}
                    />
                  </Tooltip>
                </>
              }
            />
            <div className="space-y-1.5">
              {streaming?.target === 'setting' && (
                <div className="rounded-md border border-[#EC883A]/60 bg-orange-50 px-2.5 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>设定生成中…</span>
                    <Button
                      size="small"
                      type="text"
                      danger
                      onClick={abortGeneration}
                    >
                      中断
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto text-xs break-words whitespace-pre-wrap text-slate-600">
                    {streaming.text || '等待响应…'}
                  </div>
                </div>
              )}
              {settings.map((setting) => (
                <div
                  key={setting.id}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="min-w-0 flex-1 cursor-pointer truncate text-sm hover:text-[#EC883A]"
                      title="点击编辑"
                      onClick={() => setEditingSetting(setting)}
                    >
                      {setting.title}
                    </span>
                    <Popconfirm
                      title="删除该设定？"
                      onConfirm={() => removeSetting(setting.id)}
                    >
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  </div>
                  <div
                    className="mt-0.5 line-clamp-3 cursor-pointer text-xs break-words whitespace-pre-wrap text-slate-500"
                    onClick={() => setEditingSetting(setting)}
                  >
                    {setting.content}
                  </div>
                </div>
              ))}
              {settings.length === 0 && streaming?.target !== 'setting' && (
                <div className="py-2 text-xs text-slate-400">
                  暂无设定，可手动新增或用 AI 基于参考文生成
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <CreateNovelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <RefUploadModal
        open={refUploadOpen}
        onClose={() => setRefUploadOpen(false)}
      />
      <RefViewModal refItem={viewRef} onClose={() => setViewRef(null)} />
      <SettingEditModal
        editing={editingSetting}
        onClose={() => setEditingSetting(null)}
      />
    </div>
  )
}
