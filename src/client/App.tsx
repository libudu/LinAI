import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import pkg from '../../package.json'
import { openNotificationModal } from './pages/common/Notification'
import { Sidebar } from './pages/common/Sidebar'
import { appRoutes } from './routes'
import { useGlobalStore } from './store/global'
import { isAdmin } from './utils/admin'

function App() {
  // 桌面端侧栏收起状态，收起后主内容留出更窄的间距
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#EC883A',
        },
        components: {
          Tooltip: {
            maxWidth: 500,
          },
        },
      }}
    >
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Main Content：桌面端为左侧导航栏留出宽度 */}
        <div
          className={`transition-[padding] ${
            sidebarCollapsed ? 'md:pl-16' : 'md:pl-56'
          }`}
        >
          <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
            <Routes>
              {appRoutes
                .filter(
                  (route) =>
                    !route.disabled && (!route.adminOnly || isAdmin()),
                )
                .map((route) => (
                  <Route
                    key={route.key}
                    path={route.path}
                    element={route.element}
                  />
                ))}
            </Routes>
          </main>
        </div>
      </div>
    </ConfigProvider>
  )
}

export default App
