package io.github.frenchiiifries.emb3r.ui

import androidx.compose.ui.graphics.Color

/**
 * CSS's color-mix(in srgb, a p%, b): each channel blended directly, as stored.
 *
 * Compose's own lerp() blends in Oklab, which is better for most purposes and
 * wrong for this one - the desktop mixes in sRGB, and a salamander mixed in a
 * different space comes out a different creature.
 */
fun mixSrgb(a: Color, aWeight: Float, b: Color): Color {
    val w = aWeight.coerceIn(0f, 1f)
    return Color(
        red = a.red * w + b.red * (1 - w),
        green = a.green * w + b.green * (1 - w),
        blue = a.blue * w + b.blue * (1 - w),
        alpha = a.alpha * w + b.alpha * (1 - w),
    )
}
