# emb3r for Android — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that answers, speaks and listens entirely on the phone, and cannot reach the network because it never asks Android for permission to.

**Architecture:** One Gradle module. Compose UI over four screens, each reading one view model. Inference lives behind four small wrappers — `ModelStore`, `Answerer`, `Ears`, `Voice` — none of which know about the UI. A Gradle task fails the build if the merged manifest ever contains `INTERNET`.

**Tech Stack:** Kotlin, Jetpack Compose (Material 3), `com.google.mediapipe:tasks-genai:0.10.27`, `com.k2fsa.sherpa.onnx:sherpa-onnx-android:1.13.2`.

Spec: `docs/superpowers/specs/2026-09-25-emb3r-android-design.md`.

## Global constraints

- **No `android.permission.INTERNET`, ever.** Task 2 enforces this in the build. If a dependency needs it, the dependency is wrong, not the rule.
- **Design tokens are exact, taken from `src/index.html`:** background `#0b0f0b`, text `#7CFF9E`, the user's own words `#CFFFDA`, hover/surface `#162219`, glow radii 2px and 6px. Light theme: `#f4fbf6`, `#1b7a3c`, `#1a5c33`, `#dff2e4`.
- **Typefaces are the desktop's:** VT323 for the wordmark and the big face, JetBrains Mono for everything else. Converted from `src/fonts/*.woff2`, licences carried across.
- **Faces are copied verbatim** from `FACES` in `src/renderer.js` — all 25, including `listening`, `hearing`, `puzzled`, `talking`, `deaf`, `offline`.
- **Buttons are bracketed, lowercase:** `[ send ]`, `[o]`, `[ stop ]`, `[ ≡ ]`, `[ back to the terminal ]`.
- **Ember's voice is `bf_lily` — speaker 23** of `kokoro-multi-lang-v1_0`, generated at 0.9 speed and played at 1.11, matching `VOICE_GENERATE_SPEED` and `VOICE_PLAYBACK_RATE` in `main.js`.
- **No silent failures.** Every failure path names what went wrong, and a speech failure never replaces the answer on screen.
- `compileSdk 35`, `buildToolsVersion "36.0.0"`, `minSdk 29`, Kotlin JVM target 17, JDK from Android Studio's bundled `jbr`.
- Package: `io.github.frenchiiifries.emb3r`.

---

### Task 1: Fonts and faces, carried over exactly

**Files:**
- Create: `android/app/src/main/res/font/jetbrains_mono_regular.ttf`, `vt323_regular.ttf`
- Create: `android/app/src/main/java/io/github/frenchiiifries/emb3r/ui/Faces.kt`
- Create: `android/app/src/test/java/io/github/frenchiiifries/emb3r/ui/FacesTest.kt`
- Create: `android/app/src/main/res/font/LICENSES.txt` (copied from `src/fonts/*LICENSE.txt`)

**Interfaces:**
- Produces: `object Faces { val idle: String; val listening: String; … ; fun forState(s: FaceState): String }`, `enum class FaceState { IDLE, THINK, HAPPY, SAD, SLEEPING, ERROR, LISTENING, HEARING, PUZZLED, TALKING, DEAF, OFFLINE, DIZZY, SURPRISED, WINK }`

- [ ] **Step 1: Convert the two fonts from woff2 to ttf**

```bash
pip install fonttools brotli
cd "C:/Users/dobar/OneDrive/Desktop/emb3r"
python -c "
from fontTools.ttLib import TTFont
for src, dst in [('src/fonts/jetbrains-mono-latin-400-normal.woff2','android/app/src/main/res/font/jetbrains_mono_regular.ttf'),
                 ('src/fonts/vt323-latin-400-normal.woff2','android/app/src/main/res/font/vt323_regular.ttf')]:
    f = TTFont(src); f.flavor = None; f.save(dst); print(dst, f['head'].unitsPerEm)
"
```

- [ ] **Step 2: Write the failing test** — the faces must match the desktop character for character

```kotlin
class FacesTest {
    @Test fun `voice faces match the desktop exactly`() {
        assertEquals("( O_O )", Faces.listening)
        assertEquals("( ·_· )?", Faces.hearing)
        assertEquals("( ?_? )", Faces.puzzled)
        assertEquals("( ×_· )", Faces.deaf)
        assertEquals("( ^_^ )", Faces.idle)
    }
    @Test fun `every state has a face`() {
        FaceState.values().forEach { assertTrue(Faces.forState(it).isNotBlank()) }
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*FacesTest*"`
Expected: FAIL — `Faces` does not exist.

