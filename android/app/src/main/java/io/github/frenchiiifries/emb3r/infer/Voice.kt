package io.github.frenchiiifries.emb3r.infer

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Anything that can say a sentence aloud. The view models only see this. */
interface Speaks {
    /**
     * Speaks [text] and returns once it has finished, or throws saying why it
     * could not. [speed] is the Settings slider: 1 is her natural pace.
     */
    suspend fun say(text: String, speed: Float = 1f)

    /** Stops whatever is being said, now. */
    fun silence()
}

/**
 * Ember's voice: Kokoro, speaker 23 - bf_lily - the voice chosen on the desktop
 * in step 34, after the closest-by-pitch one came back sounding like an Emily.
 *
 * The lift is carried over exactly. The desktop generates at 0.9 speed and plays
 * at 1.11, which lands the tempo where it started and sits the voice eleven per
 * cent higher, so she is nobody's stock voice. AudioTrack's playback rate
 * resamples the way Web Audio's playbackRate does, so the same two numbers give
 * the same voice.
 */
class Voice(kokoroDir: File) : Speaks, AutoCloseable {

    private val tts = OfflineTts(
        null,
        OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                kokoro = OfflineTtsKokoroModelConfig(
                    model = File(kokoroDir, "model.onnx").path,
                    voices = File(kokoroDir, "voices.bin").path,
                    tokens = File(kokoroDir, "tokens.txt").path,
                    dataDir = File(kokoroDir, "espeak-ng-data").path,
                    // British English first: bf_lily is a British voice
                    lexicon = listOf("lexicon-gb-en.txt", "lexicon-zh.txt")
                        .joinToString(",") { File(kokoroDir, it).path },
                    dictDir = File(kokoroDir, "dict").path,
                ),
                numThreads = 2,
                debug = false,
                provider = "cpu",
            ),
        ),
    )

    @Volatile private var track: AudioTrack? = null

    /**
     * Just the synthesis, so it can be measured on its own. The slider's speed
     * multiplies the generation speed, as main.js multiplies it, and the
     * playback lift stays where it is - so she speeds up without changing voice.
     */
    fun synthesize(text: String, speed: Float = 1f): Pair<FloatArray, Int> {
        val audio = tts.generate(text, EMBER_SPEAKER, GENERATE_SPEED * speed.coerceIn(0.6f, 1.5f))
        return audio.samples to audio.sampleRate
    }

    // Synthesis is seconds of work and playback waits for the sound to finish,
    // so both run on a background thread, whoever asks. From the screen's own
    // thread either would freeze it - long enough, in Talk, for Android to
    // offer to close the app.
    override suspend fun say(text: String, speed: Float) = withContext(Dispatchers.Default) {
        val (samples, rate) = synthesize(text, speed)
        if (samples.isEmpty()) throw IllegalStateException("the voice produced no sound for that sentence")
        play(samples, rate)
    }

    private fun play(samples: FloatArray, sampleRate: Int) {
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 4)
            .build()
        track = t
        try {
            t.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
            t.playbackRate = (sampleRate * PLAYBACK_RATE).toInt()
            t.play()
            // played length, not recorded length: the lift makes it shorter. Waited
            // out in short steps, so being silenced ends the wait as well as the sound.
            val millis = (samples.size / (sampleRate * PLAYBACK_RATE) * 1000).toLong()
            val end = System.currentTimeMillis() + millis + 60
            while (track === t && System.currentTimeMillis() < end) Thread.sleep(20)
        } finally {
            t.release()
            if (track === t) track = null
        }
    }

    override fun silence() {
        val t = track ?: return
        track = null
        runCatching { t.pause(); t.flush() }
    }

    override fun close() {
        silence()
        tts.release()
    }

    companion object {
        /** bf_lily in kokoro-multi-lang-v1_0 */
        const val EMBER_SPEAKER = 23
        /** VOICE_GENERATE_SPEED in main.js */
        const val GENERATE_SPEED = 0.9f
        /** VOICE_PLAYBACK_RATE in main.js */
        const val PLAYBACK_RATE = 1.11f
    }
}
