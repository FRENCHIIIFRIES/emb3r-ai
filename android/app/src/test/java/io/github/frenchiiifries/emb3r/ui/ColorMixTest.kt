package io.github.frenchiiifries.emb3r.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

class ColorMixTest {

    /**
     * Compares against the exact CSS arithmetic - color-mix in srgb is a straight
     * per-channel blend - within half a step. The first version of this test had
     * its expected hex written by hand, and it was wrong; the values below were
     * computed, and two of the flame's channels land exactly on .5, where an
     * exact hex would be testing float rounding rather than the mix.
     */
    private fun assertChannels(expected: Triple<Double, Double, Double>, c: Color) {
        assertEquals(expected.first, c.red * 255.0, 0.51)
        assertEquals(expected.second, c.green * 255.0, 0.51)
        assertEquals(expected.third, c.blue * 255.0, 0.51)
    }

    @Test
    fun `the salamander's dark tier matches the desktop's color-mix`() {
        // #logoMark .d { fill: color-mix(in srgb, var(--text-color) 40%, #0f0a07 60%) }
        // 0x7c*.4 + 0x0f*.6 = 58.6, 0xff*.4 + 0x0a*.6 = 108.0, 0x9e*.4 + 0x07*.6 = 67.4
        assertChannels(Triple(58.6, 108.0, 67.4), mixSrgb(Emb3rTokens.text, 0.40f, Color(0xFF0F0A07)))
    }

    @Test
    fun `the hottest flame is half accent, half white`() {
        // #logoMark .f3 { fill: color-mix(in srgb, var(--text-color) 50%, #fff 50%) }
        assertChannels(Triple(189.5, 255.0, 206.5), mixSrgb(Emb3rTokens.text, 0.5f, Color.White))
    }

    @Test
    fun `the ends of the blend are the colours themselves`() {
        assertChannels(Triple(124.0, 255.0, 158.0), mixSrgb(Emb3rTokens.text, 1f, Color.Black))
        assertChannels(Triple(0.0, 0.0, 0.0), mixSrgb(Emb3rTokens.text, 0f, Color.Black))
    }
}
