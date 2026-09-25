package io.github.frenchiiifries.emb3r

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.frenchiiifries.emb3r.infer.Answerer
import io.github.frenchiiifries.emb3r.infer.Ears
import io.github.frenchiiifries.emb3r.infer.ModelPaths
import io.github.frenchiiifries.emb3r.infer.Voice
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The spike. Before any screen is built on top of these three models, this
 * answers on the phone itself the things that would change the design if they
 * were wrong. Timings are logged under the tag SPIKE for the timeline.
 */
@RunWith(AndroidJUnit4::class)
class SpikeTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val paths = ModelPaths.inAppStorage(context.filesDir)

    private fun log(msg: String) = Log.i("SPIKE", msg)

    @Test
    fun the_model_answers_on_this_phone_as_ember_not_as_qwen() = runBlocking {
        val llm = paths.llm ?: error("no model imported at ${paths.root}")
        val t0 = System.currentTimeMillis()
        Answerer(context, llm.path).use { answerer ->
            val loaded = System.currentTimeMillis()
            val reply = answerer.ask(emptyList(), "Who are you, in one sentence?").toList().joinToString("")
            val done = System.currentTimeMillis()
            log("load ${loaded - t0} ms | answer ${done - loaded} ms | ${reply.length} chars | \"$reply\"")
            assertTrue("the model loaded and said nothing", reply.isNotBlank())
            assertFalse("she introduced herself as the bundle's default: $reply", reply.contains("Qwen", ignoreCase = true))
            assertFalse("she introduced herself as the bundle's default: $reply", reply.contains("Alibaba", ignoreCase = true))
        }
    }

    /** The open question from the design: does stop stop the work, or only hide it? */
    @Test
    fun stopping_a_reply_ends_the_work_early() = runBlocking {
        val llm = paths.llm ?: error("no model imported at ${paths.root}")
        Answerer(context, llm.path).use { answerer ->
            val ask = "Count from one to one hundred in words, one per line."

            val t0 = System.currentTimeMillis()
            val full = answerer.ask(emptyList(), ask).toList().joinToString("")
            val fullMs = System.currentTimeMillis() - t0

            var got = 0
            val t1 = System.currentTimeMillis()
            answerer.ask(emptyList(), ask).collect { chunk ->
                got += chunk.length
                if (got > 20) answerer.stop()
            }
            val stoppedMs = System.currentTimeMillis() - t1

            log("full reply ${fullMs} ms, ${full.length} chars | stopped after ${stoppedMs} ms, $got chars")
            assertTrue("stopping took as long as finishing: $stoppedMs vs $fullMs ms", stoppedMs < fullMs * 0.6)
        }
    }

    @Test
    fun kokoro_speaks_as_bf_lily() {
        val dir = paths.kokoroDir ?: error("no voice imported at ${paths.root}")
        val t0 = System.currentTimeMillis()
        Voice(dir).use { voice ->
            val loaded = System.currentTimeMillis()
            val (samples, rate) = voice.synthesize("Nothing you say to me leaves this phone.")
            val done = System.currentTimeMillis()
            val seconds = samples.size / rate.toFloat()
            log("voice load ${loaded - t0} ms | ${"%.2f".format(seconds)} s of audio in ${done - loaded} ms at $rate Hz")
            assertTrue("no audio produced", seconds > 0.5f)
        }
    }

    /**
     * She says a sentence, and hears it back. Both halves of Talk proved in one
     * loop, without anybody having to speak to the phone.
     */
    @Test
    fun ember_can_hear_herself() = runBlocking {
        val kokoro = paths.kokoroDir ?: error("no voice imported at ${paths.root}")
        val whisper = paths.whisperDir ?: error("no hearing imported at ${paths.root}")
        val (samples, rate) = Voice(kokoro).use { it.synthesize("The capital of France is Paris.") }
        val at16k = resample(samples, rate, Ears.SAMPLE_RATE)
        val t0 = System.currentTimeMillis()
        val heard = Ears(whisper).use { it.hear(at16k) }
        log("heard \"$heard\" in ${System.currentTimeMillis() - t0} ms")
        assertTrue("expected to hear Paris, heard: $heard", heard.contains("paris", ignoreCase = true))
    }

    /** Linear resampling - plenty for a test, and nothing here ships in the app. */
    private fun resample(input: FloatArray, from: Int, to: Int): FloatArray {
        val out = FloatArray((input.size.toLong() * to / from).toInt())
        val step = from.toDouble() / to
        for (i in out.indices) {
            val x = i * step
            val a = x.toInt().coerceAtMost(input.size - 1)
            val b = (a + 1).coerceAtMost(input.size - 1)
            val f = (x - a).toFloat()
            out[i] = input[a] * (1 - f) + input[b] * f
        }
        return out
    }
}
