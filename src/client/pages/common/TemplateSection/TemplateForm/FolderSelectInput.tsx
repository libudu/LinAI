import { AutoComplete, Form } from 'antd'
import { useMemo } from 'react'
import { useTemplates } from '../../../../hooks/useTemplates'

export function FolderFormItem({ className }: { className?: string }) {
  const { data: templates = [] } = useTemplates()

  const options = useMemo(() => {
    const folders = new Set<string>()
    templates.forEach((t) => {
      if (t.folder) {
        folders.add(t.folder)
      }
    })
    return Array.from(folders).map((folder) => ({ value: folder }))
  }, [templates])

  return (
    <Form.Item name="folder" label="分类" className={className}>
      <AutoComplete
        options={options}
        placeholder="输入或选择分类名称"
        allowClear
        filterOption={(inputValue, option) =>
          option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      />
    </Form.Item>
  )
}
