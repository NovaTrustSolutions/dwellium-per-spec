# Anam AI vs. Dwellium Persona Studio — Gap Analysis

**Date:** 2026-07-05
**Reference:** lab.anam.ai persona builder ("Liv" / Elena / Cara 3), studied live in-session — full builder walkthrough, two recorded calls, 14 zoomed facial-motion frames.
**Ours:** Persona Studio (`qualia-shell/src/components/PersonaStudio/`, commit `002c0a6`), live in Stella (Persona tab) + Aura (🎭 panel).

---

## 1. Scorecard

| Area | Anam | Ours | Parity |
|---|---|---|---|
| Builder UI (prompt / greeting / director notes / tools) | ✓ | ✓ | **95%** |
| Conversation behavior (greeting, nudges, interruption, transcript, text+voice) | ✓ | ✓ | **95%** |
| Tools | 3 system + custom builder | 3 system + open_widget + hermes, no custom builder | **80%** |
| LLM selection | 10 models + custom endpoint | 5 providers + custom + model override | **90%** |
| Voice | 668 voices, cloning, preview, speed | ~10 voices, speed; neural only with OpenAI key | **40%** |
| Avatar visual | Photoreal neural video (server GPU) | Talking portrait (17 visemes, micro-expressions, listening face) | **~50%** |
| Latency | Sub-second, streamed speech | 1.5–3 s (full LLM reply before TTS) | **50%** |
| Knowledge | Document upload + folders | Paste-text only | **50%** |
| Publish / share persona | ✓ | ✗ | **0%** |
| **Cost** | $ per minute | **$0 above your LLM key** | — |

**Overall: roughly 75% functional parity, with the two real distances being voice variety/quality and the photoreal face.**
Where we're *ahead*: cues actually drive the face, the persona reacts to the user's speech while they talk, tools reach the whole Dwellium app, per-user config, zero per-minute cost.

---

## 2. Everything needed for 100% parity

### Bucket A — Quick wins (each ≤ 1 day, all free, our stack)

1. **Streamed speech (biggest felt improvement).** Speak the LLM reply sentence-by-sentence as it generates instead of waiting for the full reply. Cuts perceived latency from ~2–3 s toward ~1 s.
2. **"Generate" prompt button.** One-line description → LLM writes the system prompt (Anam's top-bar feature).
3. **Voice preview.** ▶ button per voice row speaking a sample line.
4. **Webcam capture** ("Take a picture") next to Upload portrait.
5. **Knowledge document upload.** Reuse the existing `FileUploadButton` analysis path; extracted text feeds the knowledge field. Folder management optional.
6. **Custom tool builder.** "Add tool" form: name, description, URL, JSON args → persona can call user-defined APIs. (Anam's Tools tab "Create a tool".)
7. **Cosmetics:** fullscreen button on the frame, model search box, disable-LLM toggle, "Free 0/30m"-style session timer if wanted.

### Bucket B — Medium effort (1–2 weeks total, still free)

8. **Neural voices without any API key.** Bundle an in-browser neural TTS (Kokoro-82M or Piper via WASM/WebGPU). Closes most of the 668-voice gap in *quality*; variety grows to dozens of voices. This removes the "real face, robotic voice" failure mode on the free path.
9. **Better speech recognition.** whisper.cpp WASM fallback for browsers where Web Speech is weak (Safari), plus noise robustness.
10. **Voice cloning.** The ARA backend already has `/api/ara/voice/clones` (Chatterbox). Wire Persona Studio's Voice tab to it — record 10 s, clone, select. (Backend service must be running.)
11. **Publish/share.** Persona config export/import (JSON) + a standalone shareable route rendering just the call stage.

### Bucket C — The photoreal face (the honest 100%)

The reference face is a neural video model generating every frame on Anam's GPUs. Canvas puppetry (what we have) cannot fully close this. Three ways to true visual parity — pick one:

- **C-1. Anam SDK embed** (~1 day). Identical face, voice, engine — because it *is* Anam. Requires their API key; paid per minute after the free 30 min/month. Slots into the existing frame with zero UI change.
- **C-2. Self-hosted talking-head model** (multi-week project, ongoing GPU cost). LivePortrait / MuseTalk / EchoMimic on your own GPU server, streamed via WebRTC. Full ownership of your face and pipeline; real infrastructure, tuning, and latency engineering. This is "build your own Anam."
- **C-3. Stay with the talking portrait** (done). Keep improving it incrementally — the remaining polish there: eye-region gaze pixels (irises actually move), cheek/nasolabial deformation with smiles, and a one-time AI-generated viseme frame set from your portrait for true photoreal mouth interiors (~2–3 days, replaces the cutout technique with per-viseme photo frames).

**Recommendation:** Do Bucket A now (1 week, transforms feel), Bucket B item 8 next (voice quality is the second-biggest tell), then decide C: if the persona is customer-facing and the face must be flawless, C-1 or C-2; if it's internal, C-3 + the viseme frame set gets ~90% of the impression at $0.

---

## 3. Already at or beyond parity (no action)

System prompt + default toggle; exact/generated first greeting; skip greeting; interruptible (works mid-sentence); style + expressivity + add-cues director notes — with cues *performed on the face*, which Anam's builder doesn't visibly do; idle nudges ("Are you there?", "Okay, I'll wait"); live transcript with tool-execution chips; simultaneous voice + typed input; end_call / skip_turn / change_language; per-user persona persistence; reactive listening face (concern/smile/surprise/attentive + backchannel nods) — not observed in the reference at all.
