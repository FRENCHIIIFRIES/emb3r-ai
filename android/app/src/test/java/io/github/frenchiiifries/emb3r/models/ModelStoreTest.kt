package io.github.frenchiiifries.emb3r.models

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelStoreTest {

    private fun store(vararg entries: Pair<String, Boolean>) = ModelStore(object : TreeReader {
        override fun list() = entries.map { (name, isDir) ->
            ModelFile(name = name, bytes = 1024, uri = "content://tree/$name", isDirectory = isDir)
        }
    })

    @Test
    fun `finds all three in an imported folder`() {
        val set = store(
            "qwen2.5-0.5b-instruct-q8.task" to false,
            "kokoro-multi-lang-v1_0" to true,
            "sherpa-onnx-whisper-tiny.en" to true,
        ).scan()

        assertEquals("qwen2.5-0.5b-instruct-q8.task", set.llm?.name)
        assertNotNull(set.kokoroDir)
        assertNotNull(set.whisperDir)
        assertTrue(set.complete)
    }

    @Test
    fun `any task file counts as the answering model, whichever one was chosen`() {
        assertNotNull(store("gemma3-1b-it-int4.task" to false).scan().llm)
    }

    @Test
    fun `names what is missing rather than failing blankly`() {
        val missing = store("sherpa-onnx-whisper-tiny.en" to true).missing()
        assertEquals(listOf(ModelStore.ANSWERING_MODEL, ModelStore.VOICE), missing)
    }

    @Test
    fun `an empty folder is missing all three, and says so`() {
        assertEquals(3, store().missing().size)
        assertFalse(store().scan().complete)
    }

    @Test
    fun `a directory is not mistaken for the answering model`() {
        assertNull(store("some.task" to true).scan().llm)
    }
}