- [ ] **Step 4: Write `Faces.kt`**, copying every entry from `FACES` in `src/renderer.js` verbatim, including the comments explaining why `listening` is not `surprised`.

- [ ] **Step 5: Run the test again**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/res/font android/app/src/main/java/io/github/frenchiiifries/emb3r/ui/Faces.kt android/app/src/test
git commit -m "Ember's faces and typefaces, carried over exactly"
```

---

### Task 2: The project, and a build that refuses the internet

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/io/github/frenchiiifries/emb3r/MainActivity.kt`
- Create: `android/no-internet.gradle.kts` (the guard)
- Create: `.github/workflows/android.yml`

**Interfaces:**
- Produces: a debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`; Gradle task `assertNoInternetPermission`.

- [ ] **Step 1: Write the guard first, and prove it can fail**

`android/no-internet.gradle.kts`:

```kotlin
val assertNoInternetPermission by tasks.registering {
    val manifests = layout.buildDirectory.dir("intermediates/merged_manifests")
    doLast {
        val offenders = manifests.get().asFile.walkTopDown()
            .filter { it.name == "AndroidManifest.xml" }
            .filter { it.readText().contains("android.permission.INTERNET") }
            .toList()
        if (offenders.isNotEmpty()) {
            throw GradleException(
                "This app must not be able to reach the network. INTERNET appears in: " +
                    offenders.joinToString { it.path }
            )
        }
        logger.lifecycle("no INTERNET permission in any merged manifest")
    }
}
tasks.matching { it.name.startsWith("assemble") }.configureEach { finalizedBy(assertNoInternetPermission) }
```

- [ ] **Step 2: Scaffold the Gradle project** with the versions in Global constraints, `apply(from = "../no-internet.gradle.kts")` in `app/build.gradle.kts`, and a manifest declaring only `RECORD_AUDIO`.

- [ ] **Step 3: Prove the guard actually catches it** — temporarily add `<uses-permission android:name="android.permission.INTERNET"/>` to the manifest

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: FAIL with "This app must not be able to reach the network".

- [ ] **Step 4: Remove that line, build again**

Expected: PASS, and the log says `no INTERNET permission in any merged manifest`.

- [ ] **Step 5: Add the CI job** `.github/workflows/android.yml` — `actions/setup-java@v4` with Temurin 17, `gradle/actions/setup-gradle`, run `./gradlew :app:assembleDebug`, upload the APK as an artifact.

- [ ] **Step 6: Commit**

```bash
git add android .github/workflows/android.yml
git commit -m "An Android project whose build fails if it can reach the network"
```

---

### Task 3: The theme — the desktop's colours, glow and type

**Files:**
- Create: `android/app/src/main/java/io/github/frenchiiifries/emb3r/ui/Theme.kt`
- Create: `android/app/src/test/java/io/github/frenchiiifries/emb3r/ui/ThemeTest.kt`

**Interfaces:**
- Produces: `object Emb3rTokens { val bg: Color; val text: Color; val userText: Color; val hover: Color; val glowSmall: Dp; val glowBig: Dp }`, `@Composable fun Emb3rTheme(dark: Boolean = true, accent: Color = Emb3rTokens.text, content: @Composable () -> Unit)`, `Modifier.phosphor(color: Color)` for the glow.

- [ ] **Step 1: Write the failing test** — tokens must equal the desktop's hexes

```kotlin
class ThemeTest {
    @Test fun `dark tokens match src index html`() {
        assertEquals(0xFF0B0F0B, Emb3rTokens.bg.value.toLong() ushr 32)
        assertEquals(0xFF7CFF9E, Emb3rTokens.text.value.toLong() ushr 32)
        assertEquals(0xFFCFFFDA, Emb3rTokens.userText.value.toLong() ushr 32)
        assertEquals(0xFF162219, Emb3rTokens.hover.value.toLong() ushr 32)
    }
}
```

- [ ] **Step 2: Run it, watch it fail.** Expected: FAIL — unresolved reference `Emb3rTokens`.

- [ ] **Step 3: Write `Theme.kt`** with those four colours, the light set (`#f4fbf6`, `#1b7a3c`, `#1a5c33`, `#dff2e4`), both font families, and `phosphor()` drawing the 2px and 6px glow as a blurred shadow of the text colour.

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "The desktop's palette, type and phosphor glow"
```

---

### Task 4: ModelStore — one folder, imported once

**Files:**
- Create: `…/models/ModelStore.kt`, `…/models/ModelSet.kt`
- Create: `android/app/src/test/java/…/models/ModelStoreTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces: `data class ModelSet(val llm: ModelFile?, val kokoroDir: ModelFile?, val whisperDir: ModelFile?)`, `data class ModelFile(val name: String, val bytes: Long, val uri: String)`, `class ModelStore(private val tree: TreeReader)` with `fun scan(): ModelSet` and `fun missing(): List<String>`; `interface TreeReader { fun list(): List<ModelFile> }` so the scan is testable without Android.

