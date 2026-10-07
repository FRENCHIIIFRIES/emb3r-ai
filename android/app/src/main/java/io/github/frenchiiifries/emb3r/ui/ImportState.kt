package io.github.frenchiiifries.emb3r.ui

/** Where an import stands. */
sealed interface ImportState {
    data object Idle : ImportState
    data class Copying(val fraction: Float, val current: String) : ImportState
    data class Done(val imported: List<String>, val unchanged: List<String> = emptyList()) : ImportState {
        /** What happened, in the words the model screen used - and what did not need to happen. */
        fun summary(): String = when {
            imported.isEmpty() -> "already here: ${unchanged.joinToString(", ")} - nothing needed copying"
            unchanged.isEmpty() -> "imported: ${imported.joinToString(", ")}"
            else -> "imported: ${imported.joinToString(", ")} · already here: ${unchanged.joinToString(", ")}"
        }
    }
    data class Failed(val why: String) : ImportState
}
