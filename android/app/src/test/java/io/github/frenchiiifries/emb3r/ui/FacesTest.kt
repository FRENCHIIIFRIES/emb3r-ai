package io.github.frenchiiifries.emb3r.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FacesTest {

    @Test
    fun `voice faces match the desktop character for character`() {
        assertEquals("( O_O )", Faces.listening)
        assertEquals("( ·_· )?", Faces.hearing)
        assertEquals("( ?_? )", Faces.puzzled)
        assertEquals("( ^o^ )", Faces.talking)
        assertEquals("( ×_· )", Faces.deaf)
        assertEquals("( ·_· )", Faces.offline)
        assertEquals("( ^_^ )", Faces.idle)
    }

    @Test
    fun `every state has a face`() {
        FaceState.values().forEach { state ->
            assertTrue("$state has no face", Faces.forState(state).isNotBlank())
        }
    }

    /**
     * The characters below were checked against the two bundled fonts with
     * fontTools: every one exists in both JetBrains Mono and VT323. Anything
     * outside this set would be drawn by a system fallback in another typeface
     * at another width - the failure step 35 recorded.
     */
    @Test
    fun `every face a state can reach is drawable in the bundled fonts`() {
        val drawable = (' '..'~').toSet() + '·' + '×'
        FaceState.values().forEach { state ->
            val face = Faces.forState(state)
            val strays = face.filterNot { it in drawable }
            assertTrue(
                "$state uses ${strays.map { "U+%04X".format(it.code) }} which neither bundled font has",
                strays.isEmpty()
            )
        }
    }

    @Test
    fun `the faces the fonts cannot draw are not reachable from any state`() {
        val reachable = FaceState.values().map { Faces.forState(it) }.toSet()
        Faces.notDrawable.forEach { face ->
            assertTrue("$face cannot be drawn and should not be mapped to a state", face !in reachable)
        }
    }
}
