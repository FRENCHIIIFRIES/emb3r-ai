package io.github.frenchiiifries.emb3r.infer

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import java.io.File

/** Anything that can say a sentence aloud. The view models only see this. */
interface Speaks {
    /** Speaks [text] and returns once it has finished, or throws saying why it could not. */
    suspend fun say(text: String)

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

    /** Just the synthesis, so it can be measured on its own. */
    fun synthesize(text: String): Pair<FloatArray, Int> {
        val audio = tts.generate(text, EMBER_SPEAKER, GENERATE_SPEED)
        return audio.samples to audio.sampleRate
    }

    override suspend fun say(text: String) {
        val (samples, rate) = synthesize(text)
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
            // played length, not recorded length: the lift makes it shorter
            val millis = (samples.size / (sampleRate * PLAYBACK_RATE) * 1000).toLong()
            Thread.sleep(millis + 60)
        } finally {
            t.release()
            if (track === t) track = null
        }
    }

    override fun silence() {
        track?.let { runCatching { it.pause(); it.flush() } }
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
