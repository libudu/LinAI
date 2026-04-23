import { WanPreview } from './module/WanSection/WanPreview'
import { GPTImagePreview } from './module/GPTImageSection/GPTImagePreview'
import { TemplateSection } from './common/TemplateSection'
import { TaskList } from './common/TaskList'
import { ThunderboltOutlined } from '@ant-design/icons'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xl leading-none">W</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            LinAI：集成编排 AI 任务
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">
        {/* 快捷入口 */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600 flex items-center justify-center">
              <ThunderboltOutlined className="text-xl" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              快捷入口
            </h2>
          </div>

          {/* 单独占一行的任务列表 */}
          <div className="w-full mt-6">
            <TaskList />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <GPTImagePreview />
            <WanPreview />
            {/* <GeminiSection /> */}
          </div>
        </section>

        {/* 任务编排 */}
        <TemplateSection />
      </main>
    </div>
  )
}

export default App
