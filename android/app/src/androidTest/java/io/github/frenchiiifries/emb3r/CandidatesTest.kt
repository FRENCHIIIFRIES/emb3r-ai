package io.github.frenchiiifries.emb3r

import android.os.Debug
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.frenchiiifries.emb3r.infer.LiteRtAnswerer
import io.github.frenchiiifries.emb3r.infer.Prompts
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * The catalogue rule from the desktop, on the phone: nothing is listed until it
 * has been asked three ordinary questions on the device it will run on (step
 * 38, where the newest model of the three loaded perfectly and answered with
 * nothing, three times over).
 *
 * The candidates are pushed by adb to /data/local/tmp/emb3r-candidates, so this
 * tests the files themselves before anyone imports them. One test per model, so
 * each can be run in its own process: a model that crashes the native library
 * cannot take the others' results down with it.
 */
@RunWith(AndroidJUnit4::class)
class CandidatesTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File("/data/local/tmp/emb3r-candidates")

    // logcat rotates; the results also go to a file adb can read afterwards
    private val record = File(context.getExternalFilesDir(null), "candidates.log")

    private fun log(msg: String) {
        Log.i("CANDIDATES", msg)
        record.appendText(msg + "\n")
    }

    private val questions = listOf(
        // the exact prompt that produced 40 tokens and nothing visible on the desktop
        "hi",
        "What is the capital of France?",
        "Who made you?",
    )

    @Test fun qwen25_05b_task() = ask("qwen2.5-0.5b-instruct-q8.task")
    @Test fun lfm25_12b() = ask("LFM2.5-1.2B-Instruct_int4.litertlm")
    @Test fun qwen35_08b() = ask("Qwen3.5-0.8B_int8.litertlm")
    @Test fun gemma4_e2b() = ask("gemma-4-E2B-it.litertlm")

    /** Stop has to end the work on the new library too, not just hide it. */
    @Test fun stop_ends_the_work() = runBlocking {
        val file = File(dir, "LFM2.5-1.2B-Instruct_int4.litertlm")
        LiteRtAnswerer(file.path, context.cacheDir.path) { Prompts.system(null, "", false) }.use { a ->
            val ask = "Count from one to one hundred in words, one per line."
            val t0 = System.currentTimeMillis()
            var full = 0
            a.ask(emptyList(), ask).collect { full += it.length }
            val fullMs = System.currentTimeMillis() - t0

            var got = 0
            val t1 = System.currentTimeMillis()
            a.ask(emptyList(), ask).collect { chunk ->
                got += chunk.length
                if (got > 20) a.stop()
            }
            val stoppedMs = System.currentTimeMillis() - t1
            log("STOP full reply $fullMs ms, $full chars | stopped after $stoppedMs ms, $got chars")
            assertTrue("stopping took as long as finishing: $stoppedMs vs $fullMs ms", stoppedMs < fullMs * 0.6)
        }
    }

    private fun ask(name: String) = runBlocking {
        val file = File(dir, name)
        assertTrue("not on the phone: $file", file.canRead())
        val pssBefore = Debug.getPss()
        val t0 = System.currentTimeMillis()
        val answerer = LiteRtAnswerer(file.path, context.cacheDir.path) { Prompts.system(null, "", false) }
        val loadMs = System.currentTimeMillis() - t0
        val pssLoaded = Debug.getPss()
        log("== $name | ${"%.2f".format(file.length() / 1e9)} GB | load $loadMs ms | memory ${pssBefore / 1024} -> ${pssLoaded / 1024} MB")

        var answered = 0
        answerer.use { a ->
            for (q in questions) {
                val start = System.currentTimeMillis()
                var first = -1L
                val reply = StringBuilder()
                try {
                    a.ask(emptyList(), q).collect { chunk ->
                        if (first < 0) first = System.currentTimeMillis() - start
                        reply.append(chunk)
                    }
                } catch (e: Throwable) {
                    log("   Q \"$q\" FAILED: ${e::class.simpleName}: ${e.message}")
                    continue
                }
                val total = System.currentTimeMillis() - start
                val text = reply.toString().trim()
                if (text.isNotEmpty()) answered++
                val rate = if (first >= 0 && total > first) reply.length * 1000.0 / (total - first) else 0.0
                log("   Q \"$q\" | first word ${first} ms | total $total ms | ${text.length} chars | ${"%.0f".format(rate)} chars/s | \"${text.replace("\n", " / ")}\"")
            }
            log("   peak memory ${Debug.getPss() / 1024} MB | answered $answered of ${questions.size}")
        }
        assertTrue("$name answered $answered of ${questions.size}", answered == questions.size)
    }
}
