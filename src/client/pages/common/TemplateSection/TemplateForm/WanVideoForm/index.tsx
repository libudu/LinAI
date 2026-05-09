import { Button } from 'antd'
import { useState } from 'react'
import { WanPreview } from './WanPreview'
import { WanTaskModal } from './WanTaskModal'

export function WanVideoForm() {
  const [modalVisible, setModalVisible] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <WanPreview />

      <div className="flex justify-end">
        <Button type="primary" onClick={() => setModalVisible(true)}>
          从 Wan 官网任务创建模板
        </Button>
      </div>

      <WanTaskModal
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onSelect={(task) => {
          console.log('选择了任务', task)
          setModalVisible(false)
        }}
      />
    </div>
  )
}
