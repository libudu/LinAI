import { useEffect } from 'react'
// import { WanPreview } from './module/WanSection/WanPreview'
import { ConfigProvider } from 'antd'
import pkg from '../../package.json'
import { Header } from './common/Header'
import { openNotificationModal } from './common/Notification'
import { TaskList } from './common/TaskList'
import { TemplateSection } from './common/TemplateSection'
import { useGlobalStore } from './store/global'

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
    <ConfigProvider
      theme={{
        components: {
          Tooltip: {
            maxWidth: 500,
          },
        },
      }}
    >
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
        <Header />

        {/* Main Content */}
        <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
          <TemplateSection />

          <section className="space-y-4">
            {/* 单独占一行的任务列表 */}
            <TaskList />

            {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <WanPreview />
          </div> */}
          </section>
        </main>
      </div>
    </ConfigProvider>
  )
}

export default App
