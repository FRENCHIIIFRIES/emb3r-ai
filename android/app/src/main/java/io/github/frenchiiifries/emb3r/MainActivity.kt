package io.github.frenchiiifries.emb3r

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import io.github.frenchiiifries.emb3r.infer.Microphone
import io.github.frenchiiifries.emb3r.models.ModelImporter
import io.github.frenchiiifries.emb3r.ui.App
import io.github.frenchiiifries.emb3r.ui.ChatModel
import io.github.frenchiiifries.emb3r.ui.Dictation
import io.github.frenchiiifries.emb3r.ui.Emb3rTheme
import io.github.frenchiiifries.emb3r.ui.ImportState
import io.github.frenchiiifries.emb3r.ui.MicAccess
import io.github.frenchiiifries.emb3r.ui.TalkModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var engine: Engine
    private lateinit var chat: ChatModel
    private lateinit var talk: TalkModel
    private var importState by mutableStateOf<ImportState>(ImportState.Idle)
    private var askedForMic = false

    private val micRequest = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val folderPick = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) importFrom(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        engine = Engine(applicationContext, lifecycleScope)
        chat = ChatModel(lifecycleScope, engine::answers, engine::modelName).also { it.startClocks(lifecycleScope) }
        talk = TalkModel(lifecycleScope, engine::answers, engine::speaks, engine::hears, Microphone(), ::micAccess)
        val dictation = TerminalDictation()

        setContent {
            Emb3rTheme(dark = true) {
                App(engine, chat, talk, dictation, importState, onImport = { folderPick.launch(null) })
            }
        }
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
        engine.unloadAll()
        importState = ImportState.Copying(0f, "starting")
        lifecycleScope.launch {
            importState = try {
                val what = ModelImporter(applicationContext).import(tree) { p ->
                    importState = ImportState.Copying(if (p.total > 0) p.copied.toFloat() / p.total else 0f, p.current)
                }
                engine.refresh()
                engine.warmAnswers()
                ImportState.Done(what)
            } catch (e: Throwable) {
                ImportState.Failed(e.message ?: "the import did not finish")
            }
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
}
