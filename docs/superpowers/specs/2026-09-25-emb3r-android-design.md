# emb3r for Android — design

**Date:** 25 September 2026
**Status:** built and running on the phone; see "Answered on the phone"

## What this is

A phone app that holds a conversation with a language model running on the phone,
speaks and listens on the phone, and **cannot reach the network at all**.

It is the same claim the desktop app makes, kept the same way: the honest part is
not that nothing leaves, it is that nothing *can*.

## Why it is worth building

The desktop app's Tiny tier exists because of a laptop with 0.44 GB of memory free.
A phone is that constraint permanently. Gemma 3 1B was added to the catalogue in
step 38 after being asked three questions on that laptop; it is also published in
the format Android's on-device LLM library wants. The work already done chooses the
model for this.

## Goal, and what is out of scope

**In scope for v1**

- Chat with a model held on the phone: streaming reply, stop, the ASCII face.
- Talk: hold to speak, heard on the phone, answered on the phone, spoken back in
  Ember's own voice.
- A model screen: import the model files once, see what is loaded.
- Proof of the offline claim, demonstrated rather than asserted.

**Explicitly not in v1** — every one of these exists on the desktop and is being
left out on purpose, to be added later if it earns its place:

- Web access, Gemini, any other provider. There is no network. That is the point.
- Attachments, memory, profiles, conversation history, personality editing,
  student mode, themes beyond the accent colour, in-app updates.
- A model catalogue with downloads (see "The offline guarantee" for why).

## The offline guarantee

**The app does not declare `android.permission.INTERNET`.**

Android refuses every socket the process could open, enforced by the operating
system rather than by application code. This is stronger than the desktop's
content security policy and network guard, because it is not the app's own code
doing the refusing.

Two consequences, both accepted deliberately:

1. **No in-app model download.** The model files are copied to the phone by the
   user and imported once through the system file picker. A download would require
   the permission, and the permission would end the guarantee.
2. **No system speech services.** Android's own speech recogniser and
   text-to-speech run in other processes whose network use this app cannot prove.
   Both models are therefore carried by the app itself.

**How it is proved, not claimed:** the About screen has a button that attempts a
real connection to a real host and shows the refusal Android returns. The desktop
lists the connections it made; the phone demonstrates it is incapable of making
one. That screenshot belongs in the timeline.

## The stack, verified 25 September 2026

Nothing below is listed from memory. Versions, sizes and the voice's existence were
each checked before this document was written — the project has twice shipped a
model that loaded and did nothing.

| Part | Dependency | Verified |
|---|---|---|
| Chat | `com.google.mediapipe:tasks-genai:0.10.27` | Google's on-device LLM library. Prebuilt native code, no NDK needed |
| Voice and ears | `com.k2fsa.sherpa.onnx:sherpa-onnx-android:1.13.2` | On Maven Central. Kokoro TTS and Whisper ASR in one library, ONNX Runtime underneath |
| UI | Kotlin, Jetpack Compose, Material 3 | Android structure, emb3r skin |

### Models, and where they come from

| Model | Size | Purpose |
|---|---|---|
| Gemma 3 1B IT, int4, `.task` | 529 MB | The answering model. Already in the desktop catalogue |
| `kokoro-multi-lang-v1_0` | ~310 MB | Ember's voice. **`bf_lily` is speaker 23** in this bundle, and espeak-ng data ships inside it |
| Whisper tiny (sherpa-onnx bundle) | ~100 MB | Hearing. The desktop uses `whisper-tiny.en`; whether the sherpa-onnx bundle is the English-only build or the multilingual one is settled when the bundle is chosen, and the difference is size, not capability here |

The Kokoro bundle solves the one problem that could have cost Ember her voice:
turning text into phonemes. On the desktop that came free with the JavaScript
library; on Android it arrives inside this bundle as espeak-ng data, so no separate
phonemiser has to be found or built.

The bundle is larger than the desktop's 92 MB q8 Kokoro. That is the price of
keeping the same voice rather than accepting a different one, and it is a price
worth paying — see step 34, where the closest-by-pitch voice shipped and came back
as "more like an Emily than an Ember".

### How the models get onto the phone

One import, not three. The user copies a single `emb3r-models` folder to the phone
(browser download or USB), then picks that folder once in the app. The app takes a
persistable read permission for that folder and remembers it. The About screen
lists what it found, with sizes.

This keeps the APK small enough to move around and makes the first run a single
step rather than three.

### The build environment, as it stands

Checked on the development machine before choosing this stack:

| | |
|---|---|
| Android Studio and SDK | installed, with platforms `android-35` and `android-37.0`, build-tools `34.0.0` and `36.0.0`, `adb`, and a bundled JDK |
| NDK and CMake | **not installed** — and not needed, because every native dependency above ships prebuilt |
| Emulator image, connected device | none yet. The phone is the test target |

`compileSdk 35` with build-tools `36.0.0`, `minSdk 29`. Gradle and the dependencies
download on first build — on the development machine, which is allowed to use the
network. The phone is the thing that never does.

## The app, in pieces

Four screens, bottom navigation, Android's own back behaviour.

| Screen | Does |
|---|---|
| **Chat** | The terminal: monospace, accent colour, the ASCII face above the transcript. Streaming reply, stop button |
| **Talk** | Hold to speak. The face shows listening, thinking, speaking, as the desktop's does |
| **Model** | Import the folder; what is loaded, what each file is, how much memory it wants |
| **About** | The network proof button, model provenance, version, and what this app deliberately cannot do |

