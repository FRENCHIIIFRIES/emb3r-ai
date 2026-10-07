package io.github.frenchiiifries.emb3r.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Hears
import io.github.frenchiiifries.emb3r.infer.Speaks
import io.github.frenchiiifries.emb3r.infer.Turn
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.settings.ThemeName
import io.github.frenchiiifries.emb3r.ui.settings.Section
import io.github.frenchiiifries.emb3r.ui.settings.SettingsScreen
import io.github.frenchiiifries.emb3r.ui.settings.SpeechControls
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import org.junit.Rule
import org.junit.Test

/**
 * Each screen rendered on this machine, so it can be checked against the
 * desktop before a phone is attached. These are pictures for looking at, not a
 * substitute for the real device: the screenshots in the record come from the
 * phone.
 */
class ScreensSnapshotTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "android:Theme.Material.NoActionBar",
        maxPercentDifference = 0.1,
    )

    // Unconfined runs everything to completion on the spot, so the screens are
    // photographed in the state a real exchange leaves them in.
    private val now = CoroutineScope(Dispatchers.Unconfined)

    private val answers = object : Answers {
        override fun ask(history: List<Turn>, question: String): Flow<String> = flowOf(
            "No. I am running on this phone - the model, your messages and anything you say ",
            "to me stay here. The light in the corner would say so if anything left.",
        )
        override fun stop() = Unit
    }

    @Test
    fun chat() {
        val chat = ChatModel(now, { answers }, { "Qwen2.5 0.5B Instruct" })
        chat.send("does anything I type here leave my phone?")
        paparazzi.snapshot {
            Emb3rTheme(dark = true) {
                ChatScreen(chat, NoDictation, onNewChat = {})
            }
        }
    }

    @Test
    fun talk() {
        val talk = TalkModel(
            now, { answers.let { a -> object : Answers {
                override fun ask(history: List<Turn>, question: String) = flowOf("The capital of France is Paris.")
                override fun stop() = a.stop()
            } } },
            { SilentVoice }, { object : Hears { override suspend fun hear(samples: FloatArray) = "what is the capital of france" } },
            object : Recorder {
                override fun start() = Unit
                override fun stop() = FloatArray(TalkModel.SAMPLE_RATE * 2)
            },
            { MicAccess.GRANTED },
        )
        talk.hold(); talk.release()
        paparazzi.snapshot {
            Emb3rTheme(dark = true) { TalkScreen(talk, onBack = {}) }
        }
    }

    @Test
    fun talkWhenTheVoiceFails() {
        val talk = TalkModel(
            now, { object : Answers {
                override fun ask(history: List<Turn>, question: String) = flowOf("The capital of France is Paris.")
                override fun stop() = Unit
            } },
            { object : Speaks {
                override suspend fun say(text: String, speed: Float) = throw IllegalStateException("there was not enough memory free to load her voice")
                override fun silence() = Unit
            } },
            { object : Hears { override suspend fun hear(samples: FloatArray) = "what is the capital of france" } },
            object : Recorder {
                override fun start() = Unit
                override fun stop() = FloatArray(TalkModel.SAMPLE_RATE * 2)
            },
            { MicAccess.GRANTED },
        )
        talk.hold(); talk.release()
        paparazzi.snapshot {
            Emb3rTheme(dark = true) { TalkScreen(talk, onBack = {}) }
        }
    }

    /** Paparazzi's context has no storage of its own, so each test gets a folder. */
    private fun contextWith(files: java.io.File) = object : android.content.ContextWrapper(paparazzi.context) {
        override fun getFilesDir() = files
    }

    /** A settings model with nothing stored, as a first run has. */
    private fun freshSettings() = SettingsModel(null)

    private fun settingsAt(section: Section, settings: SettingsModel = freshSettings(), files: java.io.File? = null, dark: Boolean = true) {
        val dir = files ?: kotlin.io.path.createTempDirectory("emb3r-settings").toFile()
        val engine = Engine(contextWith(dir), now, settings)
        paparazzi.snapshot {
            Emb3rTheme(Palettes.of(settings.now.copy(theme = if (dark) ThemeName.DARK else ThemeName.LIGHT))) {
                SettingsScreen(settings, engine, ImportState.Idle, onImport = {}, onNote = {}, speech = SpeechControls.None, start = section)
            }
        }
    }

    @Test
    fun settingsModelsOnFirstRun() = settingsAt(Section.MODELS)

    @Test
    fun settingsModelsImported() {
        val dir = kotlin.io.path.createTempDirectory("emb3r-imported").toFile()
        val models = java.io.File(dir, "models").apply { mkdirs() }
        java.io.File(models, "gemma-4-E2B-it.litertlm").writeBytes(ByteArray(2048))
        java.io.File(models, "qwen2.5-0.5b-instruct-q8.task").writeBytes(ByteArray(1024))
        java.io.File(models, "kokoro-multi-lang-v1_0").mkdirs()
        java.io.File(models, "sherpa-onnx-whisper-tiny.en").mkdirs()
        settingsAt(Section.MODELS, files = dir)
    }

    @Test
    fun settingsAccount() {
        val s = freshSettings()
        s.createProfile("Ziyan")
        s.createProfile("Guest")
        s.switchProfile(s.now.profiles[1].id)
        settingsAt(Section.ACCOUNT, s)
    }

    @Test
    fun settingsPrivacy() = settingsAt(Section.PRIVACY)

    @Test
    fun settingsStudentModeLocked() {
        val s = freshSettings()
        s.setSafeMode(true)
        s.setSafeModePin("2468", null)
        settingsAt(Section.STUDENT, s)
    }

    @Test
    fun settingsPersonality() = settingsAt(Section.PERSONALITY)

    @Test
    fun settingsMemory() {
        val s = freshSettings()
        s.addMemory("I'm learning Python, and I prefer short answers")
        s.addMemory("My dog is called Biscuit")
        settingsAt(Section.MEMORY, s)
    }

    @Test
    fun settingsDisplay() = settingsAt(Section.DISPLAY)

    @Test
    fun settingsDisplayLightWithAccent() {
        val s = freshSettings()
        s.setAccent(io.github.frenchiiifries.emb3r.settings.Accent(28f, 90f, 55f))
        s.setVoice(true)
        settingsAt(Section.DISPLAY, s, dark = false)
    }

    @Test
    fun chatLightWithAccent() {
        val s = freshSettings().apply { setAccent(io.github.frenchiiifries.emb3r.settings.Accent(28f, 90f, 55f)) }
        val chat = ChatModel(now, { answers }, { "Gemma 4 E2B" })
        chat.send("does anything I type here leave my phone?")
        paparazzi.snapshot {
            Emb3rTheme(Palettes.of(s.now.copy(theme = ThemeName.LIGHT))) {
                ChatScreen(chat, NoDictation, onNewChat = {})
            }
        }
    }

    @Test
    fun about() {
        paparazzi.snapshot {
            Emb3rTheme(dark = true) { AboutScreen() }
        }
    }

    private object NoDictation : Dictation {
        override fun start() = false
        override suspend fun finish() = ""
    }

    private object SilentVoice : Speaks {
        override suspend fun say(text: String, speed: Float) = Unit
        override fun silence() = Unit
    }
}
