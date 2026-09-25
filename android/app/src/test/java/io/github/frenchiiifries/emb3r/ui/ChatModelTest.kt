package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Turn
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatModelTest {

    /** Streams its chunks with a pause between each, and can be told to stop. */
    private class FakeAnswers(private val chunks: List<String>, private val fail: Throwable? = null) : Answers {
        var stopped = false
        var lastHistory: List<Turn> = emptyList()
        override fun ask(history: List<Turn>, question: String): Flow<String> = flow {
            lastHistory = history
            for (c in chunks) {
                if (stopped) return@flow
                delay(10)
                emit(c)
            }
            fail?.let { throw it }
        }
        override fun stop() { stopped = true }
    }

    private fun TestScope.model(answers: Answers?) =
        ChatModel(this, { answers }, { "Qwen2.5 0.5B Instruct" })

    @Test
    fun `a reply streams in and the face follows it`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("Par", "is.")))
        chat.send("capital of france?")
        assertEquals(FaceState.THINK, chat.face.value)
        advanceUntilIdle()
        val last = chat.lines.value.last()
        assertEquals(Who.EMBER, last.who)
        assertEquals("Paris.", last.text)
        assertEquals("Qwen2.5 0.5B Instruct", last.model)
        assertEquals(FaceState.IDLE, chat.face.value)
        assertFalse(chat.generating.value)
    }

    @Test
    fun `with no model imported it says so instead of looking broken`() = runTest(StandardTestDispatcher()) {
        val chat = model(null)
        chat.send("hello")
        val last = chat.lines.value.last()
        assertEquals(Who.SYSTEM, last.who)
        assertTrue(last.text.contains("no model"))
        assertFalse(chat.generating.value)
    }

    @Test
    fun `stopping keeps the words already said`() = runTest(StandardTestDispatcher()) {
        val answers = FakeAnswers(listOf("one ", "two ", "three ", "four"))
        val chat = model(answers)
        chat.send("count")
        advanceTimeBy(25)
        chat.stop()
        advanceUntilIdle()
        assertTrue(answers.stopped)
        val said = chat.lines.value.last().text
        assertTrue("expected a partial reply, got '$said'", said.isNotEmpty() && said != "one two three four")
    }

    @Test
    fun `a failure mid-reply keeps the answer and puts the reason underneath`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("It is "), IllegalStateException("out of memory")))
        chat.send("tell me")
        advanceUntilIdle()
        val lines = chat.lines.value
        assertEquals("It is ", lines[lines.size - 2].text)
        assertEquals(Who.ERROR, lines.last().who)
        assertTrue(lines.last().text.contains("out of memory"))
        assertEquals(FaceState.ERROR, chat.face.value)
    }

    @Test
    fun `the conversation so far is handed to the model in order`() = runTest(StandardTestDispatcher()) {
        val answers = FakeAnswers(listOf("ok"))
        val chat = model(answers)
        chat.send("first"); advanceUntilIdle()
        chat.send("second"); advanceUntilIdle()
        assertEquals(listOf(Turn("first", "ok")), answers.lastHistory)
    }

    @Test
    fun `a new chat starts from the desktop's own first line`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("hi")))
        chat.send("hello"); advanceUntilIdle()
        chat.newChat()
        assertEquals(listOf(ChatModel.NEW_CHAT), chat.lines.value)
        assertEquals("// new chat. type below and hit enter.", ChatModel.NEW_CHAT.text)
    }

    @Test
    fun `the mood bar is drawn as the desktop draws it`() {
        assertEquals("#####", ChatModel.bar(5))
        assertEquals("##---", ChatModel.bar(2))
        assertEquals("-----", ChatModel.bar(-3))
    }

    @Test
    fun `mood drops every 45 seconds, and at two or below she looks sad`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("ok")))
        chat.startClocks(backgroundScope)
        advanceTimeBy(45_000 * 3 + 1)
        assertEquals(2, chat.mood.value)
        assertEquals(FaceState.SAD, chat.face.value)
    }

    @Test
    fun `talking to her lifts the mood, capped at full`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("ok")))
        chat.startClocks(backgroundScope)
        advanceTimeBy(45_000 * 2 + 1)
        assertEquals(3, chat.mood.value)
        chat.send("hi"); advanceTimeBy(100)
        assertEquals(4, chat.mood.value)
        chat.send("again"); advanceTimeBy(100); chat.send("more"); advanceTimeBy(100)
        assertEquals(ChatModel.MOOD_MAX, chat.mood.value)
    }

    @Test
    fun `left alone for two minutes she falls asleep`() = runTest(StandardTestDispatcher()) {
        val chat = model(FakeAnswers(listOf("ok")))
        chat.startClocks(backgroundScope)
        advanceTimeBy(ChatModel.SLEEP_MS + 1)
        assertEquals(FaceState.SLEEPING, chat.face.value)
        assertEquals("( u_u ) zZz", Faces.forState(chat.face.value))
    }
}
