package io.github.frenchiiifries.emb3r.infer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatFormatTest {

    @Test
    fun `a first question is framed exactly as the model expects`() {
        val text = ChatFormat.conversation("SYS", emptyList(), "hello")
        assertEquals(
            "<|im_start|>system\nSYS<|im_end|>\n" +
                "<|im_start|>user\nhello<|im_end|>\n" +
                "<|im_start|>assistant\n",
            text,
        )
    }

    @Test
    fun `earlier turns are replayed in order`() {
        val text = ChatFormat.conversation("SYS", listOf(Turn("a", "b"), Turn("c", "d")), "e")
        val order = listOf("user\na", "assistant\nb", "user\nc", "assistant\nd", "user\ne")
        val positions = order.map { text.indexOf(it) }
        assertTrue("turns out of order: $positions", positions.zipWithNext().all { (x, y) -> x in 0 until y })
    }

    /** The finding that made this class necessary. */
    @Test
    fun `ember is never introduced as the bundle's default assistant`() {
        val text = ChatFormat.conversation(EMBER_SYSTEM, listOf(Turn("who are you", "I'm Ember.")), "and where?")
        assertFalse(text.contains("Qwen"))
        assertFalse(text.contains("Alibaba"))
        assertTrue(text.startsWith("<|im_start|>system\nYou are Ember"))
    }

    @Test
    fun `the system line tells the truth about where she runs`() {
        assertTrue(EMBER_SYSTEM.contains("on this phone"))
        assertFalse(EMBER_SYSTEM.contains("desktop"))
    }

    @Test
    fun `structure tokens never reach the screen`() {
        assertEquals("Paris.", ChatFormat.clean("Paris.<|im_end|>"))
        assertEquals("hi", ChatFormat.clean("hi<|endoftext|>"))
    }
}
