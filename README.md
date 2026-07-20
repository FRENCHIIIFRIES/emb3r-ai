```
███████╗ ███╗   ███╗ ██████╗  ██████╗  ██████╗
██╔════╝ ████╗ ████║ ██╔══██╗ ╚════██╗ ██╔══██╗
█████╗   ██╔████╔██║ ██████╔╝  █████╔╝ ██████╔╝
██╔══╝   ██║╚██╔╝██║ ██╔══██╗  ╚═══██╗ ██╔══██╗
███████╗ ██║ ╚═╝ ██║ ██████╔╝ ██████╔╝ ██║  ██║
╚══════╝ ╚═╝     ╚═╝ ╚═════╝  ╚═════╝  ╚═╝  ╚═╝
```

**A retro terminal AI companion that runs open language models entirely on your own machine.**
No cloud. No accounts. No telemetry.

[![Latest release](https://img.shields.io/github/v/release/FRENCHIIIFRIES/emb3r-ai?style=flat-square&color=ff6a00&label=release)](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/FRENCHIIIFRIES/emb3r-ai/build.yml?branch=main&style=flat-square&label=build)](https://github.com/FRENCHIIIFRIES/emb3r-ai/actions/workflows/build.yml)
[![Downloads](https://img.shields.io/github/downloads/FRENCHIIIFRIES/emb3r-ai/total?style=flat-square&color=ffb020&label=downloads)](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases)
[![License](https://img.shields.io/github/license/FRENCHIIIFRIES/emb3r-ai?style=flat-square&color=8fd6ff)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)

### [⬇ Download the latest release](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest)

---

## What it is

You type, and a language model living in your own RAM answers. That's it — there is no server in the loop, no API key, and nothing leaves the machine. Once a model is downloaded, emb3r works with the network switched off.

It looks like a Game Boy that learned to talk: block-letter boot screen, a little ASCII face that changes mood, and a green-on-black terminal.

```
// ember terminal ready. type below and hit enter.
you > what's in this file?
ember > ( ^_^ )  it's a shopping list. mostly cheese.
```

## Features

- **Fully offline.** After the first model download, emb3r never opens a socket. No telemetry, no update pings, no analytics.
- **Matched to your machine.** On first launch it reads your CPU, RAM and free disk, recommends a model that will actually run, and refuses ones that would exhaust your memory.
- **A shelf of open models.** Llama, Qwen and Mistral in several sizes, fetched on demand and switchable in Settings.
- **Reads files you attach.** Drop in a text file and ask about it — read locally, never uploaded.
- **Profiles**, so it can address different people differently.
- **Optional Spotify now-playing**, if you want it to know what you're listening to.

## Install

Grab an installer from [Releases](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest):

| Your machine | File |
|---|---|
| Mac — Apple Silicon (M1–M4) | `emb3r-<version>-arm64.dmg` |
| Mac — Intel | `emb3r-<version>-x64.dmg` |
| Windows | `emb3r-<version>-x64.exe` |

Not sure which Mac? Apple menu → About This Mac. "Apple M…" means arm64.

### First launch will warn you

emb3r isn't signed with a paid developer certificate, so both systems flag it. Expected, not a problem.

- **macOS** — "Apple could not verify emb3r is free of malware."
  System Settings → Privacy & Security → **Open Anyway**.
  *(On macOS 15 Sequoia and later, right-click → Open no longer works.)*
- **Windows** — SmartScreen shows a blue dialog. **More info** → **Run anyway**.

## The models

emb3r ships **without** a model — they're large, and the right one depends on your hardware. On first launch it recommends one and fetches it for you. All are 4-bit quantized (Q4_K_M) GGUF weights from Hugging Face.

| Model | Download | Needs |
|---|---|---|
| **Llama 3.2 3B Instruct** — *default* | 2.0 GB | 4 GB RAM |
| Qwen2.5 3B Instruct | 1.9 GB | 4 GB RAM |
| Mistral 7B Instruct v0.3 | 4.4 GB | 8 GB RAM |
| Qwen2.5 7B Instruct | 4.7 GB | 8 GB RAM |
| Llama 3.1 8B Instruct | 4.9 GB | 8 GB RAM |
| Qwen2.5 14B Instruct | 9.0 GB | 16 GB RAM |

emb3r won't offer a model your machine can't hold — with 8 GB of RAM, the 14B simply isn't listed. Bigger models reason better and answer slower.

## Where your data lives

Models and settings sit outside the app bundle, so they survive updates:

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/emb3r/` |
| Windows | `%APPDATA%\emb3r\` |

Delete that folder to reset emb3r completely, downloaded models included.

## Building from source

Needs **Node 20+**. On macOS also install the Xcode Command Line Tools (`xcode-select --install`) — `node-llama-cpp` compiles native bindings during install.

```bash
git clone https://github.com/FRENCHIIIFRIES/emb3r-ai.git
cd emb3r-ai
npm install
npm start
```

In development, models are read from `./models` in the repo rather than the user data directory.

Build installers:

```bash
npm run dist                    # current platform
npm run dist -- --mac --arm64   # Apple Silicon
npm run dist -- --mac --x64     # Intel Mac
npm run dist -- --win --x64     # Windows
```

## How it works

- **[Electron](https://www.electronjs.org/)** shell — `main.js` is the main process, `src/` the renderer, `preload.cjs` bridges them across a narrow IPC surface with `contextIsolation` on.
- **[node-llama-cpp](https://github.com/withcatai/node-llama-cpp)** runs the model: Metal on macOS, Vulkan or CPU on Windows, with automatic CPU fallback if GPU load fails.
- Weights are **GGUF** quantized models from [Hugging Face](https://huggingface.co/).

The renderer has no Node access. Everything privileged — model loading, downloads, config, network — happens in the main process behind explicit IPC handlers.

## Contributing

Issues and pull requests welcome. CI builds all three targets on every pull request, and macOS builds are ad-hoc signed, so PR artifacts are installable and testable.

## License

[MIT](LICENSE) © 2026 Ziyan
