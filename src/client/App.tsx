import { useEffect, useState, type CSSProperties } from 'react'
import { Route, Routes } from 'react-router-dom'
import pkg from '../../package.json'
import { useGptImageStore } from './pages/common/GenImage/store'
import { useVisionStore } from './pages/common/GenImage/visionStore'
import { openNotificationModal } from './pages/common/Notification'
import { Sidebar } from './pages/common/Sidebar'
import { appRoutes } from './routes'
import { useGlobalStore } from './store/global'
import { AppThemeProvider } from './theme'
import { isAdmin } from './utils/admin'

function App() {
  // 桌面端侧栏收起状态，收起后主内容留出更窄的间距
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    useGlobalStore.getState().fetchConfig()
    useGptImageStore.getState().fetchConfig()
    useVisionStore.getState().fetchConfig()

    // 检查版本号并弹出通知
    const currentVersion = pkg.version
    const storedVersion = localStorage.getItem('app_version')
    if (storedVersion !== currentVersion) {
      openNotificationModal()
      localStorage.setItem('app_version', currentVersion)
    }
  }, [])

  return (
    <AppThemeProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Main Content：桌面端为左侧导航栏留出宽度；--sidebar-w 供页面内子导航（如小说导航栏）贴住全局导航栏定位 */}
        <div
          className={`transition-[padding] ${
            sidebarCollapsed ? 'md:pl-16' : 'md:pl-56'
          }`}
          style={
            {
              '--sidebar-w': sidebarCollapsed ? '4rem' : '14rem',
            } as CSSProperties
          }
        >
          {/* main 默认布局（居中限宽 + 内边距）收敛到逐路由包裹，fullBleed 路由贴边自理 */}
          <main>
            <Routes>
              {appRoutes
                .filter(
                  (route) => !route.disabled && (!route.adminOnly || isAdmin()),
                )
                .map((route) => (
                  <Route
                    key={route.key}
                    path={route.path}
                    element={
                      route.fullBleed ? (
                        route.element
                      ) : (
                        <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
                          {route.element}
                        </div>
                      )
                    }
                  />
                ))}
            </Routes>
          </main>
        </div>
      </div>
    </AppThemeProvider>
  )
}

export default App
