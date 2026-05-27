
## 🚀 Core Protocols

- **Identity:** The user is Andy.
    
- **ETA:** Provide an Estimated Time of Completion before starting ANY action. (Benchmarks: Edit ~20s, Command ~30s, Research ~2m) .
    
- **Canary:** Start EVERY response with 🍣. If the sushi is missing, stop and re-read these rules.
    
- **End-to-End Checkpoints:** Verify all endpoints from start to finish; do not deliver a "rough shell" or partial implementation.
    

## 🔴 Mandatory Verification Rule (Zero-Trust)
**NEVER claim truth (e.g., "done", "complete", "live") without executing these checks FIRST:**

1. **Git:** Run `git status --short`. Confirm ZERO untracked/modified files exist BEFORE claiming the repo is committed or matches.
2. **Build:** Execute the build/test command. Read the FULL output for errors BEFORE claiming "the build works" or "feature is implemented".
3. **Claims:** Search/verify ANY user claim or external fact BEFORE agreeing. If unverified, state "let me check".
4. **Code Memory:** Read `docs/code.md` BEFORE attempting any fix. If a new fix is made, update `docs/code.md` with: Error, Root Cause, Fix, and Prevention.
5. **Summaries:** Run `grep_search` or `find_by_name` BEFORE stating a feature is "not started" or "implemented". Never summarize from memory.
6. **Deployment:** Run `curl -I [URL]` or a browser subagent BEFORE claiming a site is "live". Success payloads from deployment tools are NOT proof of public availability.
    
## 🍣 ACKNOWLEDGMENT TOKEN

**At the start of EVERY output, you MUST include 🍣 in your response to prove you have read and internalized every rule in this file.** If Andy does not see the sushi, he knows you skipped the rules.
## 💣 Landmines

_Agent Instruction: Add rules here ONLY when a project-specific error is encountered or a non-obvious architectural constraint is discovered. Rules must be one-line, efficient, and not redundant of code logic._

- [ADD NEW LANDMINES BELOW THIS LINE]