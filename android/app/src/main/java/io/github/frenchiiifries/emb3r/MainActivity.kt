package io.github.frenchiiifries.emb3r

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import io.github.frenchiiifries.emb3r.infer.Microphone
import io.github.frenchiiifries.emb3r.models.ModelImporter
import io.github.frenchiiifries.emb3r.settings.ConfigStore
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.ui.App
import io.github.frenchiiifries.emb3r.ui.ChatEvents
import io.github.frenchiiifries.emb3r.ui.ChatModel
import io.github.frenchiiifries.emb3r.ui.Dictation
import io.github.frenchiiifries.emb3r.ui.Emb3rTheme
import io.github.frenchiiifries.emb3r.ui.ImportState
import io.github.frenchiiifries.emb3r.ui.MicAccess
import io.github.frenchiiifries.emb3r.ui.Palettes
import io.github.frenchiiifries.emb3r.ui.Sentences
import io.github.frenchiiifries.emb3r.ui.Sounds
import io.github.frenchiiifries.emb3r.ui.TalkModel
import io.github.frenchiiifries.emb3r.ui.settings.SpeechControls
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File

class MainActivity : ComponentActivity() {

    private lateinit var settings: SettingsModel
    private lateinit var engine: Engine
    private lateinit var sounds: Sounds
    private lateinit var chat: ChatModel
    private lateinit var talk: TalkModel
    private var importState by mutableStateOf<ImportState>(ImportState.Idle)
    private var askedForMic = false
    private var speaking: Job? = null

