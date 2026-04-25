import { useEffect } from 'react'
// import { WanPreview } from './module/WanSection/WanPreview'
// import { GPTImagePreview } from './module/GPTImageSection/GPTImagePreview'
import { TemplateSection } from './common/TemplateSection'
import { TaskList } from './common/TaskList'
import { ThunderboltOutlined } from '@ant-design/icons'
import { Header } from './common/Header'
import { useGlobalStore } from './store/global'
import { openNotificationModal } from './common/Notification'
import pkg from '../../package.json'

function App() {
  useEffect(() => {
    useGlobalStore.getState().fetchConfig()

    // 检查版本号并弹出通知
    const currentVersion = pkg.version
    const storedVersion = localStorage.getItem('app_version')
    if (storedVersion !== currentVersion) {
      openNotificationModal()
      localStorage.setItem('app_version', currentVersion)
    }
  }, [])

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
