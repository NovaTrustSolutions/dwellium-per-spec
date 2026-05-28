import { useEffect, useState } from 'react'

interface Props {
  filePath: string
}

export function PDFViewer({ filePath }: Props): JSX.Element {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    setError(null)
    setBlobUrl(null)

    window.electronAPI.readFileAsBuffer(filePath)
      .then(({ base64 }) => {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/pdf' })
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      })
      .catch((err: Error) => {
        setError(`Could not load PDF: ${err.message}`)
      })

    return () => { if (url) URL.revokeObjectURL(url) }
  }, [filePath])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#141414' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
        borderBottom: '1px solid #1e1e1e', flexShrink: 0,
        backgroundColor: '#0a0a0a',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          color: '#ff6b6b', background: 'rgba(255,107,107,0.12)',
          borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace',
        }}>
          READ-ONLY
        </span>
        <span style={{
          fontSize: 11, color: '#4a4a5a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {filePath.split('/').pop()}
        </span>
      </div>

      {error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>
        </div>
      ) : !blobUrl ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#4a4a5a', fontSize: 13 }}>Loading PDF…</p>
        </div>
      ) : (
        <iframe
          src={blobUrl}
          style={{ flex: 1, border: 'none', backgroundColor: '#141414' }}
          title="PDF Viewer"
        />
      )}
    </div>
  )
}
