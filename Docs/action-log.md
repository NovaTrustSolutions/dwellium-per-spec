# Action Log

- **File**: `qualia-shell/src/components/CognitiveHarness/CognitiveHarness.tsx` and `qualia-shell/src/components/CognitiveHarness/CognitiveHarness.css`
  - **Change**: Create the `CognitiveHarness.tsx` and `CognitiveHarness.css` component files.
  - **Why**: Requested by user to build a futuristic interactive visual element showcasing the AI cognitive stack.

- **File**: `qualia-shell/src/registry/widgetRegistry.ts`
  - **Change**: Register the `cognitive-harness` component inside the centralized widget registry mapping.
  - **Why**: Registers the widget globally in the app's components, command palette, and window system.

- **File**: `qualia-shell/src/data/hierarchy.ts`
  - **Change**: Add `dock-cognitive-harness` to `defaultDockItems` in the AI Tools category.
  - **Why**: Ensures the Cognitive Harness widget appears in the default sidebar widget layout.

- **File**: `qualia-shell/src/components/Shell/HalocronOS.tsx` & `qualia-shell/src/components/Shell/HalocronOS.css`
  - **Change**: Integrate Cognitive Harness visuals inside the new split-view memory sidebar layout in Halocron OS.
  - **Why**: Display the live parameter space canvas and cognitive orchestration logs inside the OS's memory rail tab.

- **File**: `electron/main.cjs`
  - **Change**: Add native folder selection IPC handler `dwellium:chooseDirectory`.
  - **Why**: Enable the user to select local folders via system dialogs instead of typing them.

- **File**: `electron/preload.cjs`
  - **Change**: Expose `chooseDirectory` inside `window.electronAPI`.
  - **Why**: Connect the frontend folder selector to the backend native Electron chooser.

- **File**: `qualia-shell/vite.config.ts`
  - **Change**: Add `/__kb/list-directories` endpoint middleware.
  - **Why**: Enable the browser UI to query local subdirectories on the host filesystem.

- **File**: `qualia-shell/src/components/Scribe/FolderPickerModal.tsx`
  - **Change**: Implement a custom React directory explorer modal for selecting host folders.
  - **Why**: Provide a fully integrated container in browser mode to navigate and pick local folders.

- **File**: `qualia-shell/src/components/Scribe/KnowledgeBasePanel.tsx`
  - **Change**: Integrate Scribe FolderPickerModal for standard browser mode.
  - **Why**: Display the modal when clicking the folder selector icon next to the path fields.

- **File**: `qualia-shell/src/components/Shell/HalocronOS.tsx`
  - **Change**: Change the launchpad card to a div with separate 'Open' (in OS) and 'Popout' (external/popup window) button triggers.
  - **Why**: Let the user choose to open Claude, AntiGravity, ChatGPT, and Codex either inside Halocron OS or in a separate window.

- **File**: `qualia-shell/src/components/TrelloBoard/TrelloBoard.tsx`
  - **Change**: Implement `dragCounter` ref mapping, `onDragEnter`, `onDragLeave` and `onDragEnd` to stabilize HTML5 drag-and-drop.
  - **Why**: Prevent parent-child dragover/dragleave re-render jitter that breaks card moves.

- **File**: `qualia-shell/src/components/TaskBoard/TaskBoard.tsx`
  - **Change**: Implement `dragCounter` ref mapping, `onDragEnter`, `onDragLeave` and `onDragEnd` to stabilize HTML5 drag-and-drop.
  - **Why**: Prevent parent-child dragover/dragleave re-render jitter that breaks card moves.

- **File**: `qualia-shell/src/components/TaskBoard/TaskBoard.tsx` and `qualia-shell/src/components/TaskBoard/TaskBoard.css`
  - **Change**: Pass the drag event to set `effectAllowed`, `setData`, and `dropEffect` inside handlers; disable pointer events on other cards during drag via `.tb-board--dragging` class.
  - **Why**: Ensure standard HTML5 browser drag-and-drop compatibility and prevent card elements from hijacking cursor drop targets.

- **File**: `qualia-shell/src/components/TaskBoard/taskBoardModel.ts`
  - **Change**: Add `REPLACE_BOARD` action to reduceData to support full board state import.
  - **Why**: Allow the Task Board to replace its entire state when loading backup files or switching projects.

