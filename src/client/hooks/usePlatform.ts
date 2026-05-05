import { useEventListener } from 'ahooks'
import { useState } from 'react'

const MD_BREAKPOINT = 768

export function usePlatform() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < MD_BREAKPOINT
    }
    return false
  })

  useEventListener('resize', () => {
    setIsMobile(window.innerWidth < MD_BREAKPOINT)
  })

  return {
    isMobile,
    isDesktop: !isMobile,
  }
}
