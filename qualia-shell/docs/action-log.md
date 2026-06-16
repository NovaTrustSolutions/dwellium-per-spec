# Action Log

- 2026-06-15: Initialized action log.
- 2026-06-15: Modifying src/components/TaskBoard/taskBoardModel.ts to support minWip, maxWip, policies in BoardColumn, and add actions UPDATE_COLUMN_LIMITS and UPDATE_COLUMN_POLICIES.
- 2026-06-15: Modifying src/components/TaskBoard/taskBoardStore.ts to add updateColumnLimits and updateColumnPolicies dispatchers.
- 2026-06-15: Modifying src/components/TaskBoard/TaskBoard.css to style column limits, starvation warnings, policy tooltips, and metrics dashboard components.
- 2026-06-15: Modifying src/components/TaskBoard/TaskBoard.tsx to implement column settings popovers, WIP limits indicators/checks, policy displays, exit criteria checkers, and the metrics dashboard using Recharts.
- 2026-06-15: Modifying src/test/taskBoard.test.ts to test column WIP limits updates, policy updates, and their corresponding inverse actions for reversibility.
- 2026-06-15: Modifying scratch/screenshot_taskboard.mjs to wait for checklist checkboxes to be visible before checking them.
- 2026-06-15: Modifying scratch/screenshot_taskboard.mjs to clear all taskboard key variations in localStorage on initialization.
- 2026-06-15: Modifying scratch/screenshot_taskboard.mjs to stub the backend /api/objects/task-board_* sync endpoint (correcting a hyphen mismatch) to ensure E2E starts with a clean board.
- 2026-06-15: Modifying scratch/screenshot_taskboard.mjs drag sequence to correctly handle the exit criteria check for Task Alpha before dragging Task Beta.
- 2026-06-15: Modifying scratch/screenshot_taskboard.mjs to use card selection and toolbar bulk moves instead of dragTo to avoid drag/drop flakiness in headless browser.
- 2026-06-15: Modifying walkthrough.md to add details and screenshots of the Kanban Task Board System Expansion.
- 2026-06-15: Creating scratch/eye-contact-prototype/index.html to set up the dashboard UI shell and import MediaPipe dependencies.
- 2026-06-15: Creating scratch/eye-contact-prototype/styles.css to style the glassmorphic dashboard interface.
- 2026-06-15: Creating scratch/eye-contact-prototype/app.js to implement facial mesh tracking, gaze-correction calculations, and canvas rendering.
- 2026-06-15: Creating scratch/screenshot_eye_contact.mjs to automate browser loading, camera mock injection, and dashboard visual capture.
- 2026-06-15: Modifying scratch/eye-contact-prototype/app.js to cover original iris/pupil with sampled sclera texture before rendering corrected gaze.
- 2026-06-15: Modifying scratch/eye-contact-prototype/index.html to add Brightness, Beautify, and Wrinkle Remover controls.
- 2026-06-15: Modifying scratch/eye-contact-prototype/app.js to add Brightness, Beautify, and Wrinkle Remover filter processing logic.
- 2026-06-15: Modifying scratch/eye-contact-prototype/screenshot_eye_contact.mjs to automate enhancement sliders testing and screenshot generation.
- 2026-06-15: Modifying scratch/eye-contact-prototype/index.html to add Background Blur and Background Replacement controls.
- 2026-06-15: Modifying scratch/eye-contact-prototype/app.js to implement background replacement (Chroma Key, Virtual Office image, solid color) and custom feathering algorithms.
- 2026-06-15: Modifying scratch/eye-contact-prototype/screenshot_eye_contact.mjs to include background replacement controls in automated testing.
- 2026-06-15: Modifying scratch/eye-contact-prototype/app.js to use results.image instead of videoEl to resolve latency ghosting, and implement texture-cloned sclera masking for natural eye correction.
- 2026-06-16: Modifying src/components/TrelloBoard/TrelloBoard.tsx to implement dragCounter ref mapping, onDragEnter, onDragLeave and onDragEnd to stabilize HTML5 drag-and-drop.
- 2026-06-16: Modifying src/components/TaskBoard/TaskBoard.tsx to implement dragCounter ref mapping, onDragEnter, onDragLeave and onDragEnd to stabilize HTML5 drag-and-drop.
- 2026-06-16: Modifying src/components/TaskBoard/TaskBoard.tsx and src/components/TaskBoard/TaskBoard.css to set dataTransfer events and apply temporary pointer-events override during active card drags.
- 2026-06-16: Modifying src/components/TaskBoard/taskBoardModel.ts to add REPLACE_BOARD action to support full board state import/replace.
- 2026-06-16: Modifying src/components/TaskBoard/taskBoardStore.ts to support dynamic keys namespaces (project boards) and loadBoardState convenience dispatcher.
- 2026-06-16: Modifying src/components/TaskBoard/TaskBoard.tsx to implement project board switcher, save/load backups, advanced edit ✏️ card button, span title, and dragEvent onDrop support.
- 2026-06-16: Modifying scratch/verify_taskboard_features.mjs to dismiss the system health banner and use programmatic click to close the Project View modal.
- 2026-06-16: Modifying vite.config.ts to serve the eye contact prototype under static path /__eye-contact/.
- 2026-06-16: Modifying src/components/AraMeeting/AraMeetingPanel.tsx to add the eye-correction configuration shortcut.
- 2026-06-16: Modifying src/lib/subscriptionsStore.ts to dynamically inject the Google Max subscription plan when Gemini key is configured.
- 2026-06-16: Modifying src/components/Shell/HalocronOS.tsx to read integrations and dynamically show Google · Max plan on the launcher card.
- 2026-06-16: Modifying src/lib/llmUsageStore.ts to add DALL-E and Gemini image generation model pricing.
- 2026-06-16: Modifying src/lib/agents/skills.ts to record LLM usage for web search and image generation direct-fetch calls.
- 2026-06-16: Modifying terminalRoutes.ts (backend), Terminal.tsx, and HalocronOS.tsx to support running Claude, Codex, and AntiGravity inside the Terminal PTY.
