- **File**: `qualia-shell/src/components/TaskBoard/taskBoardStore.ts`
  - **Change**: Add `taskBoardProjectIdHolder` and use it in `resolveKey()` to dynamically namespaces task boards by project. Add `loadBoardState` convenience dispatcher.
  - **Why**: Allow independent Task Board states for different projects, persisted in localStorage.

- **File**: `qualia-shell/src/components/TaskBoard/TaskBoard.tsx`
  - **Change**: Integrate useHierarchy and selector for project task boards, save/load backup handlers/buttons, update card headers with advanced edit button, replace card title button with span, and pass drag event to onDrop.
  - **Why**: Fulfill all user requirements for project boards, save/load backups, advanced edit visibility, and robust drag-and-drop.

- **File**: `qualia-shell/scratch/verify_taskboard_features.mjs`
  - **Change**: Hide the `sysh-banner` elements at startup and use programmatic `.click()` on the Close button to prevent pointer event interception.
  - **Why**: Prevent click intercept exceptions and visual coverage caused by system health banners.

- **File**: `qualia-shell/vite.config.ts`
  - **Change**: Add `eyeContactPlugin` to serve the eye-contact-prototype files at `/__eye-contact/`.
  - **Why**: Enable direct browser-accessible HTTP routing for the eye-correction module.

- **File**: `qualia-shell/src/components/AraMeeting/AraMeetingPanel.tsx`
  - **Change**: Add a link/button to the configure eye-correction module page inside the Meeting Notetaker header.
  - **Why**: Enable direct setup navigation from the Meeting Notetaker tool as requested by the user.

- **File**: `qualia-shell/src/lib/subscriptionsStore.ts`
  - **Change**: Dynamically inject Google Max plan subscription in `useSubscriptions()` when Gemini API key is configured.
  - **Why**: Ensure AI Spend tracks the Google subscription automatically when Google keys are provided.

- **File**: `qualia-shell/src/components/Shell/HalocronOS.tsx`
  - **Change**: Integrate integrationsStore and use it to dynamically check for Google API key, displaying `Google · Max plan` on the AntiGravity launcher card when active.
  - **Why**: Highlight the active Google plan dynamically within the Holocron OS Home tab when Google credentials are provided.

- **File**: `dwellium-backend/ai-dashboard369-file-manager/src/routes/terminalRoutes.ts`
  - **Change**: Allow optional `envVars` in `createBackend` to mix in user's API credentials (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, CODEX_API_KEY) and pass them from the request body in POST `/sessions`.
  - **Why**: Allow Claude Code, Codex, and AntiGravity commands to execute with correct API credentials inside the PTY terminal.

- **File**: `qualia-shell/src/components/Terminal/Terminal.tsx`
  - **Change**: Import `useIntegrations` hook and pass the active user's credentials (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, CODEX_API_KEY) in the POST `/sessions` request body.
  - **Why**: Propagate user's API keys configured in Integrations securely into the spawned terminal shell processes.

- **File**: `qualia-shell/src/components/TaskBoard/TaskBoard.css`
  - **Change**: Constrain `.tb-col-settings-pop .tb-assign-input` with `width: 100%` and `min-width: 0` to prevent WIP input fields from overflowing.
  - **Why**: Prevent "Max WIP" setting field from overextending beyond the popover container as requested.

- **File**: `qualia-shell/src/components/TaskBoard/TaskBoard.tsx`
  - **Change**: Add `📋` and `⚙` content inside column header policy and settings buttons.
  - **Why**: Give the buttons content and dimensions, making them visible to users and clickable in Playwright tests.

- **File**: `qualia-shell/src/test/taskBoard.render.test.tsx`
  - **Change**: Add `vi.mock` for `../context/HierarchyContext` to mock the hierarchy context hook.
  - **Why**: Prevent `useHierarchy must be used within HierarchyProvider` test exceptions.

- **File**: `qualia-shell/src/test/Terminal.test.tsx`
  - **Change**: Refactor `vi.mock` for `../context/UserContext` to use `importOriginal` and return `UserContext` along with `useUser`.
  - **Why**: Fix `No "UserContext" export is defined on the "../context/UserContext" mock` test error.






