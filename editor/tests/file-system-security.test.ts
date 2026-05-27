import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DEFAULT_CONFIG, saveConfig } from '../src/main/config'
import {
  readFileFromDisk,
  resolveDroppedPaths,
  writeFileToDisk,
} from '../src/main/fileSystem'

let workspaceRoot = ''
let outsideRoot = ''

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenteryx-workspace-'))
  outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenteryx-outside-'))
  saveConfig({
    ...DEFAULT_CONFIG,
    holocronRoot: workspaceRoot,
    projectsRoot: workspaceRoot,
    workspace: { path: workspaceRoot },
  })
})

describe('file system IPC guardrails', () => {
  it('allows reads and writes inside configured roots', async () => {
    const filePath = path.join(workspaceRoot, 'note.md')

    await expect(writeFileToDisk(filePath, '# Inside\n')).resolves.toEqual({ ok: true })
    await expect(readFileFromDisk(filePath)).resolves.toMatchObject({
      content: '# Inside\n',
      filePath,
    })
  })

  it('denies unapproved reads and writes outside configured roots', async () => {
    const filePath = path.join(outsideRoot, 'outside.md')
    fs.writeFileSync(filePath, '# Outside\n')

    await expect(readFileFromDisk(filePath)).rejects.toThrow('File access denied')
    await expect(writeFileToDisk(filePath, '# Changed\n')).rejects.toThrow('File write denied')
  })

  it('allows read access after an explicit drop approval but still denies writes', async () => {
    const filePath = path.join(outsideRoot, 'dropped.md')
    fs.writeFileSync(filePath, '# Dropped\n')

    await expect(resolveDroppedPaths([filePath])).resolves.toEqual({ resolvedPaths: [filePath] })
    await expect(readFileFromDisk(filePath)).resolves.toMatchObject({ content: '# Dropped\n' })
    await expect(writeFileToDisk(filePath, '# Changed\n')).rejects.toThrow('File write denied')
  })
})
