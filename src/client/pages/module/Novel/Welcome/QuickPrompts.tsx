import { Button } from 'antd'

// 快捷按钮的预制提示词：点击填入下方「用户要求」输入框。
// 条目围绕「已上传的参考文」设计，提示词中明确要求 AI 结合参考文产出
const PRESET_PROMPTS: { label: string; text: string }[] = [
  {
    label: '原文续写',
    text: '续写我上传的参考文：情节从原文结尾处自然承接，不留断层；严格延续原作的世界观、角色性格与关系走向，不 OOC；模仿原作者的叙事口吻、句式节奏与用词习惯，让读者察觉不到换了执笔人。直接续写正文，不要总结原文，不要另起炉灶。',
  },
  {
    label: '角色扮演',
    text: '以角色扮演的方式创作：挑选我上传参考文中最具魅力的角色，深度代入其性格、口癖、价值观与行事逻辑，围绕该角色展开一段全新剧情。角色的每一句台词、每个抉择都必须贴合原作人设，通过细节刻画与对手戏充分展现角色魅力，严禁 OOC。',
  },
  {
    label: '性癖分析',
    text: '分析我上传参考文中的性癖（XP）元素：逐条拆解作品呈现了哪些性癖类型，各自对应哪些具体桥段与描写手法；分析作者如何铺垫、渲染与收束，为什么能精准戳中读者。输出一份条理清晰的分析报告，并在结尾总结可复用到自己创作中的写作技巧。',
  },
  {
    label: '风格拆解',
    text: '拆解我上传参考文的写作风格：从叙事视角、句式长短与节奏、用词偏好、对话与描写的比例、情绪渲染手法、章节结构与钩子设计等维度逐项分析，每个结论都附原文例句佐证。最后汇总成一份可执行的风格模仿指南，供后续仿写同一文风时使用。',
  },
]

// 快捷按钮区：一键把预制提示词填入「用户要求」输入框
export const QuickPrompts = ({
  onSelect,
}: {
  onSelect: (text: string) => void
}) => {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 text-sm font-medium text-slate-600">快捷按钮</div>
      <div className="flex flex-wrap gap-2">
        {PRESET_PROMPTS.map((p) => (
          <Button key={p.label} onClick={() => onSelect(p.text)}>
            {p.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
