import { useEffect, useRef } from 'react'

const READ_ONLY_EXTENSIONS = new Set(['.pdf', '.docx'])

export function useAutoSave(filePath: string | null, content: string): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')

  useEffect(() => {
    if (!filePath || content === lastSavedRef.current) return

    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    if (READ_ONLY_EXTENSIONS.has(ext)) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        await window.electronAPI.writeFile(filePath, content)
        lastSavedRef.current = content
      } catch (err) {
        console.error('Auto-save failed:', err)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [filePath, content])
}
