# The Tutors' Models at First Launch: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh install fetches the tutors' models during first-run setup, so the tutors are ready before the student first needs one.

**Architecture:** The first-run setup modal already downloads one chosen model through `startDownload`, after the consent question. A checkbox, *also get the tutors' models*, queues the models from `TUTOR_MODELS` that are not installed and fit the machine's memory. They are fetched one after another after the chosen model, with the same progress line.

**Tech Stack:** Electron renderer (`src/renderer.js`, `src/index.html`), the existing `emb3r:download-model` IPC.

**Spec:** `docs/superpowers/specs/2026-11-04-study-tutors-design.md`, *Order*, step 2.

## Global Constraints

- Nothing is downloaded without the internet-permission answer the app already asks for.
- Only on machines where `minRamGB` for the model fits `totalRamGB()`. Qwen2.5 3B and Llama 3.2 3B both need 4 GB.
- The installer itself does not change. GitHub limits one file to 2 GB.

## Review Focus

1. **A machine with less than 4 GB of RAM.** No checkbox, nothing extra fetched.
2. **The chosen model is itself one of the tutors' models.** It is fetched once.
3. **A tutor model download fails.** The setup still finishes on the chosen model, the failure is said in the progress line, and the tutor's one-press offer remains.

### Task 1: The checkbox and the queue

**Files:** Modify `src/index.html` (`#setupTutorModelsRow` under `#setupPick`) and `src/renderer.js` (the setup flow around `startDownload`).

- [ ] **Step 1:** Add the checkbox, checked by default when the machine has ≥ 4 GB, with the line "also get the tutors' models (Qwen2.5 3B and Llama 3.2 3B, about 3.7 GB) - so every tutor is ready". It only lists what is missing.
- [ ] **Step 2:** After the chosen model's download succeeds and is selected, if the box is ticked, `await startDownload(id)` for each missing tutor model in turn. The setup modal closes when all of them have finished or failed.
- [ ] **Step 3:** Verify with `shoot-refresh.cjs`, stubbing `setup-state` `{ needsSetup: true }` and `list-models` with neither tutor model installed. Check that the box shows and the queue order is chosen model, Qwen2.5 3B, Llama 3.2 3B. With `minRamGB` above the machine, check the box is absent.
- [ ] **Step 4: Commit** with message "First run fetches the tutors' models after the chosen one".
