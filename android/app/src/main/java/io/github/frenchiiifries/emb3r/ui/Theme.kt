package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.R

/**
 * The desktop's palette, taken from the custom properties at the top of
 * src/index.html rather than matched by eye. The numbers are the numbers.
 */
object Emb3rTokens {
    // dark, which is what emb3r is
    val bg = Color(0xFF0B0F0B)
    val text = Color(0xFF7CFF9E)
    val userText = Color(0xFFCFFFDA)
    val hover = Color(0xFF162219)

    // light, kept so the phone can follow the system as the desktop does
    val lightBg = Color(0xFFF4FBF6)
    val lightText = Color(0xFF1B7A3C)
    val lightUserText = Color(0xFF1A5C33)
    val lightHover = Color(0xFFDFF2E4)

    // #chat .err, #chat .sys and .dim
    val err = Color(0xFFFF7C7C)
    val sys = Color(0xFF8FD6FF)
    val dim = Color(0xFF33AA55)

    // --glow-small and --glow-big
    const val glowSmall = 2f
    const val glowBig = 6f

    // html, body { font-size: 20px; line-height: 1.35 }
    val bodySize = 20.sp
    const val lineHeight = 1.35f
}

/**
 * The body face. The desktop's stack is "VT323", "JetBrains Mono", monospace:
 * VT323 first, for everything, at 20px.
 */
val Vt323 = FontFamily(Font(R.font.vt323_regular))

/**
 * The full JetBrains Mono, for what VT323 cannot draw. On the desktop the
 * EMB3R wordmark's box-drawing characters exist in neither bundled font and
 * come from whatever monospace the operating system supplies; here that is not
 * guaranteed to be monospaced at all, so the app carries a font that has them.
 */
val Mono = FontFamily(Font(R.font.jetbrains_mono_regular))

/**
 * The body's text-shadow: --glow-big underneath, --glow-small on top. Read
 * from the palette, because the Phosphor Glow slider moves both; a glow of
 * nothing is left out rather than drawn as a second copy of the text.
 */
val DOUBLE_GLOW: List<Float>
    @Composable @ReadOnlyComposable get() = LocalPalette.current.let { p -> listOf(p.glowBig, p.glowSmall).filter { it > 0f } }
/** A button's: button { text-shadow: 0 0 var(--glow-small) } */
val BUTTON_GLOW: List<Float>
    @Composable @ReadOnlyComposable get() = LocalPalette.current.let { p -> listOf(p.glowSmall).filter { it > 0f } }
/** #chat .sys and .err: 0 0 4px in their own colour */
val NOTE_GLOW = listOf(4f)
/** .dim { text-shadow: none } */
val NO_GLOW = emptyList<Float>()

/**
 * CSS can give one line of text several shadows at once, and the desktop's body
 * does - 2px and 6px. A Compose text style holds only one, so lit text is drawn
 * once per glow, widest underneath, which is what the single CSS declaration
 * does in one pass.
 */
@Composable
fun Lit(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    size: TextUnit = Ink.bodySize,
    family: FontFamily = Vt323,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    align: TextAlign? = null,
    glows: List<Float> = DOUBLE_GLOW,
    lineHeight: Float = Emb3rTokens.lineHeight,
    bold: Boolean = false,
    softWrap: Boolean = true,
) {
    val base = TextStyle(
        fontFamily = family,
        fontSize = size,
        lineHeight = (size.value * lineHeight).sp,
        letterSpacing = letterSpacing,
        color = color,
        textAlign = align ?: TextAlign.Unspecified,
        fontWeight = if (bold) androidx.compose.ui.text.font.FontWeight.Bold else null,
    )
    val shaped = (if (family == Vt323) withFallback(text) else null) ?: androidx.compose.ui.text.AnnotatedString(text)
    if (glows.isEmpty()) {
        Text(shaped, modifier, style = base, softWrap = softWrap)
        return
    }
    Box(modifier) {
        for (radius in glows) {
            Text(shaped, style = base.copy(shadow = Shadow(color, Offset.Zero, radius)), softWrap = softWrap)
        }
    }
}

/**
 * The code points VT323 can draw - all 224 of them, read from the font's own
 * character map rather than guessed.
 */
