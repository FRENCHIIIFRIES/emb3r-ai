package io.github.frenchiiifries.emb3r.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.settings.Accent
import io.github.frenchiiifries.emb3r.settings.Config
import io.github.frenchiiifries.emb3r.settings.ThemeName
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * What the desktop keeps in custom properties and changes from Settings:
 * --bg-color, --text-color, --user-text-color, --hover-color, --glow-small,
 * --glow-big, and the body's font size. Everything drawn reads these rather
 * than a constant, so a change in Settings reaches every screen at once.
 */
data class Palette(
    val dark: Boolean = true,
    val bg: Color = Emb3rTokens.bg,
    val text: Color = Emb3rTokens.text,
    val userText: Color = Emb3rTokens.userText,
    val hover: Color = Emb3rTokens.hover,
    val glowSmall: Float = Emb3rTokens.glowSmall,
    val glowBig: Float = Emb3rTokens.glowBig,
    val bodySize: TextUnit = Emb3rTokens.bodySize,
    /** the Reactions toggle; the system's own "remove animations" is checked beside it */
    val reactions: Boolean = true,
)

val LocalPalette = compositionLocalOf { Palette() }

/** The palette's values, read where they are drawn. */
object Ink {
    val bg: Color @Composable @ReadOnlyComposable get() = LocalPalette.current.bg
    val userText: Color @Composable @ReadOnlyComposable get() = LocalPalette.current.userText
    val hover: Color @Composable @ReadOnlyComposable get() = LocalPalette.current.hover
    val bodySize: TextUnit @Composable @ReadOnlyComposable get() = LocalPalette.current.bodySize
    val glowSmall: Float @Composable @ReadOnlyComposable get() = LocalPalette.current.glowSmall
    val glowBig: Float @Composable @ReadOnlyComposable get() = LocalPalette.current.glowBig
    val reactions: Boolean @Composable @ReadOnlyComposable get() = LocalPalette.current.reactions
}

object Palettes {
    /** DEFAULT_HUE, DEFAULT_SAT and DEFAULT_LIGHTNESS in renderer.js: where the wheel starts. */
    const val DEFAULT_HUE = 140f
    const val DEFAULT_SAT = 80f
    const val DEFAULT_LIGHTNESS = 55f

    /** MIN_TEXT_CONTRAST and USER_LIGHTNESS_OFFSET in renderer.js. */
    private const val MIN_TEXT_CONTRAST = 4.5
    private const val USER_LIGHTNESS_OFFSET = 12

    fun of(config: Config): Palette {
        val dark = config.theme == ThemeName.DARK
        val bg = if (dark) Emb3rTokens.bg else Emb3rTokens.lightBg
        // applyGlow(): the big glow is the slider's number, the small one 30% of it
        val glowBig = config.glow.toFloat()
        val glowSmall = max(0f, config.glow * 0.3f)
        val base = Palette(
            dark = dark,
            bg = bg,
            text = if (dark) Emb3rTokens.text else Emb3rTokens.lightText,
            userText = if (dark) Emb3rTokens.userText else Emb3rTokens.lightUserText,
            hover = if (dark) Emb3rTokens.hover else Emb3rTokens.lightHover,
            glowSmall = glowSmall,
            glowBig = glowBig,
            bodySize = config.fontSize.sp,
            reactions = config.reactions,
        )
        val accent = config.accent ?: return base
        val (text, user) = accentColours(accent, bg)
        // renderer.js writes color + "33" here, meaning the accent at 20%. What
        // it actually writes is "hsl(...)33", which CSS rejects, so on the
        // desktop a custom accent loses its hover colour entirely. This is what
        // the line means to do.
        return base.copy(text = text, userText = user, hover = text.copy(alpha = 0x33 / 255f))
    }

    /**
     * applyColor() in renderer.js: the accent is nudged away from the
     * background, a point of lightness at a time, until it is readable against
     * it, and the user's own colour sits twelve points further out so the two
     * never collide. Hue and saturation are left exactly as picked.
     */
    fun accentColours(accent: Accent, bg: Color): Pair<Color, Color> {
        val bgLum = relativeLuminance(bg.rgb())
        val towardsWhite = bgLum < 0.5
        // measured on the exact pick, painted with it rounded - the order applyColor uses
        val safe = legibleLightness(accent.h, accent.s, accent.l, bgLum)
        val userL = (if (towardsWhite) safe + USER_LIGHTNESS_OFFSET else safe - USER_LIGHTNESS_OFFSET).coerceIn(0f, 100f)
        val h = accent.h.roundToInt().toFloat()
        val s = accent.s.roundToInt().toFloat()
        return hsl(h, s, safe) to hsl(h, s, userL)
    }