- [ ] **Step 1: Write the failing tests**

```kotlin
class ModelStoreTest {
    private fun store(vararg names: String) =
        ModelStore(object : TreeReader {
            override fun list() = names.map { ModelFile(it, 1024, "content://x/$it") }
        })

    @Test fun `finds the three models in an imported folder`() {
        val set = store("gemma3-1b-it-int4.task", "kokoro-multi-lang-v1_0", "sherpa-onnx-whisper-tiny.en").scan()
        assertEquals("gemma3-1b-it-int4.task", set.llm?.name)
        assertNotNull(set.kokoroDir); assertNotNull(set.whisperDir)
    }

    @Test fun `names what is missing rather than failing blankly`() {
        assertEquals(listOf("the answering model", "Ember's voice"), store("sherpa-onnx-whisper-tiny.en").missing())
    }

    @Test fun `any task file counts as the answering model`() {
        assertNotNull(store("some-other-model.task").scan().llm)
    }
}
```

- [ ] **Step 2: Run them, watch them fail.**

- [ ] **Step 3: Implement `ModelStore`** — `.task` for the LLM, a directory containing `kokoro` for the voice, a directory containing `whisper` for the ears.

- [ ] **Step 4: Run them. Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -am "Find the three models in one imported folder, and say which are missing"
```

---

### Task 5: The spike — Gemma answers, Kokoro speaks, on the phone

This is the task the design said to do first. It exists to answer two questions before any UI is built on top of them.

**Files:**
- Create: `…/infer/Answerer.kt`, `…/infer/Voice.kt`
- Create: `android/app/src/androidTest/java/…/SpikeTest.kt`

**Interfaces:**
- Produces: `class Answerer(context, modelPath: String)` with `fun ask(prompt: String): Flow<String>`, `fun stop()`, `fun close()`; `class Voice(context, kokoroDir: String)` with `suspend fun say(text: String): FloatArray`, `val speakerId = 23`.

- [ ] **Step 1: Write the on-device test**

```kotlin
@RunWith(AndroidJUnit4::class)
class SpikeTest {
    @Test fun gemma_answers_a_question_on_this_phone() = runBlocking {
        val answerer = Answerer(ctx, modelPath)
        val reply = answerer.ask("Name one planet.").toList().joinToString("")
        assertTrue("got nothing back: the model loaded and said nothing", reply.trim().isNotEmpty())
        answerer.close()
    }