**How a question flows in Talk**

```
hold  ->  16 kHz mono PCM  ->  Whisper (sherpa-onnx)  ->  text
      ->  Gemma 3 1B (MediaPipe)  ->  sentences
      ->  Kokoro, bf_lily (sherpa-onnx)  ->  audio out
```

Every arrow stays inside the process. No step is capable of leaving it.

## Architecture

Small units with one purpose each, so they can be understood and tested apart:

- `ModelStore` — the imported folder: locating files, reporting what is present and
  how big, holding the persistable URI. Knows nothing about inference.
- `Answerer` — wraps MediaPipe's `LlmInference`. Takes a question, emits a stream of
  text, can be asked to stop. Knows nothing about the UI.
- `Ears` — wraps sherpa-onnx recognition. Takes PCM, returns text.
- `Voice` — wraps sherpa-onnx Kokoro at speaker 23. Takes a sentence, returns audio,
  plays it, can be silenced.
- `NetworkProof` — attempts a connection and reports exactly how it failed.
- Compose screens hold no inference logic; each reads one view model.

The speech pieces are deliberately separate from the answering piece, because on
the desktop those two competed for memory and the fix was about *who is using what,
when* (step 40). The same question will come up here, on a device with less to
spare.

## What happens when something fails

The rule from steps 39 and 40, carried over: **no silent failure, and never destroy
the answer to show the error.**

| Situation | What the app does |
|---|---|
| No model imported yet | The chat screen says so and points at the model screen. It does not look broken |
| Model file missing or unreadable | Names the file it wanted and where it looked |
| Out of memory loading the model | Says it ran out of memory, with the size it tried to load — not a stack trace |
| Out of memory mid-reply | Keeps the words already produced, says why it stopped |
| Microphone permission refused | The face says so, as the desktop does; Talk stays usable for reading |
| Speech fails | Says why **underneath the answer**, never in place of it |
| Whisper hears nothing | "I did not catch that" — an empty recording is not an error |

## How it is verified

- **On a real device.** The phone over USB or wireless debugging; build, install and
  drive it from the development machine; screenshots pulled from the device with
  `adb exec-out screencap` for the timeline. Emulator screenshots are a last resort
  and would be labelled as such.
- **The offline claim is tested, not assumed.** A test asserts the manifest declares
  no `INTERNET` permission, and the About screen's proof is exercised on device.
- **Speech memory is measured**, as it was on the desktop: process memory before
  loading, with the model held, and after release.
- **CI** gets an Android job building a debug APK on every change, uploaded as an
  artifact. Merge-on-green becomes four checks rather than three.

## Build order

1. **A spike, first.** Gemma answering one question on the phone through MediaPipe,
   and Kokoro saying one sentence as `bf_lily` through sherpa-onnx. No UI worth the
   name. It tests the two things that would change the design if they were wrong.
2. **Chat**, end to end: import, ask, stream, stop, plus the network proof.
3. **Talk**: hold to speak, the three models in a line, the face following state.

Each stage ends with something installable and a screenshot from a real phone.

## Answered on the phone - Nothing Phone (3a), Android 17, 25 September

Measured on the real device by the spike test, not assumed:

| Question | Answer |
|---|---|
| Does stop cancel generation, or only hide it? | **It cancels.** A full reply took 5.0 s for 196 characters; stopped after the first chunk, the same request ended at 0.8 s with 25. |
| Does the Qwen template fix hold? | **Yes.** Asked who she is: "I'm a small terminal-dwelling, artificial intelligence." Nothing of the bundle's "You are Qwen". |
| Can she hear herself? | **Yes.** Kokoro said "The capital of France is Paris."; Whisper heard exactly that, in 1.3 s. |
| How fast is the answering model? | Loads in 1.4 s; 55 characters in 4.0 s. |
| How fast is her voice? | **Slower than real time.** 2.6 s of speech takes 3.2 s to make (RTF 1.25), so she pauses between sentences. This bundle's model is full precision; an int8 Kokoro would be faster, if it still carries bf_lily - to be checked, not assumed. |
| What does Android say the app may do? | One permission, RECORD_AUDIO, not granted until asked. No INTERNET - and pressed on 5G, the proof reads "Permission denied (missing INTERNET permission?)". |

A limit worth recording rather than hiding: at 0.5B parameters she follows her
instructions loosely - she describes herself but rarely says her name, and slang
("wyd") loses her. That is the smallest model's ceiling, not a fault in the app.

## Open questions, named rather than discovered later

- **Can a reply be cancelled mid-generation?** The desktop's stop button genuinely
  stops the work. If MediaPipe can only discard the remainder, the app will say
  "stopped" and mean it honestly, and the difference will be recorded.
- **GPU or CPU backend.** GPU is faster and not available on every device. Start on
  CPU, measure, and offer GPU only if measurement supports it.
- **Total import size.** About 0.9 GB across three models. Fine on the target phone;
  worth stating plainly on the model screen.
- **Whisper bundle size** is approximate until the exact sherpa-onnx bundle is
  chosen.

## Evidence obligations

This counts as personal-project work, so it carries the same obligations as
everything else: a timeline step per stage with screenshots from the real device,
vault notes, and the same rule that a fault is shown failing before it is fixed.

The Criterion B document is already written around the desktop app and does not
need rewriting. If this port produces evidence stronger than something already in
the ten, that is a swap to make deliberately, not by accident.
