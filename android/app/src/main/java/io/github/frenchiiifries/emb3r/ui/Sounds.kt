package io.github.frenchiiifries.emb3r.ui

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.sin

/**
 * The desktop's sound effects, note for note: the same frequencies, lengths,
 * waveforms and volumes renderer.js gives its oscillators, and the same fade -
 * an exponential ramp down to 0.0001 over the length of the note.
 *
 * Web Audio's square and sawtooth are band-limited, built from harmonics rather
 * than drawn as hard edges, so these are built the same way: a naive square
 * wave at these pitches buzzes with aliasing the desktop's never has.
 */
class Sounds(private val enabled: () -> Boolean) {

    private val worker = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "emb3r-sounds").apply { isDaemon = true } }

    fun keyClick() = beep(180 + Math.random() * 60, 0.02, Wave.SQUARE, 0.02)
    fun send() { beep(660.0, 0.08, Wave.SQUARE, 0.05); beep(880.0, 0.08, Wave.SQUARE, 0.05, afterMs = 90) }
    fun reply() = beep(520.0, 0.1, Wave.SQUARE, 0.04)
    fun error() = beep(120.0, 0.25, Wave.SAWTOOTH, 0.05)

    /** Game Boy style rising two-tone chime: C5, E5, G5. */
    fun bootChime() {
        beep(523.25, 0.18, Wave.SQUARE, 0.05)
        beep(659.25, 0.18, Wave.SQUARE, 0.05, afterMs = 140)
        beep(783.99, 0.3, Wave.SQUARE, 0.06, afterMs = 280)
    }

    enum class Wave { SQUARE, SAWTOOTH }

    private fun beep(freq: Double, seconds: Double, wave: Wave, volume: Double, afterMs: Long = 0) {
        if (!enabled()) return
        worker.schedule({ runCatching { play(tone(freq, seconds, wave, volume)) } }, afterMs, TimeUnit.MILLISECONDS)
    }

    private fun play(samples: FloatArray) {
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                    .setSampleRate(RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 4)
            .build()
        track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
        track.play()
        // released once it has finished, off this thread, so notes can overlap as they do on the desktop
        worker.schedule({ runCatching { track.release() } }, samples.size * 1000L / RATE + 50, TimeUnit.MILLISECONDS)
    }

    companion object {
        const val RATE = 44_100

        /** One note: the band-limited wave, normalised to a peak of one as Web Audio's is, under the fade. */
        fun tone(freq: Double, seconds: Double, wave: Wave, volume: Double): FloatArray {
            val n = (seconds * RATE).toInt()
            val harmonics = (RATE / 2 / freq).toInt().coerceAtLeast(1)
            val raw = DoubleArray(n) { i ->
                val x = 2 * PI * freq * i / RATE
                var v = 0.0
                for (k in 1..harmonics) {
                    v += when (wave) {
                        Wave.SQUARE -> if (k % 2 == 1) sin(k * x) / k else 0.0
                        Wave.SAWTOOTH -> (if (k % 2 == 1) 1 else -1) * sin(k * x) / k
                    }
                }
                v
            }
            val peak = raw.maxOf { abs(it) }.takeIf { it > 0 } ?: 1.0
            // gain.exponentialRampToValueAtTime(0.0001, now + duration), from `volume`
            return FloatArray(n) { i ->
                val gain = volume * (0.0001 / volume).pow(i.toDouble() / n)
                (raw[i] / peak * gain).toFloat()
            }
        }
    }
}
