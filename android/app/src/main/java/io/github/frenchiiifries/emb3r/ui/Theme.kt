package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
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
 * CSS gives every lit thing two shadows at once - 2px and 6px - and a Compose
 * text style holds only one. So a lit line is drawn twice, the wide glow
 * underneath and the tight one on top, which is what the desktop's body
 * text-shadow does in one declaration.
 */
@Composable
fun Lit(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    size: TextUnit = Emb3rTokens.bodySize,
    family: FontFamily = Vt323,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    align: TextAlign? = null,
    glow: Boolean = true,
    lineHeight: Float = Emb3rTokens.lineHeight,
) {
    val base = TextStyle(
        fontFamily = family,
        fontSize = size,
        lineHeight = (size.value * lineHeight).sp,
        letterSpacing = letterSpacing,
        color = color,
        textAlign = align ?: TextAlign.Unspecified,
    )
    if (!glow) {
        Text(text, modifier, style = base)
        return
    }
    Box(modifier) {
        Text(text, style = base.copy(shadow = Shadow(color, Offset.Zero, Emb3rTokens.glowBig)))
        Text(text, style = base.copy(shadow = Shadow(color, Offset.Zero, Emb3rTokens.glowSmall)))
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

@Composable
fun Emb3rTheme(
    dark: Boolean = isSystemInDarkTheme(),
    accent: Color = if (dark) Emb3rTokens.text else Emb3rTokens.lightText,
    content: @Composable () -> Unit,
) {
    val background = if (dark) Emb3rTokens.bg else Emb3rTokens.lightBg
    val surface = if (dark) Emb3rTokens.hover else Emb3rTokens.lightHover
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
    CompositionLocalProvider(LocalAccent provides accent, LocalDark provides dark) {
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
