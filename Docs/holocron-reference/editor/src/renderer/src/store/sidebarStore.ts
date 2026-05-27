import { create } from 'zustand'

export interface SidebarCell {
  id: string
  currentPath: string
  expandedPaths: string[]
}

interface SidebarStore {
  cells: SidebarCell[]
  activeCellId: string | null
  addCell: (path: string) => void
  removeCell: (id: string) => void
  setCellPath: (id: string, path: string) => void
  toggleExpand: (id: string, dirPath: string) => void
  clearExpanded: (id: string) => void
  setExpandedPaths: (id: string, paths: string[]) => void
  setActiveCellId: (id: string) => void
  initWithPath: (path: string) => void
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  cells: [],
  activeCellId: null,

  addCell: (path) => set((state) => {
    if (state.cells.length >= 3) return state
    const id = `cell-${Date.now()}`
    return {
      cells: [...state.cells, { id, currentPath: path, expandedPaths: [] }],
      activeCellId: id,
    }
  }),

  removeCell: (id) => set((state) => {
    const cells = state.cells.filter(c => c.id !== id)
    return {
      cells,
      activeCellId: state.activeCellId === id ? (cells[0]?.id ?? null) : state.activeCellId,
    }
  }),

  setCellPath: (id, path) => set((state) => ({
    cells: state.cells.map(c => c.id === id ? { ...c, currentPath: path, expandedPaths: [] } : c),
  })),

  toggleExpand: (id, dirPath) => set((state) => ({
    cells: state.cells.map(c => {
      if (c.id !== id) return c
      const expanded = c.expandedPaths.includes(dirPath)
      return {
        ...c,
        expandedPaths: expanded
          ? c.expandedPaths.filter(p => p !== dirPath)
          : [...c.expandedPaths, dirPath],
      }
    }),
  })),

  clearExpanded: (id) => set((state) => ({
    cells: state.cells.map((c) => c.id === id ? { ...c, expandedPaths: [] } : c),
  })),

  setExpandedPaths: (id, paths) => set((state) => ({
    cells: state.cells.map((c) => c.id === id ? { ...c, expandedPaths: paths } : c),
  })),

  setActiveCellId: (id) => set({ activeCellId: id }),

  initWithPath: (path) => set((state) => {
    // Snap ALL cells to the new root — split cells previously inside the old
    // thread cannot be allowed to keep showing content from outside the new
    // thread's boundary.
    if (state.cells.length > 0) {
      return {
        cells: state.cells.map((c) => ({ ...c, currentPath: path, expandedPaths: [] })),
      }
    }
    const id = `cell-${Date.now()}`
    return {
      cells: [{ id, currentPath: path, expandedPaths: [] }],
      activeCellId: id,
    }
  }),
}))
