import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        deep: '#0a0a0f',
        panel: '#0d0d14'
      },
      animation: {
        'bounce-dot': 'bounce 0.8s infinite'
      }
    }
  },
  plugins: []
}

export default config
