import { createRoot } from 'react-dom/client'
import { Login } from './pages/common/Login'
import { AppThemeProvider } from './theme'

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <Login />
  </AppThemeProvider>,
)
