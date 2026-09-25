package io.github.frenchiiifries.emb3r.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Hears
import io.github.frenchiiifries.emb3r.infer.Speaks
import io.github.frenchiiifries.emb3r.infer.Turn
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
                override suspend fun say(text: String) = throw IllegalStateException("there was not enough memory free to load her voice")
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

    @Test
    fun modelsOnFirstRun() {
        val dir = kotlin.io.path.createTempDirectory("emb3r-first-run").toFile()
        val engine = Engine(contextWith(dir), now)
        paparazzi.snapshot {
            Emb3rTheme(dark = true) { ModelScreen(engine, ImportState.Idle, onImport = {}) }
        }
    }

    @Test
    fun modelsImportedNotYetLoaded() {
        val dir = kotlin.io.path.createTempDirectory("emb3r-imported").toFile()
        val models = java.io.File(dir, "models").apply { mkdirs() }
        java.io.File(models, "qwen2.5-0.5b-instruct-q8.task").writeBytes(ByteArray(1024))
        java.io.File(models, "kokoro-multi-lang-v1_0").mkdirs()
        java.io.File(models, "sherpa-onnx-whisper-tiny.en").mkdirs()
        val engine = Engine(contextWith(dir), now)
        paparazzi.snapshot {
            Emb3rTheme(dark = true) {
                ModelScreen(engine, ImportState.Done(listOf("qwen2.5-0.5b-instruct-q8.task", "kokoro-multi-lang-v1_0", "sherpa-onnx-whisper-tiny.en")), onImport = {})
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
        override suspend fun say(text: String) = Unit
        override fun silence() = Unit
    }
}
