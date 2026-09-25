package io.github.frenchiiifries.emb3r.infer

import java.io.File

/**
 * Where the models live once imported: inside the app's own storage.
 *
 * They are copied there rather than read in place because both inference
 * libraries are native code, and native code opens file paths - it cannot read
 * the content:// URIs Android hands out for a folder the user picked.
 */
class ModelPaths(val root: File) {

    val llm: File? get() = root.listFiles()?.firstOrNull { it.isFile && it.name.endsWith(".task") }

    val kokoroDir: File? get() = dirContaining("kokoro")
    val whisperDir: File? get() = dirContaining("whisper")

    val complete: Boolean get() = llm != null && kokoroDir != null && whisperDir != null

    private fun dirContaining(word: String): File? =
        root.listFiles()?.firstOrNull { it.isDirectory && it.name.contains(word, ignoreCase = true) }

    companion object {
        fun inAppStorage(filesDir: File) = ModelPaths(File(filesDir, "models"))
    }
}
