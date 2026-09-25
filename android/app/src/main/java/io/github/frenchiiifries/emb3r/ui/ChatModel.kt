package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Turn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
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

    fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || _generating.value) return
        val history = turns()
        append(Line(Who.YOU, text))

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
                    _face.value = FaceState.IDLE
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                // keep whatever she had already said; the error goes underneath it
                append(Line(Who.ERROR, "the reply stopped: ${e.message ?: e::class.simpleName}"))
                _face.value = FaceState.ERROR
            } finally {
                _generating.value = false
            }
        }
    }

    /** Stops the model, not just the display of it. What was said stays. */
    fun stop() {
        if (!_generating.value) return
        answers()?.stop()
    }

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
        /** The desktop's own first line, word for word. */
        val NEW_CHAT = Line(Who.DIM, "// new chat. type below and hit enter.")
    }
}
