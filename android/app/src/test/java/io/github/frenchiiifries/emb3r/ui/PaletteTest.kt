package io.github.frenchiiifries.emb3r.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.settings.Accent
import io.github.frenchiiifries.emb3r.settings.Config
import io.github.frenchiiifries.emb3r.settings.ThemeName
import io.github.frenchiiifries.emb3r.ui.Palettes.rgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The colour arithmetic from renderer.js, checked against numbers the desktop itself recorded. */
class PaletteTest {

    @Test
    fun no_accent_means_the_themes_own_colours() {
        val dark = Palettes.of(Config())
        assertEquals(Emb3rTokens.text, dark.text)
        assertEquals(Emb3rTokens.bg, dark.bg)
        val light = Palettes.of(Config(theme = ThemeName.LIGHT))
        assertEquals(Emb3rTokens.lightText, light.text)
        assertEquals(Emb3rTokens.lightBg, light.bg)
    }

    /**
     * renderer.js records this case in a comment: #050505 typed on the dark
     * theme was lifted to 49% lightness before it could be read. The same
     * arithmetic here has to land on the same number.
     */
    @Test
    fun a_near_black_accent_is_lifted_to_49_percent_on_dark_as_the_desktop_recorded() {
        val (h, s, l) = Palettes.rgbToHsl(5, 5, 5)
        val slider = l.coerceIn(20f, 80f).toInt().toFloat()
        val applied = Palettes.legibleLightness(h, s, slider, Palettes.relativeLuminance(Emb3rTokens.bg.rgb()))
        assertEquals(49f, applied, 0.001f)
    }

    @Test
    fun every_accent_is_readable_against_its_background() {
        for (theme in ThemeName.entries) {
            for (hue in 0 until 360 step 15) {
                for (l in listOf(20f, 50f, 80f)) {
                    val p = Palettes.of(Config(theme = theme, accent = Accent(hue.toFloat(), 100f, l)))
                    val ratio = Palettes.contrast(p.text.rgb(), Palettes.relativeLuminance(p.bg.rgb()))
                    // 4.5 is measured on the exact pick and painted rounded, as on the desktop - within a hair
                    assertTrue("hue $hue at $l on $theme: $ratio", ratio >= 4.4)
                }
            }
        }
    }

    @Test
    fun your_own_lines_sit_twelve_points_further_from_the_background() {
        val (text, user) = Palettes.accentColours(Accent(200f, 80f, 55f), Emb3rTokens.bg)
        val lt = Palettes.rgbToHsl(text.rgb().first, text.rgb().second, text.rgb().third).third
        val lu = Palettes.rgbToHsl(user.rgb().first, user.rgb().second, user.rgb().third).third
        assertEquals(12f, lu - lt, 1f)
    }

    @Test
    fun the_glow_slider_moves_both_glows_as_applyGlow_does() {
        val p = Palettes.of(Config(glow = 10))
        assertEquals(10f, p.glowBig, 0f)
        assertEquals(3f, p.glowSmall, 0.0001f)
        val none = Palettes.of(Config(glow = 0))
        assertEquals(0f, none.glowBig, 0f)
    }

    @Test
    fun the_font_size_slider_sets_the_body_size() {
        assertEquals(26.sp, Palettes.of(Config(fontSize = 26)).bodySize)
    }

    @Test
    fun a_custom_accent_keeps_its_hover_colour_at_twenty_percent() {
        val p = Palettes.of(Config(accent = Accent(200f, 80f, 55f)))
        assertEquals(0x33 / 255f, p.hover.alpha, 0.001f)
        assertEquals(p.text.copy(alpha = 1f), p.hover.copy(alpha = 1f))
    }

    @Test
    fun hsl_conversion_round_trips_the_default_accent() {
        val (h, s, l) = Palettes.rgbToHsl(0x7C, 0xFF, 0x9E)
        assertEquals(Color(0x7C, 0xFF, 0x9E), Palettes.hsl(h, s, l))
    }
}
