import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { LoginGate } from './components/LoginGate'
import './index.css'
import { installLoginRedirect } from './service/auth'

installLoginRedirect()

createRoot(document.getElementById('root')!).render(
  <LoginGate>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </LoginGate>,
)
