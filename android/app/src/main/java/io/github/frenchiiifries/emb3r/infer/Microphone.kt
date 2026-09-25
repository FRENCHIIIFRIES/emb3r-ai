package io.github.frenchiiifries.emb3r.infer

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import io.github.frenchiiifries.emb3r.ui.Recorder

/**
 * Held while the button is held. Records 16 kHz mono floats, which is what
 * Whisper wants, so nothing has to be converted on the way to it.
 *
 * The permission is asked for by the screen at the moment the button is first
 * held - never at launch - so this class assumes it has already been granted and
 * says so plainly if it has not.
 */
class Microphone : Recorder {
    @Volatile private var running = false
    private var record: AudioRecord? = null
    private var reader: Thread? = null
    private val chunks = ArrayList<FloatArray>()

    @SuppressLint("MissingPermission")
    override fun start() {
        if (running) return
        val minBuffer = AudioRecord.getMinBufferSize(
            Ears.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT,
        )
        val r = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            Ears.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_FLOAT,
            maxOf(minBuffer, Ears.SAMPLE_RATE / 4 * 4),
        )
        if (r.state != AudioRecord.STATE_INITIALIZED) {
            r.release()
            throw IllegalStateException("the microphone could not be opened")
        }
        synchronized(chunks) { chunks.clear() }
        record = r
        running = true
        r.startRecording()
        reader = Thread {
            val buffer = FloatArray(Ears.SAMPLE_RATE / 10)
            while (running) {
                val n = r.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
                if (n > 0) synchronized(chunks) { chunks.add(buffer.copyOf(n)) }
            }
        }.apply { start() }
    }

    /** Stops recording and returns everything heard since [start]. */
    override fun stop(): FloatArray {
        if (!running) return FloatArray(0)
        running = false
        reader?.join(500)
        record?.run { runCatching { stop() }; release() }
        record = null
        val all = synchronized(chunks) { chunks.toList() }
        val out = FloatArray(all.sumOf { it.size })
        var at = 0
        for (c in all) { c.copyInto(out, at); at += c.size }
        return out
    }
}