    @Test fun kokoro_speaks_as_bf_lily() = runBlocking {
        val audio = Voice(ctx, kokoroDir).say("Nothing you type leaves this phone.")
        assertTrue("no audio produced", audio.size > 8000)
    }
}
```

- [ ] **Step 2: Run it on the phone**

Run: `cd android && ./gradlew :app:connectedDebugAndroidTest`
Expected: FAIL — `Answerer` does not exist.

- [ ] **Step 3: Implement `Answerer`** over `LlmInference` + `LlmInferenceSession`, emitting partial results into a `callbackFlow`, CPU backend, `maxTokens = 512`.

- [ ] **Step 4: Implement `Voice`** over sherpa-onnx `OfflineTts`, `sid = 23`, `speed = 0.9`, returning the sample buffer.

- [ ] **Step 5: Run on the phone again.** Expected: PASS, with the reply text and audio length printed.

- [ ] **Step 6: Record the answer to the open question** — whether `stop()` cancels generation or merely discards the remainder. Time a stopped reply against a completed one; write the result into the spec's Open questions section.

- [ ] **Step 7: Commit**

```bash
git commit -am "Spike: Gemma answers and Kokoro speaks as bf_lily, on the phone"
```

---

### Task 6: The chat screen

**Files:**
- Create: `…/ui/ChatScreen.kt`, `…/ui/ChatViewModel.kt`
- Create: `android/app/src/test/java/…/ui/ChatViewModelTest.kt`

**Interfaces:**
- Consumes: `Answerer`, `ModelStore`, `Faces`, `Emb3rTheme`.
- Produces: `class ChatViewModel(answerer: Answerer?)` with `val lines: StateFlow<List<Line>>`, `val face: StateFlow<FaceState>`, `fun send(text: String)`, `fun stop()`; `data class Line(val who: Who, val text: String)`, `enum class Who { YOU, EMBER, SYSTEM }`.

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `a reply streams in and the face follows`() = runTest {
    val vm = ChatViewModel(FakeAnswerer(listOf("Par", "is")))
    vm.send("capital of france?")
    assertEquals(FaceState.THINK, vm.face.value)
    advanceUntilIdle()
    assertEquals("Paris", vm.lines.value.last().text)
    assertEquals(FaceState.IDLE, vm.face.value)
}

@Test fun `with no model imported it says so instead of looking broken`() = runTest {
    val vm = ChatViewModel(answerer = null)
    vm.send("hello")
    assertEquals(Who.SYSTEM, vm.lines.value.last().who)
    assertTrue(vm.lines.value.last().text.contains("no model"))
}

@Test fun `stopping keeps the words already said`() = runTest {
    val vm = ChatViewModel(FakeAnswerer(listOf("one ", "two ", "three")))
    vm.send("count"); advanceTimeBy(1); vm.stop(); advanceUntilIdle()
    assertTrue(vm.lines.value.last().text.isNotEmpty())
}
```

- [ ] **Step 2: Run them, watch them fail.**

- [ ] **Step 3: Implement `ChatViewModel`.**

- [ ] **Step 4: Implement `ChatScreen`** — the face at the top in VT323, the transcript in JetBrains Mono with `you ❯` in `#CFFFDA` and Ember's words in the accent, a `[o]` button and `[ send ]` beside the input, `[ stop ]` replacing send while generating, and the network line `no network activity` pinned top-left.

- [ ] **Step 5: Run the tests. Expected: PASS.**

- [ ] **Step 6: Commit**

```bash
git commit -am "The terminal, on a phone"
```

---

### Task 7: Ears, and the Talk screen

**Files:**
- Create: `…/infer/Ears.kt`, `…/ui/TalkScreen.kt`, `…/ui/TalkViewModel.kt`
- Create: `android/app/src/test/java/…/ui/TalkViewModelTest.kt`

**Interfaces:**
- Consumes: `Answerer`, `Voice`, `Faces`.
- Produces: `class Ears(context, whisperDir: String)` with `suspend fun hear(pcm: FloatArray): String`; `class TalkViewModel(...)` with `fun hold()`, `fun release()`, `val face: StateFlow<FaceState>`, `val said: StateFlow<String>`, `val heard: StateFlow<String>`, `val trouble: StateFlow<String?>`.

- [ ] **Step 1: Write the failing tests** — including the lesson from step 40

```kotlin
@Test fun `a voice failure keeps the answer on screen`() = runTest {
    val vm = TalkViewModel(answerer = FakeAnswerer(listOf("Paris.")), voice = FailingVoice(), ears = FakeEars("capital of france"))
    vm.hold(); vm.release(); advanceUntilIdle()
    assertEquals("Paris.", vm.said.value)
    assertTrue(vm.trouble.value!!.contains("couldn't speak"))
}

@Test fun `hearing nothing is not an error`() = runTest {
    val vm = TalkViewModel(FakeAnswerer(emptyList()), FakeVoice(), FakeEars(""))
    vm.hold(); vm.release(); advanceUntilIdle()
    assertEquals(FaceState.PUZZLED, vm.face.value)
    assertNull(vm.trouble.value)
}

@Test fun `a refused microphone shows on the face`() = runTest {
    val vm = TalkViewModel(FakeAnswerer(emptyList()), FakeVoice(), DeniedEars())
    vm.hold(); advanceUntilIdle()
    assertEquals(FaceState.DEAF, vm.face.value)
}
```

