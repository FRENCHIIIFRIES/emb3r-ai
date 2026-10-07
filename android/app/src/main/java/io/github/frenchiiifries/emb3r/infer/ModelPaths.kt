package io.github.frenchiiifries.emb3r.infer

import io.github.frenchiiifries.emb3r.models.Catalogue
import java.io.File

/**
 * Where the models live once imported: inside the app's own storage.
 *
 * They are copied there rather than read in place because both inference
 * libraries are native code, and native code opens file paths - it cannot read
 * the content:// URIs Android hands out for a folder the user picked.
 *
 * There can be several answering models on the phone at once; [chosen] names
 * the one Settings picked, and without a choice the first listed one is used.
 */
class ModelPaths(val root: File, private val chosen: () -> String? = { null }) {

    /** Every answering model on the phone: the listed ones in the catalogue's order, then any others by name. */
    val answering: List<File>
        get() {
            val files = root.listFiles()?.filter { it.isFile && Catalogue.isAnsweringModel(it.name) } ?: return emptyList()
            val order = Catalogue.models.map { it.file.lowercase() }
            return files.sortedWith(compareBy({ order.indexOf(it.name.lowercase()).let { i -> if (i < 0) Int.MAX_VALUE else i } }, { it.name }))
        }

    val llm: File? get() = answering.let { all -> all.firstOrNull { it.name == chosen() } ?: all.firstOrNull() }

    val kokoroDir: File? get() = dirContaining("kokoro")
    val whisperDir: File? get() = dirContaining("whisper")

    val complete: Boolean get() = llm != null && kokoroDir != null && whisperDir != null

    private fun dirContaining(word: String): File? =
        root.listFiles()?.firstOrNull { it.isDirectory && it.name.contains(word, ignoreCase = true) }

    companion object {
        fun inAppStorage(filesDir: File, chosen: () -> String? = { null }) = ModelPaths(File(filesDir, "models"), chosen)
    }
}
