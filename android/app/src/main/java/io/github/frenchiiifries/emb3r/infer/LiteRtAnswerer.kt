package io.github.frenchiiifries.emb3r.infer

import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import java.io.File
import kotlin.random.Random

/**
 * The model on the phone, through LiteRT-LM - Google's successor to MediaPipe's
 * LLM Inference, and the only library the newest small models are published for.
 *
 * Unlike MediaPipe it applies each model's own chat template, so Gemma, Qwen and
 * LFM are each spoken to in their own format without the app knowing any of
 * them. The system instruction is a separate field here, which is what lets
 * Ember's own replace the "You are Qwen" line a model file can carry.
 *
 * Each question gets a fresh conversation holding the exchange so far, as the
 * MediaPipe version did: the transcript on screen stays the one source of truth.
 */
class LiteRtAnswerer(
    modelPath: String,
    cacheDir: String,
    private val system: () -> String = { EMBER_SYSTEM },
) : Answers, AutoCloseable {

    private val window: Int = contextFor(File(modelPath).name)

    private val engine = Engine(
        EngineConfig(
            modelPath = modelPath,
            backend = Backend.CPU(),
            // A .task file had its window fixed when it was exported; asking for
            // a different one is refused. A .litertlm file can be given one, and
            // is: left to its default, Gemma 4 would reserve room for 32,000.
            maxNumTokens = if (modelPath.endsWith(".litertlm")) window else null,
            cacheDir = cacheDir,
        ),
    ).also { it.initialize() }

    @Volatile private var current: Conversation? = null
    @Volatile private var stopping = false

    override fun ask(history: List<Turn>, question: String): Flow<String> = flow {
        val conversation = engine.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(system()),
                initialMessages = fit(history, question).flatMap {
                    listOf(Message.user(it.user), Message.model(it.ember))
                },
                samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = 0.7, seed = Random.nextInt()),
                // Thinking models think privately before answering, and on the
                // desktop that was a model producing nothing visible at all (step
                // 38). She is a companion answering a phone; she answers.
                thinkingConfig = ThinkingConfig(enableThinking = false),
                // A ceiling on one reply. Without it, a model that falls into a
                // loop talks until the window is full: Qwen3.5 0.8B, asked "who
                // made you?" on this phone, repeated one sentence for eight
                // minutes and 16,078 characters. About 750 words is room for any
                // answer worth reading on a phone.
                maxOutputToken = MAX_REPLY_TOKENS,
            ),
        )
        current = conversation
        stopping = false
        try {
            conversation.sendMessageAsync(question).collect { message ->
                // only what is meant to be read: a model's thinking arrives in
                // its own channel and never reaches this text
                val text = message.contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }
                if (text.isNotEmpty()) emit(text)
            }
        } catch (e: java.util.concurrent.CancellationException) {
            // The library ends a cancelled reply by throwing "Task cancelled" -
            // the same class a coroutine is cancelled with. When stop was asked
            // for and this coroutine is still running, it is the reply ending as
            // asked; anything else is passed on, so closing the chat still works.
            if (!(stopping && currentCoroutineContext().isActive)) throw e
        } finally {
            current = null
            runCatching { conversation.close() }
        }
    }

    /** Ends the work, not just the display of it - measured on the phone, as with MediaPipe. */
    override fun stop() {
        stopping = true
        current?.let { runCatching { it.cancelProcess() } }
    }

    /**
     * Keeps as much of the conversation as fits, oldest turns let go first, with
     * a quarter of the window left for the reply. There is no tokenizer in this
     * library's API, so length is estimated at three characters a token - on the
     * short side for English, so the estimate errs towards dropping a turn early
     * rather than overfilling the window.
     */
    internal fun fit(history: List<Turn>, question: String): List<Turn> {
        val budget = window * 3 / 4
        fun cost(s: String) = s.length / 3 + 8
        var kept = history
        fun total() = cost(system()) + cost(question) + kept.sumOf { cost(it.user) + cost(it.ember) }
        while (kept.isNotEmpty() && total() > budget) kept = kept.drop(1)
        return kept
    }

    override fun close() = engine.close()

    companion object {
        const val MAX_REPLY_TOKENS = 1024

        /** The window, in tokens, questions and replies together. */
        fun contextFor(fileName: String): Int = when {
            // exported with a 1,280-token cache (the "ekv1280" in its name)
            fileName.endsWith(".task") -> 1280
            // the desktop's own window, and room enough for a long conversation
            // without the cache costing more memory than the phone can spare
            else -> 4096
        }
    }
}
