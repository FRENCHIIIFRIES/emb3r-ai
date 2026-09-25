package io.github.frenchiiifries.emb3r.models

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Brings the models in from a folder the user picked, once.
 *
 * They are copied into the app's own storage rather than read where they are,
 * because both inference libraries are native code and native code opens file
 * paths - it cannot read the content:// addresses Android hands out for a
 * picked folder. The app has no permission to download them itself; see the
 * manifest.
 *
 * Everything is copied into a scratch folder first and swapped into place only
 * when all of it has arrived, so an import interrupted halfway never leaves a
 * set of models that looks complete and is not.
 */
class ModelImporter(private val context: Context) {

    data class Progress(val copied: Long, val total: Long, val current: String)

    suspend fun import(tree: Uri, onProgress: (Progress) -> Unit): List<String> = withContext(Dispatchers.IO) {
        val root = DocumentFile.fromTreeUri(context, tree)
            ?: throw IllegalStateException("that folder could not be opened")
        val plan = plan(root)
        if (plan.isEmpty()) {
            throw IllegalStateException(
                "nothing in that folder looked like emb3r's models - " +
                    "expected a .task file, a kokoro folder and a whisper folder"
            )
        }

        val total = plan.sumOf { it.second.length() }
        val scratch = File(context.filesDir, "models.importing").apply { deleteRecursively(); mkdirs() }
        var copied = 0L
        for ((relative, doc) in plan) {
            val out = File(scratch, relative).apply { parentFile?.mkdirs() }
            context.contentResolver.openInputStream(doc.uri).use { input ->
                requireNotNull(input) { "could not read $relative" }
                out.outputStream().use { output ->
                    val buffer = ByteArray(1 shl 20)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        copied += n
                        onProgress(Progress(copied, total, relative))
                    }
                }
            }
        }

        val live = File(context.filesDir, "models")
        live.deleteRecursively()
        if (!scratch.renameTo(live)) throw IllegalStateException("the imported models could not be put in place")
        plan.map { it.first.substringBefore('/') }.distinct()
    }

    /** Which files to bring in, as (path inside models/, source). */
    private fun plan(root: DocumentFile): List<Pair<String, DocumentFile>> {
        val out = mutableListOf<Pair<String, DocumentFile>>()
        for (entry in root.listFiles()) {
            val name = entry.name ?: continue
            when {
                entry.isFile && name.endsWith(".task", ignoreCase = true) -> out += name to entry
                entry.isDirectory && name.contains("kokoro", ignoreCase = true) -> walk(entry, name, out) { true }
                // Only the int8 pair is used. The full-precision files are 150 MB
                // the phone would carry for nothing.
                entry.isDirectory && name.contains("whisper", ignoreCase = true) -> walk(entry, name, out) {
                    it.endsWith(".int8.onnx") || it.endsWith("tokens.txt")
                }
            }
        }
        return out
    }

    private fun walk(dir: DocumentFile, prefix: String, out: MutableList<Pair<String, DocumentFile>>, keep: (String) -> Boolean) {
        for (child in dir.listFiles()) {
            val name = child.name ?: continue
            if (child.isDirectory) walk(child, "$prefix/$name", out, keep)
            else if (keep(name)) out += "$prefix/$name" to child
        }
    }
}