private fun vt323Draws(c: Int): Boolean =
    c in 0x20..0x7E || c in 0xA0..0xFF || c == 0x131 || c in 0x152..0x153 || c == 0x2BC || c == 0x2C6 ||
        c == 0x2DA || c == 0x2DC || c in 0x300..0x301 || c in 0x303..0x304 || c in 0x308..0x309 || c == 0x323 ||
        c in 0x2013..0x2014 || c in 0x2018..0x201A || c in 0x201C..0x201E || c == 0x2022 || c == 0x2026 ||
        c in 0x2039..0x203A || c == 0x2044 || c == 0x20AC || c == 0x2122 || c == 0x2212 || c == 0x2215 ||
        c == '\n'.code || c == '\r'.code || c == '\t'.code

/**
 * The desktop's font stack is "VT323", "JetBrains Mono", monospace: whatever
 * VT323 cannot draw - the ● beside a loaded model, the ✕ that deletes one -
 * comes from JetBrains Mono, and only what neither has from the system. Compose
 * has no fallback between two families, so the characters VT323 lacks are
 * handed to JetBrains Mono here, span by span. Null when nothing needs it.
 */
fun withFallback(text: String): androidx.compose.ui.text.AnnotatedString? {
    var i = 0
    var any = false
    while (i < text.length) {
        val c = text.codePointAt(i)
        if (!vt323Draws(c)) { any = true; break }
        i += Character.charCount(c)
    }
    if (!any) return null
    return androidx.compose.ui.text.buildAnnotatedString {
        var j = 0
        while (j < text.length) {
            val c = text.codePointAt(j)
            val n = Character.charCount(c)
            if (vt323Draws(c)) append(text, j, j + n)
            else withStyle(androidx.compose.ui.text.SpanStyle(fontFamily = Mono)) { append(text, j, j + n) }
            j += n
        }
    }
}

/**
 * #faceBig's gradient: lighter at the top, the colour itself at 45%, darker at
 * the bottom - so whatever accent is chosen becomes a gradient without the face
 * needing to be a drawing.
 */
fun faceGradient(accent: Color) = Brush.verticalGradient(
    0.00f to mixSrgb(accent, 0.55f, Color.White),
    0.45f to accent,
    1.00f to mixSrgb(accent, 0.62f, Color.Black),
)

val LocalAccent = compositionLocalOf { Emb3rTokens.text }
val LocalDark = compositionLocalOf { true }

/** The theme with the desktop's defaults - emb3r's own colour, dark unless asked otherwise. */
@Composable
fun Emb3rTheme(
    dark: Boolean = isSystemInDarkTheme(),
    accent: Color = if (dark) Emb3rTokens.text else Emb3rTokens.lightText,
    content: @Composable () -> Unit,
) {
    val palette = Palettes.of(
        io.github.frenchiiifries.emb3r.settings.Config(
            theme = if (dark) io.github.frenchiiifries.emb3r.settings.ThemeName.DARK
                else io.github.frenchiiifries.emb3r.settings.ThemeName.LIGHT,
        ),
    ).copy(text = accent)
    Emb3rTheme(palette, content)
}

/** The theme as Settings has it: every colour, glow and size from the palette. */
@Composable
fun Emb3rTheme(palette: Palette, content: @Composable () -> Unit) {
    val dark = palette.dark
    val accent = palette.text
    val background = palette.bg
    val surface = palette.hover
    val scheme = if (dark) {
        darkColorScheme(
            primary = accent, onPrimary = background,
            background = background, onBackground = accent,
            surface = background, onSurface = accent,
            surfaceVariant = surface, secondaryContainer = surface,
        )
    } else {
        lightColorScheme(
            primary = accent, onPrimary = background,
            background = background, onBackground = accent,
            surface = background, onSurface = accent,
            surfaceVariant = surface, secondaryContainer = surface,
        )
    }
    CompositionLocalProvider(LocalAccent provides accent, LocalDark provides dark, LocalPalette provides palette) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** Kept for the tests and for anything that wants a single-shadow style. */
fun emberText(color: Color, size: Int = 20, big: Boolean = false) = TextStyle(
    fontFamily = Vt323,
    fontSize = size.sp,
    color = color,
    shadow = phosphor(color, big),
)

fun phosphor(color: Color, big: Boolean = false) =
    Shadow(color = color, offset = Offset.Zero, blurRadius = if (big) Emb3rTokens.glowBig else Emb3rTokens.glowSmall)

val tightSpacing = (-0.02).em
