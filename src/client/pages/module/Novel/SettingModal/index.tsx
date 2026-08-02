import { Form, Input, InputNumber, message } from 'antd'
import { createRef, forwardRef, useEffect, useImperativeHandle } from 'react'
import { openCommonSettingModal } from '../../../common/components/SettingModal'
import { DEFAULT_RECENT_FULL_CHAPTERS } from '../service/constants'
import { useNovelStore } from '../store'
import { useNovelConfig } from './useNovelConfig'

interface NovelSettingRef {
  save: () => Promise<string | undefined>
}

const NovelSetting = forwardRef<NovelSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { novelApiKey, novelBaseUrl, novelModelId, setNovelConfig } =
    useNovelConfig()
  const { currentNovel, updateNovelMeta } = useNovelStore()

  useEffect(() => {
    form.setFieldsValue({
      apiKey: novelApiKey || '',
      baseUrl: novelBaseUrl || 'https://api.deepseek.com',
      modelId: novelModelId || 'deepseek-chat',
      recentFullChapters:
        currentNovel?.recentFullChapters ?? DEFAULT_RECENT_FULL_CHAPTERS,
    })
  }, [novelApiKey, novelBaseUrl, novelModelId, currentNovel, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }
      await setNovelConfig(
        values.apiKey,
        values.baseUrl || null,
        values.modelId || null,
      )
      // N 值存在书上而不是全局 config：仅当当前有打开的书时一并保存
      if (
        currentNovel &&
        values.recentFullChapters !== currentNovel.recentFullChapters
      ) {
        await updateNovelMeta(currentNovel.id, {
          recentFullChapters: values.recentFullChapters,
        })
      }
      message.success('配置保存成功')
      return values.apiKey as string
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="apiKey"
          label="API Key"
          extra="DeepSeek 官方 key，或云雾等 OpenAI 兼容中转的 key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="输入 API Key" />
        </Form.Item>
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[{ required: true, message: '请输入 Base URL' }]}
        >
          <Input placeholder="https://api.deepseek.com" />
        </Form.Item>
        <Form.Item
          name="modelId"
          label="模型 ID"
          rules={[{ required: true, message: '请输入模型 ID' }]}
        >
          <Input placeholder="deepseek-chat" />
        </Form.Item>
        <Form.Item
          name="recentFullChapters"
          label="默认携带最近几章全文（0-20）"
          extra={
            currentNovel
              ? `作用于当前书《${currentNovel.title}》，该值随书保存`
              : '该设置随书保存，打开一本书后才能在保存时生效'
          }
        >
          <InputNumber
            className="w-full"
            min={0}
            max={20}
            disabled={!currentNovel}
          />
        </Form.Item>
      </Form>
    </div>
  )
})

// 打开小说生成设置弹窗（单标签形式，不显示标签页）
export function openNovelSettingModal() {
  const novelRef = createRef<NovelSettingRef>()
  openCommonSettingModal({
    title: '小说生成设置',
    tabs: [
      {
        key: 'novel',
        label: '小说配置',
        children: <NovelSetting ref={novelRef} />,
        onSave: () => novelRef.current!.save(),
      },
    ],
  })
}