- [ ] **Step 2: Run them, watch them fail.**

- [ ] **Step 3: Implement `Ears`** over sherpa-onnx `OfflineRecognizer`, 16 kHz mono from `AudioRecord`.

- [ ] **Step 4: Implement `TalkViewModel` and `TalkScreen`** — the big face in VT323, `hold to talk`, `hold the button or the spacebar · esc to go back` replaced by `[ back to the terminal ]`, trouble text *under* the answer at 0.78em and 75% opacity, matching `.faceTrouble`.

- [ ] **Step 5: Run the tests. Expected: PASS.**

- [ ] **Step 6: Commit**

```bash
git commit -am "Talk: she hears you and answers out loud, on the phone"
```

---

### Task 8: Model and About screens, and the proof

**Files:**
- Create: `…/ui/ModelScreen.kt`, `…/ui/AboutScreen.kt`, `…/net/NetworkProof.kt`
- Create: `android/app/src/androidTest/java/…/NetworkProofTest.kt`

**Interfaces:**
- Produces: `object NetworkProof { suspend fun attempt(host: String = "example.com", port: Int = 80): String }` returning the refusal text.

- [ ] **Step 1: Write the on-device test**

```kotlin
@Test fun the_app_cannot_open_a_socket() = runBlocking {
    val result = NetworkProof.attempt()
    assertTrue("expected Android to refuse, got: $result", result.contains("Permission denied", true) || result.contains("SecurityException", true))
}
```

- [ ] **Step 2: Run on the phone.** Expected: FAIL — `NetworkProof` does not exist.

- [ ] **Step 3: Implement `NetworkProof`** — open a `Socket`, catch `SecurityException` / `IOException`, return the message.

- [ ] **Step 4: Implement both screens.** Model: the import button, what was found with sizes, what is missing. About: the proof button and its result, which model is loaded, and a line saying the app holds no internet permission.

- [ ] **Step 5: Run the test on the phone. Expected: PASS.**

- [ ] **Step 6: Commit**

```bash
git commit -am "Prove it: the app tries the network and shows the refusal"
```

---

### Task 9: Onto the phone, and into the record

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-emb3r-android-design.md` (answer the open questions)
- Create: timeline step 41 in `C:\Users\dobar\Music\emb3r evidence\generators\build_timeline_pdf.py`
- Create: vault note `Steps/41. emb3r on a phone.md`, `Timeline.md` entry

- [ ] **Step 1: Get the models onto the phone**

```bash
adb push emb3r-models /sdcard/Download/emb3r-models
```

- [ ] **Step 2: Install**

```bash
cd android && ./gradlew :app:installDebug && adb shell monkey -p io.github.frenchiiifries.emb3r 1
```

- [ ] **Step 3: Screenshots from the real device**

```bash
adb exec-out screencap -p > chat-phone.png
adb exec-out screencap -p > talk-phone.png
adb exec-out screencap -p > proof-phone.png
```

- [ ] **Step 4: Measure** process memory with the model loaded and after release, as the desktop did: `adb shell dumpsys meminfo io.github.frenchiiifries.emb3r`.

- [ ] **Step 5: Write the timeline step and the vault note**, with the screenshots, the memory figures, and the answer to the cancellation question.

- [ ] **Step 6: Commit and open the pull request.**

---

## Self-review

**Spec coverage:** offline guarantee → Task 2 and 8. Models and import → Task 4 and 9. Chat → Task 6. Talk → Task 7. Four screens → Tasks 6, 7, 8. Design language → Tasks 1 and 3. Failure rules → Tasks 6 and 7 tests. Verification and evidence → Task 9. CI → Task 2.

**Not covered, deliberately:** the accent-colour picker (the theme accepts an accent; the picker waits until there is something to pick it from), and the salamander mark (Task 6 uses the face; porting the 17-path vector is its own task once the app runs).

**Type consistency:** `ModelFile`/`ModelSet` in Task 4 are what Task 9 imports; `Answerer.ask(): Flow<String>` is consumed unchanged in Tasks 6 and 7; `FaceState` from Task 1 is the type both view models expose.
