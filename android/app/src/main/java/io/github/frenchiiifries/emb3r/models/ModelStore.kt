package io.github.frenchiiifries.emb3r.models

/** One thing found in the imported folder: a file or a directory. */
data class ModelFile(val name: String, val bytes: Long, val uri: String, val isDirectory: Boolean = false)

/** What the folder turned out to contain. Any of these may be absent. */
data class ModelSet(
    val llm: ModelFile? = null,
    val kokoroDir: ModelFile? = null,
    val whisperDir: ModelFile? = null,
) {
    val complete: Boolean get() = llm != null && kokoroDir != null && whisperDir != null
}

/**
 * Whatever can list the imported folder. Kept as an interface so the scan can be
 * tested without Android's storage framework anywhere near it.
 */
interface TreeReader {
    fun list(): List<ModelFile>
}

/**
 * The models are imported once, as a single folder, because the app has no
 * permission to fetch them itself - see the manifest. This works out what is in
 * that folder, and, when something is missing, says which thing in words the
 * person reading has a chance of acting on.
 */
class ModelStore(private val tree: TreeReader) {

    fun scan(): ModelSet {
        val entries = tree.list()
        return ModelSet(
            llm = entries.firstOrNull { !it.isDirectory && Catalogue.isAnsweringModel(it.name.lowercase()) },
            kokoroDir = entries.firstOrNull { it.name.contains("kokoro", ignoreCase = true) },
            whisperDir = entries.firstOrNull { it.name.contains("whisper", ignoreCase = true) },
        )
    }

    fun missing(): List<String> {
        val set = scan()
        return buildList {
            if (set.llm == null) add(ANSWERING_MODEL)
            if (set.kokoroDir == null) add(VOICE)
            if (set.whisperDir == null) add(HEARING)
        }
    }

    companion object {
        const val ANSWERING_MODEL = "the answering model"
        const val VOICE = "Ember's voice"
        const val HEARING = "her hearing"
    }
}
