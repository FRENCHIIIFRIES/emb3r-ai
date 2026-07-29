A small terminal-dwelling AI companion that runs a language model entirely on your own machine. By default, nothing you type is sent to a server — and as of v1.1.0 you can verify that, and enforce it.

## v1.21.1 — the Settings button loses its marker

Small follow-up to v1.21.0. Settings kept an asterisk where its gear icon used to be, while History had been left as plain text — so the two buttons sitting next to each other didn't match. Both are plain now.

## v1.21.0 — something to read while it loads

The loading screen used to hold one line for the whole of a phase, which on a slow start meant the same sentence sitting there for twenty seconds. It now cycles: ember-themed phrases for whatever the fire is doing, facts about how emb3r was built, and — rarely — an easter egg worth finding.

The facts are all true and all checkable. Searching a 20MB file really does take 44 milliseconds. The icon artwork really did fill only 79% of its canvas before it was fixed. Your own messages really were, briefly, almost invisible against the background.

The little spirit that travels the torches now flickers instead of sitting still, and the last emoji have left the interface — History is plain text, and the gear and paperclip are ASCII, which suits a program built out of ASCII everywhere else.

## v1.20.0 — an introduction, a searchable Settings, and a clearer Models page

A fresh install now explains itself. Three short slides cover what emb3r is, the fact that nothing leaves your machine, and what Ember should call you — and the name you give goes straight onto your profile rather than creating a second one. It's optional; leave it blank and Ember simply won't use a name.

After an update you'll get a summary of what changed, listing every release between the version you last opened and the one you're on, so skipping a version doesn't mean missing its notes. It's built into the app, not fetched, so it works with the network off like everything else here. A brand-new install never sees it — there's nothing yet to have missed.

Settings is a sidebar instead of a row of tabs, and it's searchable. The search knows what things are actually called: type "glow", "mute" or "colour" and it finds Display; "key" finds Web access; "ram" finds Hardware.

The Models page is easier to read. Buttons line up down the right, the model in use is marked, and a model your machine can't hold now says what it needs instead of offering a Download button that was only going to refuse. There's also a running total of how much disk your models are using.

Two smaller fixes: the download bar no longer appears to strike through the description above it, model details follow your accent colour instead of a fixed blue, and starting a new chat no longer leaves you looking at a blank panel.

## v1.19.0 — delete models you don't want, and a tidier window

You can now delete a model from Settings → Models. Six models at 1.9–9GB each add up quickly, and until now the only way to get one back off your disk was to go hunting for the folder yourself.

The model you're currently using can't be deleted — switch to another one first. That's deliberate: pulling the model out from under a running session would leave emb3r unable to answer anything. Deleting takes two clicks rather than a dialog box, and it clears up any half-finished download left behind from an earlier attempt, which was otherwise invisible and still taking up space.

The File / Edit / View / Window menu bar is gone on Windows and Linux. It came from Electron by default and had nothing to do with emb3r — there's no file to open and no view to change. On macOS a minimal menu stays, because that's where ⌘C, ⌘V and ⌘Q actually live and removing it would quietly break them.

## v1.18.0 — Ember has more to say with its face

Seven new expressions, each tied to something actually happening rather than added for variety. Ember winks when a copy works, looks surprised at a file too big to read in one go, and scans left and right while answering from a document you've attached. It looks delighted rather than merely happy when its mood is full, and wears a distinct face when a model fails to load — which is a different problem from a reply going badly, and worth being able to tell apart at a glance. Turn the offline lock on and Ember settles into a calm, deliberately shut expression.

Two new effects: a puff of smoke when you stop a reply mid-sentence, and a brief flicker when something goes wrong. Both respect the Reactions toggle in Settings → Display and your system's reduce-motion setting, exactly like the sparkle and heart already did.

## v1.17.0 — the loading screen says what it's doing

The wait while a model loads now explains itself. There are two lines under the torches: one says what the fire is doing — *striking the flint*, *feeding the fire*, *banking the coals* — and the quieter line beneath names the actual step, with a real percentage where there is one to give. Where there genuinely isn't one, during the hardware probe, it doesn't invent a number.

