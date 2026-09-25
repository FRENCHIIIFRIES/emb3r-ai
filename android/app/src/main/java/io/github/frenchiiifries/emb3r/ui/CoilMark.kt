package io.github.frenchiiifries.emb3r.ui

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.StartOffsetType
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/**
 * The salamander, drawn from the desktop's own path data (CoilMarkData).
 *
 * Every tier is a mix of the accent colour, exactly as #logoMark's CSS mixes it,
 * so it burns in whatever colour is chosen. The motion is the desktop's too:
 * four flames lifting on 3.4, 3.9, 4.3 and 3.7 seconds - lengths that never line
 * up, so they drift apart instead of moving as one block - the hottest tier
 * shimmering faster inside that, and the glow tier breathing. When the phone
 * asks for no animation, the mark stands still, as it does on the desktop under
 * prefers-reduced-motion.
 */
@Composable
fun CoilMark(
    accent: Color,
    modifier: Modifier = Modifier,
    dark: Boolean = true,
    animate: Boolean = true,
    description: String? = null,
) {
    val colours = remember(accent, dark) { tierColours(accent, dark) }
    val still = !animate || animationsOff(LocalContext.current)

    val statics = remember { CoilMarkData.static.map { (tier, d) -> tier to parse(d) } }
    val flames = remember { CoilMarkData.flames.map { g -> g.map { (tier, d) -> tier to parse(d) } } }
    // transform-origin: 50% 100% of each flame's own box (transform-box: fill-box)
    val pivots = remember {
        flames.map { g ->
            val box = g.map { it.second.getBounds() }.reduce { a, b -> a.union(b) }
            Offset(box.center.x, box.bottom)
        }
    }

    val lift: List<State<Float>>
    val shimmer: List<State<Float>>
    val glow: State<Float>?
    if (still) {
        lift = emptyList(); shimmer = emptyList(); glow = null
    } else {
        val t = rememberInfiniteTransition(label = "coil")
        lift = LIFT_CLOCKS.mapIndexed { i, (ms, delay) -> t.phase(ms, delay, "lift$i") }
        shimmer = SHIMMER_DELAYS.mapIndexed { i, delay -> t.phase(1450, delay, "shimmer$i") }
        glow = t.phase(3400, 0, "glow")
    }

    Canvas(modifier.semantics { description?.let { contentDescription = it } }) {
        scale(size.width / CoilMarkData.VIEWBOX, pivot = Offset.Zero) {
            for ((tier, path) in statics) {
                val alpha = if (tier == Tier.G && glow != null) glowOpacity(glow.value) else 1f
                drawPath(path, colours.getValue(tier), alpha = alpha)
            }
            flames.forEachIndexed { i, group ->
                val frame = if (still) LiftFrame.REST else liftAt(lift[i].value)
                withTransform({
                    scale(1f, frame.scaleY, pivots[i])
                    translate(0f, frame.translateY)
                }) {
                    for ((tier, path) in group) {
                        val shimmerAlpha = if (tier == Tier.F3 && !still) shimmerOpacity(shimmer[i].value) else 1f
                        drawPath(path, colours.getValue(tier), alpha = frame.opacity * shimmerAlpha)
                    }
                }
            }
        }
    }
}

private fun parse(d: String): Path = PathParser().parsePathString(d).toPath()

private fun Rect.union(o: Rect) = Rect(minOf(left, o.left), minOf(top, o.top), maxOf(right, o.right), maxOf(bottom, o.bottom))

/** The colour of each tier, from #logoMark's color-mix rules. */
fun tierColours(accent: Color, dark: Boolean): Map<Tier, Color> = mapOf(
    // The outline stays near-black at every hue; in the dark theme it is lifted
    // 28% toward the accent so a quarter of the drawing stops rendering as background.
    Tier.O to if (dark) mixSrgb(accent, 0.28f, Color(0xFF120A07)) else Color(0xFF120A07),
    Tier.D to mixSrgb(accent, 0.40f, Color(0xFF0F0A07)),
    Tier.B to mixSrgb(accent, 0.60f, Color(0xFF140D09)),
    Tier.G to mixSrgb(accent, 0.80f, Color(0xFF1A0F0A)),
    Tier.F1 to mixSrgb(accent, 0.80f, Color.Black),
    Tier.F2 to accent,
    Tier.F3 to mixSrgb(accent, 0.50f, Color.White),
)

// ---- the keyframes, as the desktop's @keyframes define them ----

/** (duration ms, negative animation-delay as a head start in ms) for .k0 to .k3 */
private val LIFT_CLOCKS = listOf(3400 to 0, 3900 to 900, 4300 to 1700, 3700 to 2500)
/** .f3 shimmer head starts for .k0 to .k3 */
private val SHIMMER_DELAYS = listOf(0, 350, 700, 500)

private val LIFT_EASING = CubicBezierEasing(0.37f, 0f, 0.28f, 1f)
private val SHIMMER_EASING = CubicBezierEasing(0.45f, 0.05f, 0.55f, 0.95f)
private val EASE_IN_OUT = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

data class LiftFrame(val at: Float, val scaleY: Float, val translateY: Float, val opacity: Float) {
    companion object { val REST = LiftFrame(0f, 1f, 0f, 1f) }
}

/** @keyframes coilLift */
private val LIFT = listOf(
    LiftFrame(0.00f, 1.000f, 0.00f, 0.90f),
    LiftFrame(0.38f, 1.105f, -0.22f, 1.00f),
    LiftFrame(0.52f, 1.085f, -0.17f, 0.99f),
    LiftFrame(1.00f, 1.000f, 0.00f, 0.90f),
)

/** CSS applies the timing function to each segment between keyframes, so this does too. */
fun liftAt(phase: Float): LiftFrame {
    val p = phase.coerceIn(0f, 1f)
    val i = LIFT.indexOfLast { it.at <= p }.coerceAtMost(LIFT.size - 2)
    val a = LIFT[i]; val b = LIFT[i + 1]
    val e = LIFT_EASING.transform(((p - a.at) / (b.at - a.at)).coerceIn(0f, 1f))
    fun lerp(x: Float, y: Float) = x + (y - x) * e
    return LiftFrame(p, lerp(a.scaleY, b.scaleY), lerp(a.translateY, b.translateY), lerp(a.opacity, b.opacity))
}

/** @keyframes coilShimmer: .74 at the ends, 1 in the middle */
fun shimmerOpacity(phase: Float) = halfway(phase, 0.74f, 1f, SHIMMER_EASING)

/** @keyframes coilGlow: .78 at the ends, 1 in the middle, ease-in-out */
fun glowOpacity(phase: Float) = halfway(phase, 0.78f, 1f, EASE_IN_OUT)

private fun halfway(phase: Float, ends: Float, middle: Float, easing: CubicBezierEasing): Float {
    val p = phase.coerceIn(0f, 1f)
    return if (p <= 0.5f) ends + (middle - ends) * easing.transform(p / 0.5f)
    else middle + (ends - middle) * easing.transform((p - 0.5f) / 0.5f)
}

@Composable
private fun androidx.compose.animation.core.InfiniteTransition.phase(ms: Int, headStart: Int, label: String) =
    animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(ms, easing = LinearEasing),
            initialStartOffset = StartOffset(headStart, StartOffsetType.FastForward),
        ),
        label = label,
    )

/** Android's equivalent of prefers-reduced-motion: animations switched off in the system. */
private fun animationsOff(context: android.content.Context): Boolean =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
