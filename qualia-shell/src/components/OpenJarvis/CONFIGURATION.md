# OpenJarvis Configuration

> Locked configuration for the OpenJarvis AI assistant widget.
> These values must be preserved exactly for reproducible builds.

## Defaults

| Setting | Value | Storage Key |
|---------|-------|-------------|
| API Base URL | `http://127.0.0.1:3000` | `dwellium-jarvis-api-base` |
| Model | `gpt-4o-mini` | `dwellium-jarvis-model` |
| ARA Mode | `chief-of-staff` | hardcoded in `streamChat()` |
| Health Check Interval | 30 seconds | `HEALTH_CHECK_INTERVAL` const |
| Auth Token | `dwellium-auth-token` (localStorage) | standard Dwellium auth |

## Valid ARA Modes

The backend ARA endpoint (`/api/ara/chat`) accepts these modes only:

- `chief-of-staff` ← **default for Jarvis**
- `clinical-analyst`
- `lead-counsel`
- `diplomat`
- `devils-advocate`
- `strategic-architect`
- `creative-partner`
- `confidant`

> ⚠️ `general` is NOT a valid mode. Do not use it.

## Connection Status Indicator

The widget shows a live status dot:

| Color | Class | Meaning |
|-------|-------|---------|
| 🟢 Green | `.oj-status-dot-connected` | Backend reachable (`/health` returns 200) |
| 🔴 Red | `.oj-status-dot-disconnected` | Backend unreachable |
| 🟡 Amber | `.oj-status-dot-checking` | Initial check in progress (pulsing) |

Dot appears in two places:
1. **FAB button** — absolute-positioned, bottom-right of the ✦ circle
2. **Panel header** — inline next to "Jarvis" title

## Files

```
qualia-shell/src/components/OpenJarvis/
├── OpenJarvis.tsx    # Main widget (chat, health check, status dot, settings)
├── OpenJarvis.css    # All styles including status dot variants
└── index.ts          # Re-export
```

## Dependencies (pinned in package.json)

```json
{
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "react-markdown": "10.1.0",
  "remark-gfm": "4.0.1"
}
```

## API Integration

### Primary: ARA Chat
```
POST /api/ara/chat
Headers: Authorization: Bearer <dwellium-auth-token>
Body: { "mode": "chief-of-staff", "message": "<user input>" }
Response: { "data": { "content": "..." } }
```

### Fallback: OpenAI-compatible
```
POST /v1/chat/completions
Headers: Authorization: Bearer <dwellium-auth-token>
Body: { "model": "gpt-4o-mini", "messages": [...], "stream": true }
Response: SSE stream
```

### Health Check
```
GET /health
Response: { "status": "ok", ... }
```

## Build Requirements

- Node ≥ 25.5.0, npm ≥ 11.8.0
- Backend running on port 3000 (`AUTH_ENABLED=true`)
- Frontend: `cd qualia-shell && npm install && npm run dev` (port 5173)
