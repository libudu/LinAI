import { useEffect } from 'react'

interface ShortcutHandlers {
  onClear: () => void
  onSkip: () => void
  onConfirm: () => void
  disabled?: boolean
}

export function useConfirmShortcuts({
  onClear,
  onSkip,
  onConfirm,
  disabled = false,
}: ShortcutHandlers) {
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target instanceof HTMLInputElement &&
            !['radio', 'checkbox'].includes(target.type)))
      ) {
        return
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        onClear()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSkip()
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault()
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onClear, onConfirm, onSkip])
}