    /** The lightness actually used for a pick - what the hex field reports back. */
    fun legibleLightness(h: Float, s: Float, l: Float, bgLuminance: Double): Float {
        val towardsWhite = bgLuminance < 0.5
        var lightness = l
        for (i in 0 until 100) {
            if (contrast(hslToRgb(h, s, lightness), bgLuminance) >= MIN_TEXT_CONTRAST) break
            lightness += if (towardsWhite) 1 else -1
            if (lightness <= 0f || lightness >= 100f) { lightness = lightness.coerceIn(0f, 100f); break }
        }
        return lightness
    }

    fun hsl(h: Float, s: Float, l: Float): Color = hslToRgb(h, s, l).let { (r, g, b) -> Color(r, g, b) }

    fun hslToRgb(h: Float, s0: Float, l0: Float): Triple<Int, Int, Int> {
        val s = s0 / 100f
        val l = l0 / 100f
        val c = (1 - abs(2 * l - 1)) * s
        val x = c * (1 - abs((h / 60f) % 2 - 1))
        val m = l - c / 2
        val (r, g, b) = sextant(h, c, x)
        return Triple(((r + m) * 255).roundToInt(), ((g + m) * 255).roundToInt(), ((b + m) * 255).roundToInt())
    }

    /** hsvToRgb, which paints the wheel: hue round the edge, saturation outwards, full value. */
    fun hsvToRgb(h: Float, s0: Float, v0: Float): Triple<Int, Int, Int> {
        val s = s0 / 100f
        val v = v0 / 100f
        val c = v * s
        val x = c * (1 - abs((h / 60f) % 2 - 1))
        val m = v - c
        val (r, g, b) = sextant(h, c, x)
        return Triple(((r + m) * 255).roundToInt(), ((g + m) * 255).roundToInt(), ((b + m) * 255).roundToInt())
    }

    private fun sextant(h: Float, c: Float, x: Float): Triple<Float, Float, Float> = when {
        h < 60 -> Triple(c, x, 0f)
        h < 120 -> Triple(x, c, 0f)
        h < 180 -> Triple(0f, c, x)
        h < 240 -> Triple(0f, x, c)
        h < 300 -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }

    /** rgbToHsl, so a typed hex can become a point on the wheel. */
    fun rgbToHsl(r0: Int, g0: Int, b0: Int): Triple<Float, Float, Float> {
        val r = r0 / 255f; val g = g0 / 255f; val b = b0 / 255f
        val mx = maxOf(r, g, b); val mn = minOf(r, g, b)
        val l = (mx + mn) / 2
        if (mx == mn) return Triple(0f, 0f, l * 100)
        val d = mx - mn
        val s = if (l > 0.5f) d / (2 - mx - mn) else d / (mx + mn)
        val h = when (mx) {
            r -> (g - b) / d + (if (g < b) 6 else 0)
            g -> (b - r) / d + 2
            else -> (r - g) / d + 4
        }
        return Triple(h * 60, s * 100, l * 100)
    }

    /** WCAG relative luminance. */
    fun relativeLuminance(rgb: Triple<Int, Int, Int>): Double {
        fun lin(v: Int): Double { val c = v / 255.0; return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4) }
        return 0.2126 * lin(rgb.first) + 0.7152 * lin(rgb.second) + 0.0722 * lin(rgb.third)
    }

    fun contrast(rgb: Triple<Int, Int, Int>, bgLuminance: Double): Double {
        val a = relativeLuminance(rgb) + 0.05
        val b = bgLuminance + 0.05
        return if (a > b) a / b else b / a
    }

    fun Color.rgb(): Triple<Int, Int, Int> =
        Triple((red * 255).roundToInt(), (green * 255).roundToInt(), (blue * 255).roundToInt())

    /** "hsl(140, 80%, 55%)", as the desktop reports the colour it applied. */
    fun describe(h: Float, s: Float, l: Float) = "hsl(${h.roundToInt()}, ${s.roundToInt()}%, ${l.roundToInt()}%)"
}
