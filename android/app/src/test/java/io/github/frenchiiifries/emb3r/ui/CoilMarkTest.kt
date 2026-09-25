package io.github.frenchiiifries.emb3r.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CoilMarkTest {

    @Test
    fun `the lift passes through the desktop's keyframes exactly`() {
        // @keyframes coilLift in src/index.html
        assertEquals(1.000f, liftAt(0.00f).scaleY, 1e-4f)
        assertEquals(0.90f, liftAt(0.00f).opacity, 1e-4f)
        assertEquals(1.105f, liftAt(0.38f).scaleY, 1e-4f)
        assertEquals(-0.22f, liftAt(0.38f).translateY, 1e-4f)
        assertEquals(1.085f, liftAt(0.52f).scaleY, 1e-4f)
        assertEquals(0.99f, liftAt(0.52f).opacity, 1e-4f)
        assertEquals(1.000f, liftAt(1.00f).scaleY, 1e-4f)
    }

    @Test
    fun `between keyframes the lift stays inside the range the keyframes set`() {
        for (i in 0..100) {
            val f = liftAt(i / 100f)
            assertTrue("scaleY ${f.scaleY} at ${i}%", f.scaleY in 0.999f..1.1051f)
            assertTrue("opacity ${f.opacity} at ${i}%", f.opacity in 0.899f..1.0001f)
        }
    }

    @Test
    fun `shimmer and glow breathe between their two values`() {
        assertEquals(0.74f, shimmerOpacity(0f), 1e-4f)
        assertEquals(1.00f, shimmerOpacity(0.5f), 1e-4f)
        assertEquals(0.74f, shimmerOpacity(1f), 1e-4f)
        assertEquals(0.78f, glowOpacity(0f), 1e-4f)
        assertEquals(1.00f, glowOpacity(0.5f), 1e-4f)
    }

    @Test
    fun `the outline stays near-black in the light theme and lifts toward the accent in the dark`() {
        val light = tierColours(Emb3rTokens.text, dark = false).getValue(Tier.O)
        val dark = tierColours(Emb3rTokens.text, dark = true).getValue(Tier.O)
        assertEquals(Color(0xFF120A07), light)
        assertTrue("dark outline should be lifted toward the accent", dark.green > light.green)
    }

    @Test
    fun `the brightest flame tier is the accent itself`() {
        assertEquals(Emb3rTokens.text, tierColours(Emb3rTokens.text, dark = true).getValue(Tier.F2))
    }
}
