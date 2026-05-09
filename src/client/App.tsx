import { ConfigProvider } from 'antd'
import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import pkg from '../../package.json'
import { Header } from './pages/common/Header'
import { openNotificationModal } from './pages/common/Notification'
import { appRoutes } from './routes'
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
          <Routes>
            {appRoutes.map((route) => (
              <Route
                key={route.key}
                path={route.path}
                element={route.element}
              />
            ))}
          </Routes>
        </main>
      </div>
    </ConfigProvider>
  )
}

export default App
