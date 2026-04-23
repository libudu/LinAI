import { WanPreview } from './module/WanSection/WanPreview'
import { GPTImagePreview } from './module/GPTImageSection/GPTImagePreview'
import { TemplateSection } from './common/TemplateSection'
import { TaskList } from './common/TaskList'
import { ScheduleOutlined } from '@ant-design/icons'
import { ThunderboltOutlined } from '@ant-design/icons'
import { Header } from './common/Header'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <Header />

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 pt-0 space-y-4">
        {/* 任务编排 */}
        <div className="flex items-center gap-2 mt-4">
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 flex items-center justify-center">
            <ThunderboltOutlined className="text-xl" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            快速开始
          </h2>
        </div>

        <TemplateSection />

        <div className="flex items-center gap-2 mt-4">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600 flex items-center justify-center">
            <ScheduleOutlined className="text-xl" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            任务列表
          </h2>
        </div>

        <section className="space-y-4">
          {/* 单独占一行的任务列表 */}
          <TaskList />

          {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <GPTImagePreview />
            <WanPreview />
          </div> */}
        </section>
      </main>
    </div>
  )
}

export default App
