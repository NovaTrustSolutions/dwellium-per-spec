# NotebookLM → ARA Library (plan 052)

Consumer NotebookLM has no public API, so Dwellium **mirrors** the raw text of
your notebook sources (contracts, housing law, requirements…) into its own
document vector store — the **Library** — and ARA retrieves from it with
citations by source title. NotebookLM stays the place you author; this folder
is the one-way bridge, run from a Mac that holds your Google session:

```
Mac (nlm login)                              Cloud backend                     ARA
nlm source content ──► sync.sh ──► POST /api/library/sources ──► embeddings ──► "Library · N" chip
```

Files: `sync.sh` (the bridge), `notebooks.conf` (which notebooks, per account),
`com.dwellium.notebooklm-sync.plist` (weekly launchd job).

Verified against `notebooklm-mcp-cli` **0.3.19** (`nlm --ai`, the subcommand
`--help` texts, and the package's `JsonFormatter` — field names below come from
the source, not guesses).

---

## Setup (once per Mac)

1. **Tools** — `jq` ships with macOS 15+ (`/usr/bin/jq`); otherwise `brew install jq`.
   `nlm` is the NotebookLM CLI:

   ```sh
   uv tool install notebooklm-mcp-cli     # or: pipx install notebooklm-mcp-cli
   nlm --version                          # expect 0.3.19 or newer
   ```

   It installs to `~/.local/bin/nlm`; the script finds it there even if that
   directory is not on your PATH.

2. **Log in — one profile per Google account.** Each opens a browser window for
   the Google sign-in; pick the matching account:

   ```sh
   nlm login --profile andy      # Andy's account → ALL notebooks are mirrored
   nlm login --profile ilya      # Ilya's account → ONLY the ids in notebooks.conf
   nlm login --check --profile andy   # exit 0 = valid
   ```

   Sessions expire (Google cookies); the script tells you exactly which profile
   to re-login when that happens. `nlm login profile list` shows all profiles.

3. **Store the sync secret in the Keychain** (value never touches shell
   history — the command prompts for it):

   ```sh
   security add-generic-password -a dwellium -s dwellium-library-sync -w
   ```

   The value is the backend's `LIBRARY_SYNC_SECRET` (ask whoever deploys the
   backend / check the Cloud Run secret). You can also just `export
   LIBRARY_SYNC_SECRET=…` for a one-off run; the env var wins over the Keychain.

4. **Backend URL** defaults to `https://argyleholocron.netlify.app/api`. Override
   with `DWELLIUM_API=https://…/api` (no trailing slash) for staging/local.

## Which notebooks — `notebooks.conf`

```
# profile   scope
andy        all
ilya        b35010cd-43f4-4269-8e31-07a93100c327,060d1323-…,c56e2b37-…,1653a2ee-…
```

- `all` mirrors every notebook the profile can see (`nlm notebook list`).
- A comma-separated list mirrors only those ids — the id is the **first UUID**
  in a NotebookLM share link `https://notebook.google.com/notebook/<id>[/artifact/…]`.
- **Add a notebook for Ilya:** append its id to the `ilya` line (comma, no
  spaces) and re-run. To mirror one of Andy's notebooks under Ilya's profile
  instead, use the id here — scope is per profile.

Each notebook becomes one Library collection named `<profile>/<notebook title>`.

## Run

```sh
tools/notebooklm/sync.sh                 # everything in notebooks.conf
tools/notebooklm/sync.sh --dry-run       # fetch + hash, POST nothing
tools/notebooklm/sync.sh --profile ilya  # one profile
tools/notebooklm/sync.sh --profile andy --notebook <id>   # one notebook
tools/notebooklm/sync.sh --force         # re-index even if the text hash is unchanged
tools/notebooklm/sync.sh --self-test     # conf parsing + collection naming asserts
```

What it does per profile: `nlm login --check` → resolve the notebook set →
`nlm notebook get` (title) → `nlm source list` → `nlm source content` for each
source → sha256 of the text → skip if the Library already has that hash for
that collection/source (one `GET /api/library/sources` snapshot up front) →
otherwise `POST /api/library/sources` with `x-library-secret`. 0.3 s between
POSTs, one retry on failure. Sources with no text (audio, still-processing,
unsupported) are **skipped with a reason**. It is idempotent — re-run as often
as you like; the backend upserts by collection + source id.

Output ends with a per-profile line and one total:

```
  -- andy: notebooks=2 sources=4 indexed=2 unchanged=1 skipped=1 failed=0
TOTAL notebooks=6 sources=16 indexed=6 unchanged=5 skipped=5 failed=0
```

Exit codes: `0` ok · `1` a source failed or the backend refused (401/503) ·
`3` only auth problems (some profile needs `nlm login`) · `64/66/69/78`
usage / missing conf / missing tool / missing secret.

## Schedule weekly (launchd)

```sh
cp tools/notebooklm/com.dwellium.notebooklm-sync.plist ~/Library/LaunchAgents/
# edit the two absolute paths inside if your checkout or home differ
launchctl load -w ~/Library/LaunchAgents/com.dwellium.notebooklm-sync.plist
launchctl start com.dwellium.notebooklm-sync          # run once now
tail -f ~/Library/Logs/dwellium-notebooklm-sync.log
# stop: launchctl unload -w ~/Library/LaunchAgents/com.dwellium.notebooklm-sync.plist
```

Runs Mondays 07:30 (missed runs fire at next wake). It reads the secret from
your login Keychain, so the Mac must be logged in (screen-locked is fine). When
the office always-on Mac (plan 047 phase 2) hosts this, repeat the Setup steps
there — the Google sessions are per-machine.

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| `✗ NotebookLM auth missing/expired for 'andy' — run: nlm login --profile andy` | Google cookies expired or profile never created | `nlm login --profile andy` (browser opens), re-run |
| `401 unauthorized — LIBRARY_SYNC_SECRET does not match the backend` | secret mismatch | fix the Keychain item (`security delete-generic-password -s dwellium-library-sync`, then add again) or the backend env |
| `503 embeddings not configured — backend has no OPENAI_API_KEY` | backend can't embed | set `OPENAI_API_KEY` on the backend (Cloud Run secret) and redeploy; the widget shows the same warning |
| `snapshot unavailable (HTTP …)` | `GET /api/library/sources` failed | harmless — everything is POSTed and the backend reports `unchanged` itself |
| `skipped (empty/unsupported content, type=audio)` | NotebookLM has no indexed text for that source | expected for audio / still-processing sources |
| `Profile not found: ilya` | never logged in under that name | `nlm login --profile ilya` |
| Nothing from launchd | `PATH` in the plist lacks `nlm`/`jq`, or Keychain locked | check the log; run the script by hand once |

## What ARA does with it

Every ARA question also searches the Library (vector similarity over the
mirrored text). Matching chunks are injected as `## Library — your documents
(NotebookLM mirror)` and ARA cites them as **[Source title]**; the reply's
context chips show `Library · N`. The NotebookLM widget (Library section) lists
what is mirrored, when each collection last synced, and lets you remove a
source — removal is UI-only, the script never deletes.

## Privacy

Source text leaves NotebookLM only to the Dwellium backend you configure
(`DWELLIUM_API`), over HTTPS, authenticated by the sync secret; it is embedded
there (OpenAI embeddings) and stored in Dwellium's own vector store. Nothing is
sent anywhere else and the secret is never printed. `nlm` is MIT-licensed
tooling used unmodified; no AGPL component is involved.
