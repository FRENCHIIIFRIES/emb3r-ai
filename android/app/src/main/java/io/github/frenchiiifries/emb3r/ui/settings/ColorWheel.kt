package io.github.frenchiiifries.emb3r.ui.settings

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.frenchiiifries.emb3r.ui.Palettes
import kotlin.math.atan2
import kotlin.math.min
import kotlin.math.sqrt

/**
 * #colorWheel: drawWheel() in renderer.js, pixel for pixel. Hue runs round
 * the edge from the right, clockwise; saturation from nothing at the centre to
 * full at the rim; value is always full - lightness has its own slider.
 */
@Composable
fun ColorWheel(onPick: (hue: Float, sat: Float) -> Unit, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val sizePx = with(density) { WHEEL_DP.dp.roundToPx() }
    val bitmap = remember(sizePx) { paint(sizePx).asImageBitmap() }

    fun pick(at: Offset) {
        val center = sizePx / 2f
        val radius = center - 2f * density.density
        val x = at.x - center
        val y = at.y - center
        val dist = min(radius, sqrt(x * x + y * y))
        var angle = Math.toDegrees(atan2(y, x).toDouble()).toFloat()
        if (angle < 0) angle += 360f
        onPick(angle, min(100f, dist / radius * 100f))
    }

    Image(
        bitmap, contentDescription = null,
        modifier = modifier
            .size(WHEEL_DP.dp)
            .clip(CircleShape)
            .semantics { contentDescription = "accent colour wheel" }
            .pointerInput(Unit) { detectTapGestures { pick(it) } }
            .pointerInput(Unit) { detectDragGestures(onDragStart = { pick(it) }) { change, _ -> pick(change.position) } },
    )
}

private const val WHEEL_DP = 150

private fun paint(size: Int): Bitmap {
    val center = size / 2f
    val radius = center - 2f
    val pixels = IntArray(size * size)
    for (y in 0 until size) {
        for (x in 0 until size) {
            val dx = x - center
            val dy = y - center
            val dist = sqrt(dx * dx + dy * dy)
            if (dist <= radius) {
                var angle = Math.toDegrees(atan2(dy, dx).toDouble()).toFloat()
                if (angle < 0) angle += 360f
                val (r, g, b) = Palettes.hsvToRgb(angle, min(100f, dist / radius * 100f), 100f)
                pixels[y * size + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
    }
    return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
}