Heat now spreads through the EMB3R wordmark in step with the torches, so the letters and the row read as one thing rather than two. And the spirit that travels the row finally has somewhere to arrive: a brazier at the end that catches only when the model has genuinely finished loading.

A fresh install with nothing downloaded yet has no model to wait for, so instead of skipping the sequence in silence it now says so.

## v1.16.0 — a bigger icon, and the salamander comes inside

The app icon was sitting small in the taskbar — the artwork only filled about 79% of the width and 53% of the height of its own canvas, so a good chunk of what you saw was empty space. It's now cropped in to fill the frame properly, about 13% larger with no loss of detail.

The salamander also joins the ASCII EMB3R banner inside the app, sitting just to its left. The wordmark itself is untouched. The salamander picks up whatever accent colour and theme you've chosen, so it stays legible in light and dark alike rather than being a fixed colour pasted on top.

Windows users: if the taskbar or Start Menu still shows the old icon after updating, that's Windows' own icon cache rather than a bad update — it clears on its own, or immediately after a sign-out and back in.

## v1.15.0 — new app icon

emb3r has a new icon: a pixel-art salamander with three flames rising from its spine, replacing the previous ASCII-grid design. It's used for the taskbar, the app window, and the installer on both Windows and macOS.

The in-app wordmark (the ASCII banner on the boot screen and in the pet display) is unchanged — this is an icon-only update.

Note for Windows users: after installing, if the taskbar or Start Menu still briefly shows the old icon, that's Windows' own icon cache, not a bad update — it clears on its own, or immediately after a sign-out/sign-in.

## v1.14.0 — the boot screen actually waits for the model now

Previously, the loading screen faded out on a fixed timer whether or not the model had actually finished loading — on a slower machine or a bigger model, you could land in the chat before there was anything behind it to answer.

It now waits for the real thing, dressed up to match: a small ember spirit travels across a row of torches, lighting each one as the model genuinely loads, with the last torch reserved for true completion rather than "close enough." While the app is warming up its hardware detection (a stretch with no progress signal to report at all), the spirit fidgets around so the screen never looks frozen.

A fresh install with nothing downloaded yet skips all of this and goes straight to the usual first-run setup — there's nothing to wait for.

## v1.13.0 — attachment limit adjusted, internal cleanup

The per-file attachment limit introduced in v1.11.0 is now **5MB**, down from 20MB. Files above that are still refused with a clear message rather than silently cut short — that part hasn't changed, just the number. Anything up to 5MB that doesn't fit in the model's context window is still handled the same way: split into sections and searched per question, rather than pasted in whole.

No user-facing feature changes beyond that. The rest of this release is internal housekeeping — some dead code and a couple of silently-overridden CSS properties that never actually did anything, cleaned up while looking for exactly that.

## v1.12.0 — Ember reacts

A few small touches to make Ember feel more like it's actually there:

- **A sparkle** drifts up off each reply as it lands
- **A heart** appears when Ember is genuinely glad to help — not on every reply, only when you're appreciative or the answer is a warm one, so it stays meaningful
- **A gentle bob** while Ember is thinking, on top of the face animation that was already there
- **A soft fade** when you switch between conversations, instead of the transcript changing in a single jump

All of it is decoration — nothing here changes what Ember says. If you'd rather not have it, there's a **Reactions** toggle in Settings → Display right next to Sound effects, and it also respects your system's reduce-motion setting automatically.

## v1.11.0 — attach a whole textbook

Attachments now accept files up to **20MB each**, up from about 20KB.

That needed more than a bigger number. A 20MB file is roughly 5 million tokens, and the models here have a context window of a few thousand — so a whole document is around 1,300× too large to hand to the model, and no model in the list changes that. Quietly cutting it short would mean Ember answering confidently from page one of a textbook.

So emb3r stops trying to read it all at once. It splits the file into sections and **searches it for each question you ask**, using only the parts that match. Searching a 20MB file takes about 40 milliseconds, happens entirely on your machine, and needs no extra download.

It also tells you what it did rather than letting you assume: you'll see how many sections it searched and which ones it used, and if nothing in the file matches your question it says so instead of guessing. Files small enough to read in full are still read in full — the searching only kicks in when it has to.

