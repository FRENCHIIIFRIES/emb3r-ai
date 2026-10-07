package io.github.frenchiiifries.emb3r.models

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Brings models in from a folder the user picked.
 *
 * They are copied into the app's own storage rather than read where they are,
 * because both inference libraries are native code and native code opens file
 * paths - it cannot read the content:// addresses Android hands out for a
 * picked folder. The app has no permission to download them itself; see the
 * manifest.
 *
 * An import adds to what is already here rather than replacing it, now that
 * there can be several answering models: a folder holding only a new model
 * must not take Ember's voice away with it. Each model - a file, or a whole
 * folder such as the voice - arrives in a scratch folder first and is swapped
 * in only once all of it has been copied, so an interrupted import never
 * leaves half a model that looks whole. One already here at the same size is
 * not copied again: the largest is 2.6 GB.
 */
class ModelImporter(private val context: Context) {

    data class Progress(val copied: Long, val total: Long, val current: String)
    data class Result(val imported: List<String>, val unchanged: List<String>)

    suspend fun import(tree: Uri, onProgress: (Progress) -> Unit): Result = withContext(Dispatchers.IO) {
        val root = DocumentFile.fromTreeUri(context, tree)
            ?: throw IllegalStateException("that folder could not be opened")
        val units = plan(root)
        if (units.isEmpty()) {
            throw IllegalStateException(
                "nothing in that folder looked like emb3r's models - " +
                    "expected a .litertlm or .task file, a kokoro folder or a whisper folder"
            )
        }

        val live = File(context.filesDir, "models").apply { mkdirs() }
        val (same, fresh) = units.partition { unit -> unit.files.all { (rel, doc) -> File(live, rel).length() == doc.length() } }

        val total = fresh.sumOf { u -> u.files.sumOf { it.second.length() } }
        val scratch = File(context.filesDir, "models.importing").apply { deleteRecursively(); mkdirs() }
        var copied = 0L
        for (unit in fresh) {
            for ((relative, doc) in unit.files) {
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
            // the whole model is here: swap it in, replacing any older copy of it
            val target = File(live, unit.name)
            target.deleteRecursively()
            if (!File(scratch, unit.name).renameTo(target)) {
                throw IllegalStateException("${unit.name} was copied but could not be put in place")
            }
        }
        scratch.deleteRecursively()
        Result(fresh.map { it.name }, same.map { it.name })
    }

    /** A model as it is moved: one top-level name inside models/, and every file under it. */
    private data class Piece(val name: String, val files: List<Pair<String, DocumentFile>>)

    private fun plan(root: DocumentFile): List<Piece> {
        val out = mutableListOf<Piece>()
        for (entry in root.listFiles()) {
            val name = entry.name ?: continue
            val files = mutableListOf<Pair<String, DocumentFile>>()
            when {
                entry.isFile && Catalogue.isAnsweringModel(name.lowercase()) -> files += name to entry
                entry.isDirectory && name.contains("kokoro", ignoreCase = true) -> walk(entry, name, files) { true }
                // Only the int8 pair is used. The full-precision files are 150 MB
                // the phone would carry for nothing.
                entry.isDirectory && name.contains("whisper", ignoreCase = true) -> walk(entry, name, files) {
                    it.endsWith(".int8.onnx") || it.endsWith("tokens.txt")
                }
            }
            if (files.isNotEmpty()) out += Piece(name, files)
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

    companion object {
        /** Takes a model off the phone. Only ever inside the app's own models folder. */
        fun remove(filesDir: File, name: String): Boolean {
            val live = File(filesDir, "models")
            val target = File(live, name)
            if (target.parentFile?.canonicalPath != live.canonicalPath) return false
            return target.deleteRecursively()
        }
    }
}
