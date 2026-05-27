import fs from 'fs'
import path from 'path'
import type { HolocronConfig } from './config'

const DEFAULT_PROJECT_NAME = 'Default'

interface MigrationOutcome {
  changed: boolean
  config: HolocronConfig
}

/**
 * If the user has an existing flat-Sessions setup (`holocronRoot` set, `projectsRoot` empty),
 * derive a `projectsRoot` (sibling folder named "Projects"), create a "Default" project inside it,
 * and move existing session subfolders in as threads. If the derived projectsRoot already exists,
 * just adopt it without moving anything.
 *
 * Defensive: never throws. Per-folder failures are logged and skipped.
 */
export async function runProjectsMigration(input: HolocronConfig): Promise<MigrationOutcome> {
  const config = { ...input }

  // Already migrated.
  if (config.projectsRoot) {
    console.log(`[Projects] projectsRoot already set: ${config.projectsRoot}`)
    return { changed: false, config }
  }

  // Nothing to migrate from.
  if (!config.holocronRoot) {
    console.log('[Projects] no holocronRoot configured; skipping migration')
    return { changed: false, config }
  }

  // Verify holocronRoot still exists.
  try {
    const stat = await fs.promises.stat(config.holocronRoot)
    if (!stat.isDirectory()) {
      console.log(`[Projects] holocronRoot is not a directory: ${config.holocronRoot}`)
      return { changed: false, config }
    }
  } catch {
    console.log(`[Projects] holocronRoot missing on disk: ${config.holocronRoot}`)
    return { changed: false, config }
  }

  const desiredRoot = path.join(path.dirname(config.holocronRoot), 'Projects')
  const desiredRootExists = await pathIsDir(desiredRoot)

  if (desiredRootExists) {
    // Adopt the existing folder without moving anything.
    config.projectsRoot = desiredRoot
    console.log(`[Projects] adopted existing projectsRoot: ${desiredRoot}`)
    await reflectActiveSessionAsThread(config, desiredRoot)
    return { changed: true, config }
  }

  // Create projectsRoot/Default and migrate subfolders.
  const defaultProjectPath = path.join(desiredRoot, DEFAULT_PROJECT_NAME)
  try {
    await fs.promises.mkdir(defaultProjectPath, { recursive: true })
  } catch (err) {
    console.error('[Projects] failed to create Default project folder:', (err as Error).message)
    return { changed: false, config }
  }

  // Move every direct subdirectory of holocronRoot into Default/.
  let moved = 0
  let skipped = 0
  try {
    const entries = await fs.promises.readdir(config.holocronRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      const src = path.join(config.holocronRoot, entry.name)
      const dest = path.join(defaultProjectPath, entry.name)
      try {
        await fs.promises.rename(src, dest)
        moved++
      } catch (err) {
        skipped++
        console.error(`[Projects] failed to move ${entry.name}:`, (err as Error).message)
      }
    }
  } catch (err) {
    console.error('[Projects] failed to enumerate holocronRoot:', (err as Error).message)
  }

  config.projectsRoot = desiredRoot
  config.activeProjectName = DEFAULT_PROJECT_NAME
  config.activeProjectPath = defaultProjectPath

  // Map any active session into the new active thread fields.
  if (config.activeSessionName) {
    const candidatePath = path.join(defaultProjectPath, config.activeSessionName)
    if (await pathIsDir(candidatePath)) {
      config.activeThreadName = config.activeSessionName
      config.activeThreadPath = candidatePath
    }
  }

  console.log(`[Projects] migrated ${moved} threads into ${defaultProjectPath} (skipped ${skipped})`)
  if (config.activeThreadName) {
    console.log(`[Projects] active thread set: ${config.activeProjectName} / ${config.activeThreadName}`)
  }

  return { changed: true, config }
}

async function reflectActiveSessionAsThread(config: HolocronConfig, projectsRoot: string): Promise<void> {
  if (!config.activeSessionName) return
  const defaultPath = path.join(projectsRoot, DEFAULT_PROJECT_NAME, config.activeSessionName)
  if (await pathIsDir(defaultPath)) {
    config.activeProjectName = DEFAULT_PROJECT_NAME
    config.activeProjectPath = path.join(projectsRoot, DEFAULT_PROJECT_NAME)
    config.activeThreadName = config.activeSessionName
    config.activeThreadPath = defaultPath
    console.log(`[Projects] active thread set: ${config.activeProjectName} / ${config.activeThreadName}`)
  }
}

async function pathIsDir(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory()
  } catch {
    return false
  }
}
