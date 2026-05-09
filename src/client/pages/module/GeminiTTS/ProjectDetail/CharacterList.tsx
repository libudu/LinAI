import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleFilled,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Card, Form, Input, Modal, Select, Tag } from 'antd'
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { GeminiTTSCharacter } from '../../../../../server/module/gemini-tts'
import { voiceList } from './voiceConfig'

const { confirm } = Modal
const { Option } = Select

interface CharacterListProps {
  characters: GeminiTTSCharacter[]
  onUpdateCharacters: (characters: GeminiTTSCharacter[]) => void
}

export const CharacterList = ({
  characters = [],
  onUpdateCharacters,
}: CharacterListProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] =
    useState<GeminiTTSCharacter | null>(null)
  const [form] = Form.useForm()

  const handleOpenModal = (character?: GeminiTTSCharacter) => {
    if (character) {
      setEditingCharacter(character)
      form.setFieldsValue(character)
    } else {
      setEditingCharacter(null)
      form.resetFields()
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCharacter(null)
    form.resetFields()
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      const selectedVoice = voiceList.find((v) => v.name === values.voiceName)
      const characterData = {
        ...values,
        gender: selectedVoice?.gender || '男',
      }

      let newCharacters
      if (editingCharacter) {
        newCharacters = characters.map((c) =>
          c.id === editingCharacter.id ? { ...c, ...characterData } : c,
        )
      } else {
        newCharacters = [...characters, { id: uuidv4(), ...characterData }]
      }

      onUpdateCharacters(newCharacters)
      handleCloseModal()
    })
  }

  const handleDelete = (id: string) => {
    confirm({
      title: '确定要删除该人物吗？',
      icon: <ExclamationCircleFilled />,
      content: '删除后，已使用该人物的对话将无法生成语音。',
      onOk: () => {
        const newCharacters = characters.filter((c) => c.id !== id)
        onUpdateCharacters(newCharacters)
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">人物列表</h3>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加人物
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {characters.map((character) => (
          <Card
            key={character.id}
            hoverable
            size="small"
            actions={[
              <EditOutlined
                key="edit"
                onClick={() => handleOpenModal(character)}
              />,
              <DeleteOutlined
                key="delete"
                className="text-red-500"
                onClick={() => handleDelete(character.id)}
              />,
            ]}
          >
            <Card.Meta
              title={
                <div className="flex items-center justify-between">
                  <span>{character.name}</span>
                  <Tag
                    color={character.gender === '男' ? 'cyan' : 'magenta'}
                    className="m-0 border-0"
                  >
                    {character.gender}
                  </Tag>
                </div>
              }
              description={
                <div className="mt-2 space-y-2">
                  <div>
                    <Tag color="blue" className="border-0">
                      音色: {character.voiceName}
                    </Tag>
                  </div>
                  <div className="line-clamp-2 h-8 text-xs text-slate-500">
                    {character.description || '暂无描述'}
                  </div>
                </div>
              }
            />
          </Card>
        ))}
        {characters.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400">
            暂无人物，请先添加人物
          </div>
        )}
      </div>

      <Modal
        title={editingCharacter ? '编辑人物' : '添加人物'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSave}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="人物名称"
            rules={[{ required: true, message: '请输入人物名称' }]}
          >
            <Input placeholder="例如：旁白、小明" />
          </Form.Item>

          <Form.Item
            name="voiceName"
            label="分配音色"
            rules={[{ required: true, message: '请选择音色' }]}
          >
            <Select
              placeholder="请选择音色"
              optionLabelProp="label"
              dropdownMatchSelectWidth={false}
            >
              {voiceList.map((item) => (
                <Option key={item.name} value={item.name} label={item.name}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{item.name}</span>
                    <div className="flex gap-1">
                      <Tag color="blue" className="m-0 border-0">
                        {item.voice}
                      </Tag>
                      <Tag
                        color={item.gender === '男' ? 'cyan' : 'magenta'}
                        className="m-0 border-0"
                      >
                        {item.gender}
                      </Tag>
                    </div>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="description" label="人物描述（可选）">
            <Input.TextArea placeholder="请输入人物描述，帮助记忆" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
