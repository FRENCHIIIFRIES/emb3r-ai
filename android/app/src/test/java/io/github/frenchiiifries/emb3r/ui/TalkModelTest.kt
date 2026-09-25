package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.Answers
import io.github.frenchiiifries.emb3r.infer.Hears
import io.github.frenchiiifries.emb3r.infer.Speaks
import io.github.frenchiiifries.emb3r.infer.Turn
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TalkModelTest {

    private class FakeAnswers(private vararg val chunks: String) : Answers {
        override fun ask(history: List<Turn>, question: String): Flow<String> = flowOf(*chunks)
        override fun stop() = Unit
    }
    private class FakeEars(private val text: String) : Hears {
        override suspend fun hear(samples: FloatArray) = text
    }
    private class FakeVoice : Speaks {
        val spoken = mutableListOf<String>()
        override suspend fun say(text: String) { spoken += text }
        override fun silence() = Unit
    }
    private class FailingVoice : Speaks {
        override suspend fun say(text: String) = throw IllegalStateException("there was not enough memory free to load her voice")
        override fun silence() = Unit
    }
    /** Hands back a recording of the given length in seconds. */
    private class FakeRecorder(private val seconds: Double, private val broken: Boolean = false) : Recorder {
        override fun start() { if (broken) throw IllegalStateException("no mic") }
        override fun stop() = FloatArray((TalkModel.SAMPLE_RATE * seconds).toInt())
    }

    private fun TestScope.talk(
        answers: Answers? = FakeAnswers("Paris."),
        voice: Speaks? = FakeVoice(),
        ears: Hears? = FakeEars("what is the capital of france"),
        recorder: Recorder = FakeRecorder(1.5),
        mic: MicAccess = MicAccess.GRANTED,
    ) = TalkModel(this, { answers }, { voice }, { ears }, recorder, { mic })

    @Test
    fun `holding listens, letting go answers out loud`() = runTest(StandardTestDispatcher()) {
        val voice = FakeVoice()
        val t = talk(voice = voice)
        t.hold()
        assertEquals(FaceState.LISTENING, t.face.value)
        t.release(); advanceUntilIdle()
        assertEquals("what is the capital of france", t.heard.value)
        assertEquals("Paris.", t.said.value)
        assertEquals(listOf("Paris."), voice.spoken)
        assertNull(t.trouble.value)
    }

    /** The lesson from step 40. */
    @Test
    fun `a voice failure keeps the answer on screen and puts the reason underneath`() = runTest(StandardTestDispatcher()) {
        val t = talk(voice = FailingVoice())
        t.hold(); t.release(); advanceUntilIdle()
        assertEquals("Paris.", t.said.value)
        assertTrue(t.trouble.value!!.startsWith("couldn't speak that aloud"))
        assertTrue(t.trouble.value!!.contains("not enough memory"))
    }

    @Test
    fun `hearing nothing is not an error`() = runTest(StandardTestDispatcher()) {
        val t = talk(ears = FakeEars(""))
        t.hold(); t.release(); advanceUntilIdle()
        assertEquals(FaceState.PUZZLED, t.face.value)
        assertEquals(TalkModel.NOT_CAUGHT, t.said.value)
        assertNull(t.trouble.value)
    }

    @Test
    fun `too short to make out, in the desktop's words`() = runTest(StandardTestDispatcher()) {
        val t = talk(recorder = FakeRecorder(0.1))
        t.hold(); t.release(); advanceUntilIdle()
        assertEquals("That was too short to make out - hold the button while you talk.", t.said.value)
        assertEquals(FaceState.PUZZLED, t.face.value)
    }

    @Test
    fun `a refused microphone shows on her face`() = runTest(StandardTestDispatcher()) {
        val t = talk(mic = MicAccess.REFUSED)
        t.hold()
        assertEquals(FaceState.DEAF, t.face.value)
        assertEquals(TalkModel.MIC_REFUSED, t.said.value)
    }

    @Test
    fun `a missing microphone says so`() = runTest(StandardTestDispatcher()) {
        val t = talk(recorder = FakeRecorder(1.0, broken = true))
        t.hold()
        assertEquals(FaceState.DEAF, t.face.value)
        assertEquals(TalkModel.NO_MIC, t.said.value)
    }

    @Test
    fun `sentences are spoken as soon as they are whole`() {
        val (ready, rest) = Sentences.split("The capital is Paris. It has been since the tenth cen")
        assertEquals(listOf("The capital is Paris."), ready)
        assertEquals("It has been since the tenth cen", rest)
    }

    @Test
    fun `while Android is still asking, she does not claim the microphone was refused`() = runTest(StandardTestDispatcher()) {
        val t = talk(mic = MicAccess.ASKING)
        t.hold()
        assertEquals(TalkModel.ASKING_MIC, t.said.value)
        assertEquals(FaceState.IDLE, t.face.value)
    }
}
