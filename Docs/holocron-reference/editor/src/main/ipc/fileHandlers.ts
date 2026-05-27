import { ipcMain, shell } from 'electron'
import {
  openFileDialog,
  readFileAsBuffer,
  readFileFromDisk,
  resolveDroppedPaths,
  writeFileToDisk,
} from '../fileSystem'

export function registerFileIpcHandlers(): void {
  ipcMain.handle('file:open-dialog', (_, args?: { defaultPath?: string }) =>
    openFileDialog(args?.defaultPath)
  )
  ipcMain.handle('file:read', (_, args: { filePath: string }) =>
    readFileFromDisk(args.filePath)
  )
  ipcMain.handle('file:write', (_, args: { filePath: string; content: string }) =>
    writeFileToDisk(args.filePath, args.content)
  )
  ipcMain.handle('file:drop-resolve', (_, args: { paths: string[] }) =>
    resolveDroppedPaths(args.paths)
  )
  ipcMain.handle('file:read-buffer', (_, args: { filePath: string }) =>
    readFileAsBuffer(args.filePath)
  )
  ipcMain.handle('shell:reveal', (_, args: { filePath: string }) => {
    shell.showItemInFolder(args.filePath)
  })
}
