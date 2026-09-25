package io.github.frenchiiifries.emb3r.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The palette is not "close to" the desktop's, it is the desktop's. These are
 * the values from the custom properties at the top of src/index.html; if either
 * side moves, this fails and someone has to decide which is right.
 */
class ThemeTest {

    @Test
    fun `dark tokens are the ones in src index html`() {
        assertEquals(Color(0xFF0B0F0B), Emb3rTokens.bg)
        assertEquals(Color(0xFF7CFF9E), Emb3rTokens.text)
        assertEquals(Color(0xFFCFFFDA), Emb3rTokens.userText)
        assertEquals(Color(0xFF162219), Emb3rTokens.hover)
    }

    @Test
    fun `light tokens are the ones in src index html`() {
        assertEquals(Color(0xFFF4FBF6), Emb3rTokens.lightBg)
        assertEquals(Color(0xFF1B7A3C), Emb3rTokens.lightText)
        assertEquals(Color(0xFF1A5C33), Emb3rTokens.lightUserText)
        assertEquals(Color(0xFFDFF2E4), Emb3rTokens.lightHover)
    }

    @Test
    fun `the glow radii match --glow-small and --glow-big`() {
        assertEquals(2f, Emb3rTokens.glowSmall, 0f)
        assertEquals(6f, Emb3rTokens.glowBig, 0f)
    }

    @Test
    fun `lit text carries the glow in its own colour`() {
        val style = emberText(Emb3rTokens.text)
        assertEquals(Emb3rTokens.text, style.shadow?.color)
        assertEquals(2f, style.shadow?.blurRadius)
    }
}
