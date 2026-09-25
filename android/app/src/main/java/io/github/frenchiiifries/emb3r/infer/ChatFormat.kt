package io.github.frenchiiifries.emb3r.infer

/** One exchange already had, in the order it happened. */
data class Turn(val user: String, val ember: String)

/**
 * Who Ember is, from DEFAULT_PERSONALITY in main.js. One fact changed: she does
 * not live in a desktop pet app here, and saying so would be the first untrue
 * thing she said.
 */
const val EMBER_SYSTEM =
    "You are Ember, a small terminal-dwelling AI companion. You run entirely on this phone, " +
        "and nothing said to you leaves it. Keep replies concise and warm."

/**
 * Builds the exact text the model is given.
 *
 * The model bundle carries its own chat template, and that template's system line
 * is "You are Qwen, created by Alibaba Cloud." Left alone, Ember would introduce
 * herself as someone else. MediaPipe lets the template be replaced but has no
 * separate field for the system content, so the app empties the bundle's template
 * and writes the whole conversation itself, in the model's own ChatML format.
 */
object ChatFormat {
    private const val START = "<|im_start|>"
    private const val END = "<|im_end|>"

    fun conversation(system: String, history: List<Turn>, question: String): String = buildString {
        append(START).append("system\n").append(system.trim()).append(END).append('\n')
        for (turn in history) {
            append(START).append("user\n").append(turn.user.trim()).append(END).append('\n')
            append(START).append("assistant\n").append(turn.ember.trim()).append(END).append('\n')
        }
        append(START).append("user\n").append(question.trim()).append(END).append('\n')
        append(START).append("assistant\n")
    }

    /** Tokens the model uses for structure. They never belong in what is shown. */
    fun clean(reply: String): String =
        reply.replace(END, "").replace("<|endoftext|>", "").replace(START, "")
}
