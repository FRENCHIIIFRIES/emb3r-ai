package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Hears
import io.github.frenchiiifries.emb3r.infer.Speaks
import io.github.frenchiiifries.emb3r.infer.Turn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Whatever records while the button is held. */
interface Recorder {
    fun start()
    fun stop(): FloatArray
}

/**
 * Talk's state: the face, what she said, what she heard you say, and - separately,
 * underneath - why she could not say it, if she could not.
 *
 * That last one is its own field on purpose. On the desktop a failed voice first
 * replaced the answer with the reason, so a spoken question came back with an
 * error and nothing else (step 40). Here the answer and the trouble cannot
 * occupy the same place.
 */
class TalkModel(
    private val scope: CoroutineScope,
    private val answers: () -> Answers?,
    private val voice: () -> Speaks?,
    private val ears: () -> Hears?,
    private val recorder: Recorder,
    private val micAllowed: () -> Boolean,
) {
    private val _face = MutableStateFlow(FaceState.IDLE)
    val face: StateFlow<FaceState> = _face.asStateFlow()

    private val _said = MutableStateFlow("")
    val said: StateFlow<String> = _said.asStateFlow()

    private val _heard = MutableStateFlow("")
    val heard: StateFlow<String> = _heard.asStateFlow()

    private val _trouble = MutableStateFlow<String?>(null)
    val trouble: StateFlow<String?> = _trouble.asStateFlow()

    private val _listening = MutableStateFlow(false)
    val listening: StateFlow<Boolean> = _listening.asStateFlow()

    private val history = mutableListOf<Turn>()
    private var job: Job? = null

    fun hold() {
        if (_listening.value) return
        // whatever she was saying is over: you are talking now
        job?.cancel()
        voice()?.silence()
        answers()?.stop()
        _trouble.value = null

        if (!micAllowed()) {
            _heard.value = ""
            _said.value = MIC_REFUSED
            _face.value = FaceState.DEAF
            return
        }
        try {
            recorder.start()
        } catch (e: Throwable) {
            _heard.value = ""
            _said.value = NO_MIC
            _face.value = FaceState.DEAF
            return
        }
        _listening.value = true
        _face.value = FaceState.LISTENING
    }

    fun release() {
        if (!_listening.value) return
        _listening.value = false
        val samples = recorder.stop()
        job = scope.launch { handle(samples) }
    }

    private suspend fun handle(samples: FloatArray) {
        _said.value = ""
        _heard.value = "..."
        _face.value = FaceState.HEARING

        if (samples.size < SAMPLE_RATE * 0.3) {
            _heard.value = ""
            _said.value = TOO_SHORT
            _face.value = FaceState.PUZZLED
            return
        }

        val hearing = ears()
        if (hearing == null) {
            _heard.value = ""
            _said.value = NO_EARS
            _face.value = FaceState.PUZZLED
            return
        }

        val heardText = try {
            hearing.hear(samples)
        } catch (e: Throwable) {
            _heard.value = ""
            _said.value = e.message ?: "That could not be transcribed."
            _face.value = FaceState.PUZZLED
            return
        }
        if (heardText.isBlank()) {
            _heard.value = ""
            _said.value = NOT_CAUGHT
            _face.value = FaceState.PUZZLED
            return
        }
        _heard.value = heardText

        val answerer = answers()
        if (answerer == null) {
            _said.value = "no model imported yet - bring one in on the model screen"
            _face.value = FaceState.PUZZLED
            return
        }

        _face.value = FaceState.THINK
        val speaking = Channel<String>(Channel.UNLIMITED)
        val speaker = scope.launch { speakAll(speaking) }
        var reply = ""
        var pending = ""
        try {
            answerer.ask(history.toList(), heardText).collect { chunk ->
                if (reply.isEmpty()) _face.value = FaceState.TALKING
                reply += chunk
                pending += chunk
                _said.value = reply
                // speak each sentence as soon as it is whole, so she starts talking
                // before the answer has finished arriving
                val (ready, rest) = Sentences.split(pending)
                ready.forEach { speaking.send(it) }
                pending = rest
            }
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            _trouble.value = "the reply stopped: ${e.message ?: e::class.simpleName}"
        }
        if (pending.isNotBlank()) speaking.send(pending.trim())
        speaking.close()
        speaker.join()
        if (reply.isNotBlank()) history += Turn(heardText, reply)
        if (_face.value != FaceState.ERROR) _face.value = FaceState.IDLE
    }

    private suspend fun speakAll(sentences: Channel<String>) {
        val v = voice()
        for (sentence in sentences) {
            if (v == null) {
                _trouble.value = "couldn't speak that aloud - her voice isn't imported yet"
                continue
            }
            try {
                v.say(sentence)
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                // underneath the answer, never in place of it
                _trouble.value = "couldn't speak that aloud - ${e.message ?: "the voice did not answer"}"
            }
        }
    }

    companion object {
        const val SAMPLE_RATE = 16000

        // The desktop's words, adapted only where they would otherwise be untrue here.
        const val MIC_REFUSED = "The microphone was refused. Android asks once - allow it for emb3r in Settings, under Permissions."
        const val NO_MIC = "No microphone was found on this phone."
        const val TOO_SHORT = "That was too short to make out - hold the button while you talk."
        const val NOT_CAUGHT = "I did not catch that."
        const val NO_EARS = "Her hearing isn't imported yet - bring it in on the model screen."
    }
}

/** Splits streamed text into whole sentences, keeping the unfinished remainder. */
object Sentences {
    private val END = Regex("""(?<=[.!?])\s+""")

    fun split(text: String): Pair<List<String>, String> {
        val parts = text.split(END)
        if (parts.size <= 1) return emptyList<String>() to text
        val whole = parts.dropLast(1).map { it.trim() }.filter { it.isNotEmpty() }
        return whole to parts.last()
    }
}
