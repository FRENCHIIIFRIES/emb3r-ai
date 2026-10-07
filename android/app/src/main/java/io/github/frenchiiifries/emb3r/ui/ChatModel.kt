package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Turn
import io.github.frenchiiifries.emb3r.settings.Shaping
import io.github.frenchiiifries.emb3r.settings.Unshaped
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Who a line in the transcript belongs to - the desktop's .you, .bot, .sys, .err and .dim. */
enum class Who { YOU, EMBER, SYSTEM, ERROR, DIM }

data class Line(
    val who: Who,
    val text: String,
    val model: String? = null,
    /** the reactions on this line - drawn only if Settings and the system allow */
    val bursts: List<Burst> = emptyList(),
)

/**
 * What happened in the terminal, for whatever makes sound: the beeps and her
 * voice. Kept out of the model so the tests hear nothing.
 */
interface ChatEvents {
    fun sent() {}
    /** A reply finished whole - not one that was stopped. */
    fun replied(text: String) {}
    fun failed() {}
    fun stopped() {}
}

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
    private val shaping: Shaping = Unshaped,
    private val events: ChatEvents = object : ChatEvents {},
) {
    private val _lines = MutableStateFlow(listOf(NEW_CHAT))
    val lines: StateFlow<List<Line>> = _lines.asStateFlow()

    private val _face = MutableStateFlow(FaceState.IDLE)
    val face: StateFlow<FaceState> = _face.asStateFlow()

    private val _generating = MutableStateFlow(false)
    val generating: StateFlow<Boolean> = _generating.asStateFlow()

    private var job: Job? = null
    @Volatile private var stopRequested = false

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
        events.sent()

        // Student mode's fixed replies come first - ahead of the model, so they
        // are given even while it is still loading. Kept in the transcript like
        // any other exchange: a record that disagrees with the screen is worse.
        shaping.guard(text)?.let { fixed ->
            append(Line(Who.EMBER, fixed, "student mode"))
            _face.value = restingFace()
            return
        }

        val answerer = answers()
        if (answerer == null) {
            append(Line(Who.SYSTEM, "no model imported yet - bring one in under settings, models"))
            _face.value = FaceState.PUZZLED
            return
        }

        _generating.value = true
        _face.value = FaceState.THINK
        stopRequested = false
        val name = modelName()
        // what the model is given: the question, with anything remembered that bears on it
        val prompt = shaping.prompt(text)
        job = scope.launch {
            var reply = ""
            var started = false
            try {
                answerer.ask(history, prompt).collect { chunk ->
                    if (!started) {
                        started = true
                        // the first token is the moment she starts talking, as on the desktop
                        _face.value = FaceState.HAPPY
                        append(Line(Who.EMBER, "", name))
                    }
                    reply += chunk
                    replaceLast(Line(Who.EMBER, reply, name))
                }
                when {
                    stopRequested -> {
                        // the answer went out, not up: a puff on the sentence that
                        // was cut off, and the desktop's word for it underneath
                        if (started) burstOnLast(Who.EMBER, BurstKind.PUFF)
                        append(Line(Who.SYSTEM, "stopped"))
                        _face.value = restingFace()
                        events.stopped()
                    }
                    !started -> {
                        append(Line(Who.SYSTEM, "she had nothing to say to that - try asking another way"))
                        _face.value = FaceState.PUZZLED
                    }
                    else -> {
                        val kinds = listOf(BurstKind.SPARKLE) +
                            if (Warmth.deservesHeart(text, reply)) listOf(BurstKind.HEART) else emptyList()
                        burstOnLast(Who.EMBER, *kinds.toTypedArray())
                        // the desktop shows "delighted" at full mood; its heart is in neither
                        // bundled font (see Faces), so she is happy here either way
                        _face.value = FaceState.HAPPY
                        events.replied(reply)
                        settleFace()
                    }
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                // keep whatever she had already said; the error goes underneath it
                append(Line(Who.ERROR, "the reply stopped: ${e.message ?: e::class.simpleName}", bursts = listOf(Burst(BurstKind.GLITCH))))
                _face.value = FaceState.ERROR
                events.failed()
            } finally {
                _generating.value = false
                resetIdle()
            }
        }
    }

    /** After a reply the face stays pleased for a moment and then rests, as the desktop's does after 1.5 s. */
    private fun settleFace() {
        scope.launch {
            delay(1500)
            if (!_generating.value && _face.value == FaceState.HAPPY) _face.value = restingFace()
        }
    }

    private fun burstOnLast(who: Who, vararg kinds: BurstKind) {
        val i = _lines.value.indexOfLast { it.who == who }
        if (i < 0) return
        val now = System.currentTimeMillis()
        _lines.value = _lines.value.toMutableList().also { l ->
            l[i] = l[i].copy(bursts = l[i].bursts + kinds.map { Burst(it, now) })
        }
    }

    /** Stops the model, not just the display of it. What was said stays. */
    fun stop() {
        if (!_generating.value) return
        stopRequested = true
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
