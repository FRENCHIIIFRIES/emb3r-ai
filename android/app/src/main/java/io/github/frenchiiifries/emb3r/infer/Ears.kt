package io.github.frenchiiifries.emb3r.infer

import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import java.io.File

/** Anything that can turn a recording into words. The view models only see this. */
interface Hears {
    /** [samples] are 16 kHz mono. An empty string means nothing could be made out. */
    suspend fun hear(samples: FloatArray): String
}

/**
 * Ember's hearing: Whisper tiny.en - the same model the desktop uses - in its
 * int8 form, which is 100 MB against 150 MB for the full-precision pair and
 * loses nothing that matters for a spoken question.
 *
 * The whole utterance is transcribed at once rather than streamed, for the same
 * reason as on the desktop: push-to-talk makes the end of the recording a fact
 * rather than a guess, and guessing where someone stopped talking is the part of
 * live transcription that goes wrong.
 */
class Ears(whisperDir: File) : Hears, AutoCloseable {

    private val recognizer = OfflineRecognizer(
        null,
        OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
            modelConfig = OfflineModelConfig(
                whisper = OfflineWhisperModelConfig(
                    encoder = File(whisperDir, "tiny.en-encoder.int8.onnx").path,
                    decoder = File(whisperDir, "tiny.en-decoder.int8.onnx").path,
                    language = "en",
                    task = "transcribe",
                ),
                tokens = File(whisperDir, "tiny.en-tokens.txt").path,
                numThreads = 2,
                debug = false,
                provider = "cpu",
                modelType = "whisper",
            ),
        ),
    )

    override suspend fun hear(samples: FloatArray): String {
        if (samples.isEmpty()) return ""
        val stream = recognizer.createStream()
        try {
            stream.acceptWaveform(samples, SAMPLE_RATE)
            recognizer.decode(stream)
            return recognizer.getResult(stream).text.trim()
        } finally {
            stream.release()
        }
    }

    override fun close() = recognizer.release()

    companion object {
        /** Whisper is trained on 16 kHz mono, as ASR_SAMPLE_RATE says in main.js. */
        const val SAMPLE_RATE = 16000
    }
}