    private val micRequest = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val folderPick = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) importFrom(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // the desktop's config.json, in the one place on the phone only this app can read
        settings = SettingsModel(ConfigStore(File(filesDir, "config.json")))
        engine = Engine(applicationContext, lifecycleScope, settings)
        sounds = Sounds { settings.now.sounds }
        chat = ChatModel(lifecycleScope, engine::answers, engine::modelName, settings, TerminalEvents())
            .also { it.startClocks(lifecycleScope) }
        talk = TalkModel(
            lifecycleScope, engine::answers, engine::speaks, engine::hears, Microphone(), ::micAccess,
            shaping = settings, speed = { settings.now.voiceSpeed },
        )
        val dictation = TerminalDictation()
        val speech = Speech()

        // the desktop's boot chime, once per launch rather than every time the screen turns
        if (savedInstanceState == null) sounds.bootChime()

        setContent {
            val config by settings.config.collectAsState()
            Emb3rTheme(Palettes.of(config)) {
                App(
                    engine, settings, chat, talk, dictation, importState,
                    onImport = { folderPick.launch(null) },
                    speech = speech,
                    onType = sounds::keyClick,
                )
            }
        }
    }

    /** The terminal's sounds, and her voice reading a finished reply when Settings asks for it. */
    private inner class TerminalEvents : ChatEvents {
        override fun sent() {
            sounds.send()
            // a new question ends whatever she was still reading out
            stopSpeaking()
        }
        override fun replied(text: String) {
            sounds.reply()
            if (settings.now.voice) readAloud(text)
        }
        override fun failed() = sounds.error()
        // stop means stop: what was being read aloud is part of what was asked to end
        override fun stopped() { sounds.reply(); stopSpeaking() }
    }

    /**
     * Reads a finished reply aloud, a sentence at a time - spoken once complete,
     * as on the desktop, because a stream arrives in fragments that are not words.
     * If she cannot, it says why underneath, never in place of the answer.
     */
    private fun readAloud(text: String) {
        stopSpeaking()
        speaking = lifecycleScope.launch {
            val voice = voiceReady() ?: run {
                chat.note("couldn't read that aloud - " + voiceTrouble())
                return@launch
            }
            val (whole, rest) = Sentences.split(text)
            for (sentence in whole + rest.trim()) {
                if (sentence.isBlank()) continue
                runCatching { voice.say(sentence, settings.now.voiceSpeed) }.onFailure {
                    if (it is kotlinx.coroutines.CancellationException) throw it
                    chat.note("couldn't read that aloud - ${it.message ?: "the voice did not answer"}")
                    return@launch
                }
            }
        }
    }

    private fun stopSpeaking() {
        speaking?.cancel()
        speaking = null
        engine.speaks()?.silence()
    }

    /** Her voice, loaded if it was not - it loads only when first needed, as on the desktop. */
    private suspend fun voiceReady(): io.github.frenchiiifries.emb3r.infer.Speaks? {
        engine.speaks()?.let { return it }
        if (engine.paths.kokoroDir == null) return null
        engine.warmSpeech()
        withTimeoutOrNull(60_000) { engine.voiceState.first { it is Part.Ready || it is Part.Failed } }
        return engine.speaks()
    }

    private fun voiceTrouble(): String = when (val s = engine.voiceState.value) {
        is Part.Failed -> s.why
        Part.Missing -> "her voice isn't on this phone yet - bring the kokoro folder in under settings, models"
        else -> "her voice did not load in time"
    }

    /** Display's Hear it and Stop. The preview works with the toggle off, so she can be heard before agreeing to it. */
    private inner class Speech : SpeechControls {
        override suspend fun preview(): String? {
            stopSpeaking()
            val voice = voiceReady() ?: return voiceTrouble()
            return runCatching { voice.say(VOICE_LINE, settings.now.voiceSpeed); null }
                .getOrElse { it.message ?: "the voice did not answer" }
        }
        override fun stop() = stopSpeaking()
    }

    /**
     * The microphone is asked for the first time a button is held - never at
     * launch - and while Android's dialog is up, the app says it is asking
     * rather than that it was refused.
     */
    private fun micAccess(): MicAccess {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            return MicAccess.GRANTED
        }
        if (!askedForMic) {
            askedForMic = true
            micRequest.launch(Manifest.permission.RECORD_AUDIO)
            return MicAccess.ASKING
        }
        return MicAccess.REFUSED
    }

    private fun importFrom(tree: Uri) {
        // a model being replaced must not be open while its file is swapped
        engine.unloadAll()
        importState = ImportState.Copying(0f, "looking in the folder")
        lifecycleScope.launch {
            importState = try {
                val result = ModelImporter(applicationContext).import(tree) { p ->
                    importState = ImportState.Copying(if (p.total > 0) p.copied.toFloat() / p.total else 0f, p.current)
                }
                ImportState.Done(result.imported, result.unchanged)
            } catch (e: Throwable) {
                ImportState.Failed(e.message ?: "the import did not finish")
            }
            engine.refresh()
            engine.warmAnswers()
        }
    }

    /**
     * The terminal's [o]: the same microphone as Talk, a different ending - the
     * words land in the box to be read before sending. Problems are said in the
     * transcript, where the terminal says everything else that goes wrong.
     */
    private inner class TerminalDictation : Dictation {
        private val mic = Microphone()
        private var recording = false

        override fun start(): Boolean {
            when (micAccess()) {
                MicAccess.GRANTED -> Unit
                MicAccess.ASKING -> { chat.note(TalkModel.ASKING_MIC); return false }
                MicAccess.REFUSED -> { chat.note(TalkModel.MIC_REFUSED); return false }
            }
            engine.warmSpeech()
            return try {
                mic.start(); recording = true; true
            } catch (e: Throwable) {
                chat.note(TalkModel.NO_MIC); false
            }
        }

        override suspend fun finish(): String {
            if (!recording) return ""
            recording = false
            val samples = mic.stop()
            if (samples.size < TalkModel.SAMPLE_RATE * 0.3) {
                chat.note(TalkModel.TOO_SHORT); return ""
            }
            val ears = engine.hears() ?: run { chat.note(TalkModel.NO_EARS); return "" }
            val heard = runCatching { ears.hear(samples) }.getOrElse {
                chat.note(it.message ?: "That could not be transcribed."); return ""
            }
            if (heard.isBlank()) chat.note(TalkModel.NOT_CAUGHT)
            return heard
        }
    }

    companion object {
        /** VOICE_LINE in renderer.js: her own claim, the thing worth hearing twice. */
        const val VOICE_LINE = "Hello. I'm Ember. I run on this phone, and nothing you say leaves it."
    }
}
