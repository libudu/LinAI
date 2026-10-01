import type { TemplateValue } from '@/shared/image/template'

/** 参考图由独立上传状态管理；张数输入框清空时会返回 null */
export type TemplateFormValues = Omit<TemplateValue, 'images' | 'n'> & {
  n?: TemplateValue['n'] | null
}

/** 新建、编辑和另存共用的业务字段转换，不携带表单外的元数据 */
export const toTemplateValue = (
  values: TemplateFormValues,
  images: TemplateValue['images'],
): TemplateValue => ({
  title: values.title,
  prompt: values.prompt,
  aspectRatio: values.aspectRatio,
  folder: values.folder,
  n: values.n ?? undefined,
  images,
})
