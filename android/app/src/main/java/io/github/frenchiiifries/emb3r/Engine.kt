package io.github.frenchiiifries.emb3r

import android.content.Context
import io.github.frenchiiifries.emb3r.infer.Answerer
import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Ears
import io.github.frenchiiifries.emb3r.infer.Hears
import io.github.frenchiiifries.emb3r.infer.ModelPaths
import io.github.frenchiiifries.emb3r.infer.Speaks
import io.github.frenchiiifries.emb3r.infer.Voice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Where one of the three models stands, said the way the screen will say it. */
sealed interface Part {
    data object Missing : Part
    /** On the phone, not loaded yet - it loads the first time it is needed. */
    data object Present : Part
    data object Loading : Part
    data object Ready : Part
    data class Failed(val why: String) : Part
}

/**
 * Owns the three models. Each is loaded the first time it is needed, off the
 * main thread, and never at launch: the answering model when the terminal
 * opens, her voice and hearing when Talk does. On the desktop, loading speech
 * on the chance cost memory the language model needed (step 39); the same
 * restraint applies here.
 */
class Engine(private val context: Context, private val scope: CoroutineScope) {

    val paths = ModelPaths.inAppStorage(context.filesDir)

    // Imported and not yet loaded is its own state. With only "missing" and
    // "ready", a model sitting on the phone waiting to be needed was labelled
    // "not imported" - found by rendering the model screen, not by reading it.
    private val _llm = MutableStateFlow(presence(paths.llm))
    private val _voice = MutableStateFlow(presence(paths.kokoroDir))
    private val _ears = MutableStateFlow(presence(paths.whisperDir))
    val llm: StateFlow<Part> = _llm.asStateFlow()
    val voiceState: StateFlow<Part> = _voice.asStateFlow()
    val earsState: StateFlow<Part> = _ears.asStateFlow()

    @Volatile private var answerer: Answerer? = null
    @Volatile private var voice: Voice? = null
    @Volatile private var ears: Ears? = null

    fun answers(): Answers? = answerer
    fun speaks(): Speaks? = voice
    fun hears(): Hears? = ears

    /** The name shown under each reply, as the desktop names the model that wrote it. */
    fun modelName(): String? = paths.llm?.name?.let(::prettyModelName)

    fun refresh() {
        if (answerer == null) _llm.value = presence(paths.llm)
        if (voice == null) _voice.value = presence(paths.kokoroDir)
        if (ears == null) _ears.value = presence(paths.whisperDir)
    }

    private fun presence(file: java.io.File?): Part = if (file == null) Part.Missing else Part.Present

    fun warmAnswers() {
        val file = paths.llm ?: run { _llm.value = Part.Missing; return }
        if (answerer != null || _llm.value == Part.Loading) return
        _llm.value = Part.Loading
        scope.launch(Dispatchers.Default) {
            _llm.value = try {
                answerer = Answerer(context, file.path)
                Part.Ready
            } catch (e: Throwable) {
                Part.Failed(loadFailure("the answering model", file.length(), e))
            }
        }
    }

    fun warmSpeech() {
        val k = paths.kokoroDir
        val w = paths.whisperDir
        if (k == null) _voice.value = Part.Missing
        if (w == null) _ears.value = Part.Missing
        if (k != null && voice == null && _voice.value != Part.Loading) {
            _voice.value = Part.Loading
            scope.launch(Dispatchers.Default) {
                _voice.value = try { voice = Voice(k); Part.Ready } catch (e: Throwable) {
                    Part.Failed(loadFailure("her voice", k.walkTopDown().sumOf { it.length() }, e))
                }
            }
        }
        if (w != null && ears == null && _ears.value != Part.Loading) {
            _ears.value = Part.Loading
            scope.launch(Dispatchers.Default) {
                _ears.value = try { ears = Ears(w); Part.Ready } catch (e: Throwable) {
                    Part.Failed(loadFailure("her hearing", w.walkTopDown().sumOf { it.length() }, e))
                }
            }
        }
    }

    /** After an import, whatever was loaded from the old files has to go. */
    fun unloadAll() {
        answerer?.close(); answerer = null
        voice?.close(); voice = null
        ears?.close(); ears = null
        _llm.value = Part.Missing; _voice.value = Part.Missing; _ears.value = Part.Missing
    }

    companion object {
        /** Says what failed, how big it was, and - for the common case - that it was memory. */
        fun loadFailure(what: String, bytes: Long, e: Throwable): String {
            val size = "%.1f GB".format(bytes / 1_073_741_824.0)
            val reason = e.message ?: e::class.simpleName ?: "no reason given"
            return if (e is OutOfMemoryError || reason.contains("memory", ignoreCase = true)) {
                "$what ($size) did not fit in the memory free right now"
            } else {
                "$what ($size) would not load: $reason"
            }
        }

        /** "qwen2.5-0.5b-instruct-q8.task" -> "Qwen2.5 0.5B Instruct", as the desktop names it. */
        fun prettyModelName(file: String): String {
            val stem = file.removeSuffix(".task").substringBefore("_")
            return when {
                stem.startsWith("qwen2.5-0.5b", ignoreCase = true) -> "Qwen2.5 0.5B Instruct"
                stem.startsWith("gemma3-1b", ignoreCase = true) -> "Gemma 3 1B"
                else -> stem
            }
        }
    }
}
