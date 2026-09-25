package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
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

    // --glow-small and --glow-big
    const val glowSmall = 2f
    const val glowBig = 6f
}

val Mono = FontFamily(Font(R.font.jetbrains_mono_regular))
val Display = FontFamily(Font(R.font.vt323_regular))

/**
 * The phosphor glow every lit thing on the desktop carries: the text colour
 * bled around the glyph itself, at 2px for ordinary text and 6px for the
 * things that are meant to look hot.
 */
fun phosphor(color: Color, big: Boolean = false) =
    Shadow(color = color, offset = Offset.Zero, blurRadius = if (big) Emb3rTokens.glowBig else Emb3rTokens.glowSmall)

fun emberText(color: Color, size: Int = 15, big: Boolean = false) = TextStyle(
    fontFamily = Mono,
    fontSize = size.sp,
    color = color,
    shadow = phosphor(color, big),
)

val LocalAccent = compositionLocalOf { Emb3rTokens.text }

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
            surface = surface, onSurface = accent,
        )
    } else {
        lightColorScheme(
            primary = accent, onPrimary = background,
            background = background, onBackground = accent,
            surface = surface, onSurface = accent,
        )
    }
    CompositionLocalProvider(LocalAccent provides accent) {
        MaterialTheme(
            colorScheme = scheme,
            typography = Typography(
                bodyMedium = emberText(accent, 15),
                bodySmall = emberText(accent, 13),
                displayLarge = TextStyle(fontFamily = Display, fontSize = 64.sp, color = accent, shadow = phosphor(accent, big = true)),
            ),
            content = content,
        )
    }
}
