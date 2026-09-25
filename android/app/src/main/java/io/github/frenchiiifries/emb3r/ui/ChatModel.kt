package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Turn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Who a line in the transcript belongs to - the desktop's .you, .bot, .sys, .err and .dim. */
enum class Who { YOU, EMBER, SYSTEM, ERROR, DIM }

data class Line(val who: Who, val text: String, val model: String? = null)

/**
 * The terminal's state, kept out of Compose so it can be tested without a phone.
 *
 * [answers] is asked for each time rather than held, because the model is loaded
 * lazily and may not exist yet - in which case the terminal says so, in the
 * transcript, rather than looking broken.
 */
class ChatModel(
    private val scope: CoroutineScope,
    private val answers: () -> Answers?,
    private val modelName: () -> String?,
) {
    private val _lines = MutableStateFlow(listOf(NEW_CHAT))
    val lines: StateFlow<List<Line>> = _lines.asStateFlow()

    private val _face = MutableStateFlow(FaceState.IDLE)
    val face: StateFlow<FaceState> = _face.asStateFlow()

    private val _generating = MutableStateFlow(false)
    val generating: StateFlow<Boolean> = _generating.asStateFlow()

    private var job: Job? = null

    /**
     * The desktop's pet stat, with the desktop's mechanics: it starts full, drops
     * by one every 45 seconds, and each message sent lifts it by one. At two or
     * below she looks sad when resting. It is shown because something drives it.
     */
    private val _mood = MutableStateFlow(MOOD_MAX)
    val mood: StateFlow<Int> = _mood.asStateFlow()

    private var idle: Job? = null
    private var clocks: CoroutineScope? = null

    /**
     * Starts the mood decay and the idle timers. Taken as a separate scope so a
     * test can run them on a clock it controls and that does not keep it waiting.
     */
    fun startClocks(scope: CoroutineScope) {
        clocks = scope
        scope.launch {
            while (true) {
                delay(MOOD_DECAY_MS)
                _mood.value = maxOf(0, _mood.value - 1)
                if (!_generating.value && _mood.value <= 2 && _face.value in RESTING) _face.value = FaceState.SAD
            }
        }
        resetIdle()
    }

    /** After a minute alone she rests; after two, she sleeps - as on the desktop. */
    private fun resetIdle() {
        val scope = clocks ?: return
        idle?.cancel()
        idle = scope.launch {
            delay(IDLE_MS)
            if (!_generating.value) _face.value = restingFace()
            delay(SLEEP_MS - IDLE_MS)
            if (!_generating.value) _face.value = FaceState.SLEEPING
        }
    }

    fun restingFace() = if (_mood.value <= 2) FaceState.SAD else FaceState.IDLE

    fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || _generating.value) return
        val history = turns()
        append(Line(Who.YOU, text))
        _mood.value = minOf(MOOD_MAX, _mood.value + 1)
        resetIdle()

        val answerer = answers()
        if (answerer == null) {
            append(Line(Who.SYSTEM, "no model imported yet - bring one in on the model screen"))
            _face.value = FaceState.PUZZLED
            return
        }

        _generating.value = true
        _face.value = FaceState.THINK
        val name = modelName()
        job = scope.launch {
            var reply = ""
            var started = false
            try {
                answerer.ask(history, text).collect { chunk ->
                    if (!started) {
                        started = true
                        // the first token is the moment she starts talking, as on the desktop
                        _face.value = FaceState.HAPPY
                        append(Line(Who.EMBER, "", name))
                    }
                    reply += chunk
                    replaceLast(Line(Who.EMBER, reply, name))
                }
                if (!started) {
                    append(Line(Who.SYSTEM, "she had nothing to say to that - try asking another way"))
                    _face.value = FaceState.PUZZLED
                } else {
                    _face.value = restingFace()
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                // keep whatever she had already said; the error goes underneath it
                append(Line(Who.ERROR, "the reply stopped: ${e.message ?: e::class.simpleName}"))
                _face.value = FaceState.ERROR
            } finally {
                _generating.value = false
                resetIdle()
            }
        }
    }

    /** Stops the model, not just the display of it. What was said stays. */
    fun stop() {
        if (!_generating.value) return
        answers()?.stop()
    }

    /** A system line in the transcript - where the terminal says what went wrong. */
    fun note(text: String) = append(Line(Who.SYSTEM, text))

    fun newChat() {
        stop()
        job?.cancel()
        _lines.value = listOf(NEW_CHAT)
        _face.value = FaceState.IDLE
    }

    /** The conversation so far, as the model needs it: questions paired with her answers. */
    fun turns(): List<Turn> {
        val out = mutableListOf<Turn>()
        var question: String? = null
        for (line in _lines.value) {
            when (line.who) {
                Who.YOU -> question = line.text
                Who.EMBER -> if (question != null && line.text.isNotBlank()) {
                    out += Turn(question, line.text); question = null
                }
                else -> Unit
            }
        }
        return out
    }

    private fun append(line: Line) { _lines.value = _lines.value + line }
    private fun replaceLast(line: Line) { _lines.value = _lines.value.dropLast(1) + line }

    companion object {
        const val MOOD_MAX = 5
        const val MOOD_DECAY_MS = 45_000L
        const val IDLE_MS = 60_000L
        const val SLEEP_MS = 120_000L
        private val RESTING = setOf(FaceState.IDLE, FaceState.SAD, FaceState.SLEEPING)

        /** bar() in renderer.js: a # for each point of mood, a - for the rest. */
        fun bar(n: Int): String {
            val m = n.coerceIn(0, MOOD_MAX)
            return "#".repeat(m) + "-".repeat(MOOD_MAX - m)
        }

        /** The desktop's own first line, word for word. */
        val NEW_CHAT = Line(Who.DIM, "// new chat. type below and hit enter.")
    }
}
