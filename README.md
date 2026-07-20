# emb3r

A small terminal-styled AI companion that runs a language model **entirely on your own machine**. Nothing you type is sent to a server.

emb3r is a desktop app — pick a model, and it answers from your own RAM. After the first model download it works with the network off.

[**Download the latest release →**](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest)

---

## What it does

- **Runs offline.** Once a model is downloaded, emb3r never opens a socket. No telemetry, no accounts, no update pings.
- **Matches the model to your machine.** On first launch it reads your CPU, RAM and free disk, then recommends a model that will actually run — and refuses ones that would exhaust your memory.
- **Ships with a shelf of open models.** Llama, Qwen and Mistral in several sizes, downloaded on demand from Hugging Face and switchable in Settings.
- **Reads files you attach.** Drop in a text file and ask about it. The contents are read locally and never leave the machine.
- **Profiles**, so it can address different people differently.
- **Optional Spotify now-playing** integration, if you want it to know what you're listening to.

## Install

Grab an installer from [Releases](https://github.com/FRENCHIIIFRIES/emb3r-ai/releases/latest):

| Your machine | File |
|---|---|
| Mac, Apple Silicon (M1–M4) | `emb3r-<version>-arm64.dmg` |
| Mac, Intel | `emb3r-<version>-x64.dmg` |
| Windows | `emb3r-<version>-x64.exe` |

Not sure which Mac you have? Apple menu → About This Mac. "Apple M…" means arm64.

### First launch will warn you

The builds are **not signed with a paid developer certificate**, so both operating systems flag them. This is expected.

- **macOS** — "Apple could not verify emb3r is free of malware."
  System Settings → Privacy & Security → **Open Anyway**.
  (On macOS 15 Sequoia and later, right-click → Open no longer works.)
- **Windows** — SmartScreen shows a blue dialog. **More info** → **Run anyway**.

### Then pick a model

emb3r ships without a language model, because they are large and the right one depends on your hardware. On first launch it recommends one and downloads it for you — around 2 GB for the default. Models range from 1.9 GB to 9 GB.

**Minimum 4 GB of RAM** for the smallest model.

## Where things are stored

Downloaded models and settings live outside the app bundle, so they survive updates:

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/emb3r/` |
| Windows | `%APPDATA%\emb3r\` |

Delete that folder to reset emb3r completely, including downloaded models.

## Building from source

Requires **Node 20+**. On macOS you also need the Xcode Command Line Tools (`xcode-select --install`) — `node-llama-cpp` compiles native bindings during install.

```bash
git clone https://github.com/FRENCHIIIFRIES/emb3r-ai.git
cd emb3r-ai
npm install
npm start
```

In development, models are read from `./models` in the repo rather than the user data directory.

To produce installers:

```bash
npm run dist               # current platform
npm run dist -- --mac --arm64
npm run dist -- --mac --x64
npm run dist -- --win --x64
```

## How it works

- **[Electron](https://www.electronjs.org/)** shell — `main.js` is the main process, `src/` is the renderer, `preload.cjs` bridges them over a narrow IPC surface with `contextIsolation` enabled.
- **[node-llama-cpp](https://github.com/withcatai/node-llama-cpp)** runs the model, with a Metal backend on macOS and Vulkan or CPU on Windows. It falls back to CPU automatically if GPU load fails.
- Models are **GGUF** quantized weights pulled from [Hugging Face](https://huggingface.co/).

The renderer has no Node access. Everything privileged — model loading, downloads, config, network — happens in the main process behind explicit IPC handlers.

## Contributing

Issues and pull requests are welcome. CI builds all three targets on every pull request, so the artifacts on your PR are installable and testable.

## License

[MIT](LICENSE) © 2026 Ziyan
