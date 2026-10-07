package io.github.frenchiiifries.emb3r.infer

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.PromptTemplates
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** Anything that can answer a question as a stream of text. The view models only see this. */
interface Answers {
    fun ask(history: List<Turn>, question: String): Flow<String>
    fun stop()
}

/**
 * A .task model on the phone, through MediaPipe's LLM Inference - kept for the
 * one listed model LiteRT-LM cannot answer with. Everything newer goes through
 * LiteRtAnswerer.
 *
 * Each question gets a fresh session holding the conversation so far, built by
 * ChatFormat. A session could be kept and fed only the new turn, but a fresh one
 * is simpler to reason about and the prefill cost is measured before anyone
 * decides it is too high.
 */
class Answerer(
    context: Context,
    modelPath: String,
    /** read at the moment of asking, so a change in Settings applies to the very next reply */
    private val system: () -> String = { EMBER_SYSTEM },
) : Answers, AutoCloseable {

    private val llm: LlmInference = LlmInference.createFromOptions(
        context,
        LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelPath)
            .setMaxTokens(MAX_TOKENS)
            .setPreferredBackend(LlmInference.Backend.CPU)
            .build(),
    )

    // The bundle's own template would name the assistant Qwen - see ChatFormat.
    private val noTemplate: PromptTemplates = PromptTemplates.builder()
        .setSystemPrefix("").setSystemSuffix("")
        .setUserPrefix("").setUserSuffix("")
        .setModelPrefix("").setModelSuffix("")
        .build()

    @Volatile private var current: LlmInferenceSession? = null

    override fun ask(history: List<Turn>, question: String): Flow<String> = callbackFlow {
        val prompt = fit(history, question)
        val session = LlmInferenceSession.createFromOptions(
            llm,
            LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(40)
                .setTemperature(0.7f)
                .setPromptTemplates(noTemplate)
                .build(),
        )
        current = session
        session.addQueryChunk(prompt)
        session.generateResponseAsync { partial, done ->
            val text = ChatFormat.clean(partial)
            if (text.isNotEmpty()) trySend(text)
            if (done) close()
        }
        awaitClose {
            current = null
            session.close()
        }
    }

    /**
     * Stops generation, not just the display of it: MediaPipe's session can be
     * cancelled mid-reply, which the desktop's stop button also does. Whether the
     * work really stops is measured on the phone rather than assumed from the name.
     */
    override fun stop() {
        current?.cancelGenerateResponseAsync()
    }

    /**
     * The model was exported with room for 1,280 tokens in total - question,
     * history and reply together. Old turns are let go, oldest first, until the
     * prompt leaves enough room to answer in.
     */
    private fun fit(history: List<Turn>, question: String): String {
        var kept = history
        val instructions = system()
        var prompt = ChatFormat.conversation(instructions, kept, question)
        while (kept.isNotEmpty() && llm.sizeInTokens(prompt) > PROMPT_BUDGET) {
            kept = kept.drop(1)
            prompt = ChatFormat.conversation(instructions, kept, question)
        }
        return prompt
    }

    override fun close() = llm.close()

    companion object {
        const val MAX_TOKENS = 1280
        const val PROMPT_BUDGET = 900
    }
}
