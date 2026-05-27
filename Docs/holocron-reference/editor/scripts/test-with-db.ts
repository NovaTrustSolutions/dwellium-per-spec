import { spawn } from 'child_process'
import * as net from 'net'
import * as path from 'path'

const PORT = Number(process.env.HOLOCRON_TEST_DB_PORT ?? '5433')
const DB_URI = process.env.HOLOCRON_TEST_DB_URI ?? `postgresql://postgres:postgres@localhost:${PORT}/holocron_rag_test`
const ROOT = path.resolve(__dirname, '..')

function run(cmd: string, args: string[], env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...env },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' && cmd === 'docker') {
        reject(new Error('Docker CLI not found. Install Docker Desktop or set HOLOCRON_TEST_DB_URI and run npm run test:run against an existing Postgres test database.'))
        return
      }
      reject(err)
    })
    child.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))
    })
  })
}

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Postgres on 127.0.0.1:${port}`))
        } else {
          setTimeout(attempt, 500)
        }
      })
    }
    attempt()
  })
}

async function main(): Promise<void> {
  await run('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', 'test-postgres'])
  await waitForPort(PORT)
  await run('npx', ['vitest', 'run'], {
    ...process.env,
    HOLOCRON_TEST_DB_URI: DB_URI,
    HOLOCRON_DB_URI: DB_URI,
  })
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
