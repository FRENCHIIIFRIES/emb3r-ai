A small terminal-dwelling AI companion that runs a language model entirely on your own machine. Nothing you type is sent to a server.

## Which file do I want?

| Your machine | Download |
|---|---|
| Mac with Apple Silicon (M1–M4) | `emb3r-*-arm64.dmg` |
| Mac with an Intel chip | `emb3r-*-x64.dmg` |
| Windows | `emb3r-*-x64.exe` |

Not sure which Mac you have? Apple menu → About This Mac. If it says "Apple M…" you want arm64.

## First launch — please read

These builds are **not code-signed**, so your operating system will warn you the first time. This is expected and does not mean anything is wrong.

**macOS.** You will see "Apple could not verify emb3r is free of malware."

1. Open **System Settings → Privacy & Security**
2. Scroll down to the message about emb3r
3. Click **Open Anyway**

On macOS 15 (Sequoia) and later, right-click → Open no longer works. You have to use System Settings.

**Windows.** SmartScreen will show a blue "Windows protected your PC" dialog. Click **More info**, then **Run anyway**.

## Then what?

emb3r ships without a language model, because they are large and the right one depends on your hardware. On first launch it reads your CPU, RAM and free disk, recommends a model that will actually run on your machine, and offers to download it.

Models range from about 1.9 GB to 9 GB. The download happens once; after that everything runs offline. You need at least **4 GB of RAM** for the smallest model.

## Checking for updates

emb3r checks for new versions on launch and lets you download them from **Settings → Updates** — no need to keep coming back to this page.

On Windows, downloaded updates install the next time you restart the app.

On macOS, this may not always be able to install automatically — these builds aren't signed with a paid Apple Developer certificate, which macOS requires for an update to apply itself. If that happens, emb3r will tell you and offer a direct link to download the new version here instead, same as installing it the first time.

## Known limitations

- Unsigned, hence the warnings above