Your attachment also **stays available for follow-up questions** now, instead of being used up by the first message. There's a bar above the input showing what's attached, with an ✕ to remove it, and it clears itself when you switch to another conversation.

## v1.1.0 — you can now check the "offline" claim, not just take it

**emb3r was quietly contacting Google on every launch.** Its typeface was being fetched from `fonts.googleapis.com` each time the app opened, which sent your IP address and the time you opened it. The font files bundled in the app that were supposed to prevent this turned out not to be fonts at all — they were 136-byte text files with the wrong extension, so they had never worked. Both typefaces are now genuinely bundled, so the app looks the same online and off, and that connection is gone.

While fixing it we audited everything else the app sends out and found two more things the docs never mentioned: Spotify was being polled every 10 seconds while connected, and Gemini web access (opt-in, but undisclosed here).

So now:

- **A network light in the top-left.** Dim when nothing is happening, amber only while something is genuinely leaving your machine — and it says what, in plain words: "downloading a model", "checking for updates".
- **An offline lock** in Settings → Privacy. Turn it on and emb3r refuses every outbound connection. It's enforced where the connections are actually made, so it applies even to code inside the app's dependencies — not just greyed-out buttons.
- **A log of every connection since launch**, so you can check for yourself rather than trusting a claim.

The lock covers this app, not your whole computer, and the interface says so plainly rather than implying more.

**It picks a model that suits your machine.** emb3r now reads your GPU and its memory, not just your RAM, and recommends the largest model that will actually run *well* — not the smallest that fits. A machine with a decent graphics card gets offered something worth its hardware; a laptop without one is still kept out of trouble, because a model that technically fits but answers at a crawl is worse than a smaller one that doesn't.

The model list is legible now too: each one says what it's good at, where it gives up, and how it'll perform *on your machine specifically* — plus a download-time estimate measured from your actual connection.

**It has its own icon.** The app, taskbar, shortcut and installer no longer show Electron's default diamond.

## New since v1.0.9

- The **Gemini model is now overridable** in Settings → Web access, instead of a single hardcoded default — useful if your account doesn't have access to "gemini-flash-latest" but does work with a specific model like "gemini-2.5-flash"

## New since v1.0.8

- **It's now obvious when a message is going to the web.** Automatic web-access detection only asks permission once, ever — after that it silently routes matching messages to Gemini. Now you get an unmissable notice the moment it happens, not just a subtle label after the fact, and past conversations show which replies used the web too

## New since v1.0.7

- Gemini web access now **falls back to the local model instead of dead-ending** when it fails (rate limit, bad key, etc.), with a plain-English explanation instead of a raw API error

## New since v1.0.6

- File attachments **now always accept ordinary ~20KB files**, regardless of which model is loaded — the previous fix still fell short of that on the smallest context size

## New since v1.0.5

- Fixed **your own chat messages being nearly invisible in light theme** — they were a fixed color unrelated to the theme or your chosen accent color; now they track your accent (at a distinct shade from Ember's replies) and stay legible in both themes
- File attachments can now use **more of the model's context window** (up to 70%, up from 50%)

## New since v1.0.4

- **Settings is now a full page with tabs** (Account, Personality, Spotify, Web access, Models, Hardware, Updates, Display) instead of a small overlay panel you had to scroll through
- The clipboard icon on each message is **always visible** now, instead of only appearing on hover
- Fixed **Gemini web access returning an error for everyone** — it was pointed at a model Google has since retired
- Custom accent colors are now kept **readable against the background** — picking a very dark color in dark mode (or very light in light mode) could previously make the whole app illegible

## New since v1.0.2

- **Replies stream in** as they're generated, with a stop button and a live tokens/sec + context readout
- **Conversation history** — each profile now keeps its own chats, saved to disk and restored on launch
- **Copy buttons** on every message and for the whole conversation
- **Editable personality** — the instructions that define Ember are no longer hardcoded; change them in Settings
- **Checks for updates from inside the app** (see below)
- File attachments are validated — rejects anything that isn't actually text, and anything too large for the model's context window

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
