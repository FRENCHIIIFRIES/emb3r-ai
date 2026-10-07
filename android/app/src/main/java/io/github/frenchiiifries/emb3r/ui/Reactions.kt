package io.github.frenchiiifries.emb3r.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt
import kotlin.random.Random

/** The desktop's four reactions: a finished reply, a warm moment, a reply cut off, and a failure. */
enum class BurstKind { SPARKLE, HEART, PUFF, GLITCH }

/** A reaction on a line, stamped with when it happened so a line scrolled back into view does not replay it. */
data class Burst(val kind: BurstKind, val at: Long = System.currentTimeMillis())

/**
 * deservesHeart() in renderer.js: the heart is for "happy to help", which is
 * narrower than "finished replying" - firing it on every answer would make it
 * meaningless within a minute. It needs the person being appreciative, or Ember
 * saying something plainly positive near the start of her reply.
 */
object Warmth {
    private val APPRECIATION = Regex(
        """\b(thanks|thank you|thankyou|ty|cheers|appreciate it|appreciated|nice one|good bot|well done|you're the best|youre the best|love (it|this|you)|awesome|brilliant|perfect)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val WARM_REPLY = Regex(
        """\b(happy to help|glad (i|to)|you're welcome|youre welcome|my pleasure|any time|anytime|great question|good question|nice work|well done|congratulations|congrats)\b""",
        RegexOption.IGNORE_CASE,
    )

    fun deservesHeart(userText: String?, replyText: String?): Boolean =
        (userText != null && APPRECIATION.containsMatchIn(userText)) ||
            (replyText != null && WARM_REPLY.containsMatchIn(replyText.take(240)))
}

/**
 * The particles of one line's reactions, drawn over the line they belong to -
 * the reply is the thing being reacted to. Decoration only: switched off by the
 * Reactions setting and by the system's "remove animations", and nothing in
 * them is not also in the text.
 */
@Composable
fun BurstLayer(bursts: List<Burst>, lineColor: Color, modifier: Modifier = Modifier) {
    if (bursts.isEmpty() || !Ink.reactions || animationsOff(LocalContext.current)) return
    val now = System.currentTimeMillis()
    BoxWithConstraints(modifier) {
        val width = maxWidth
        for (b in bursts) {
            if (now - b.at > REPLAY_WINDOW_MS) continue
            key(b) {
                val particles = remember(b) { particlesFor(b.kind, lineColor) }
                for (p in particles) Particle(p, width.value)
            }
        }
    }
}

private const val REPLAY_WINDOW_MS = 2500L

private data class Spec(
    val char: String,
    val leftPercent: Float,
    val sizePx: Float,
    val color: Color,
    val glowPx: Float,
    val alpha: Float,
    val dx: Float,
    val dy: Float,
    val durationMs: Int,
    val delayMs: Int,
    val heart: Boolean,
)

private fun r(from: Double, span: Double) = (from + Random.nextDouble() * span).toFloat()

/** sparkleOn, heartOn, puffOn and glitchOn, with their numbers. */
private fun particlesFor(kind: BurstKind, lineColor: Color): List<Spec> = when (kind) {
    BurstKind.SPARKLE -> List(5) {
        Spec(listOf("·", "✦", "✧", "*", "˚").random(), r(6.0, 84.0), r(9.0, 5.0), lineColor, 6f, 1f,
            r(-9.0, 18.0), -18f - Random.nextFloat() * 16f, 700 + Random.nextInt(500), Random.nextInt(220), false)
    }
    BurstKind.HEART -> listOf(
        // deliberately not the theme colour: this one is meant to be noticed
        Spec("♥", r(60.0, 22.0), 15f, Color(0xFFFF8FA3), 8f, 1f,
            r(-7.0, 14.0), -34f - Random.nextFloat() * 14f, 1200 + Random.nextInt(400), 0, true),
    )
    // the answer went out, not up: a puff that drifts sideways and barely climbs
    BurstKind.PUFF -> List(6) {
        Spec(listOf("˚", "°", "·", "∘").random(), r(58.0, 34.0), r(10.0, 6.0), lineColor, 0f, 0.55f,
            r(-17.0, 34.0), -8f - Random.nextFloat() * 10f, 900 + Random.nextInt(600), Random.nextInt(260), false)
    }
    // interference: scattered rather than rising, brief and monochrome red
    BurstKind.GLITCH -> List(7) {
        Spec(listOf("▚", "▞", "▘", "▝", "░", "▒").random(), r(4.0, 88.0), r(8.0, 4.0), Color(0xFFE0524A), 5f, 1f,
            r(-13.0, 26.0), r(-9.0, 18.0), 380 + Random.nextInt(220), Random.nextInt(120), false)
    }
}

/** One character, animated by the sparkleFloat or heartRise keyframes. */
@Composable
private fun Particle(p: Spec, lineWidth: Float) {
    val t = remember(p) { Animatable(0f) }
    LaunchedEffect(p) {
        delay(p.delayMs.toLong())
        t.animateTo(1f, tween(p.durationMs, easing = LinearEasing))
    }
    val progress = t.value
    val frame = if (p.heart) heartRise(progress, p.dx, p.dy) else sparkleFloat(progress, p.dx, p.dy)
    val density = LocalDensity.current
    Box(
        Modifier
            .offset { IntOffset((lineWidth * p.leftPercent / 100f * density.density).roundToInt(), 0) }
            .graphicsLayer {
                translationX = frame.x.dp.toPx()
                translationY = frame.y.dp.toPx()
                scaleX = frame.scale; scaleY = frame.scale
                alpha = (frame.opacity * p.alpha).coerceIn(0f, 1f)
            },
    ) {
        // font sizes are the desktop's pixels, which are the phone's dp; the glow is its text-shadow
        val size = with(density) { p.sizePx.dp.toSp() }
        Lit(p.char, p.color, size = size, lineHeight = 1f, glows = if (p.glowPx > 0f) listOf(p.glowPx) else NO_GLOW, softWrap = false)
    }
}

private data class Frame(val x: Float, val y: Float, val scale: Float, val opacity: Float)

/** CSS ease-out, cubic-bezier(0, 0, .58, 1), applied within each keyframe interval as CSS applies it. */
private fun easeOut(x: Float): Float {
    var lo = 0f; var hi = 1f
    repeat(24) {
        val mid = (lo + hi) / 2
        val bx = 3 * (1 - mid) * mid * mid * 0.58f + mid * mid * mid
        if (bx < x) lo = mid else hi = mid
    }
    val s = (lo + hi) / 2
    return 3 * (1 - s) * (1 - s) * s * 0f + 3 * (1 - s) * s * s * 1f + s * s * s
}

/** Interpolates keyframes (offset to value), easing each interval separately. */
private fun keyframes(t: Float, vararg frames: Pair<Float, Float>): Float {
    for (i in 0 until frames.size - 1) {
        val (a, va) = frames[i]; val (b, vb) = frames[i + 1]
        if (t <= b) return va + (vb - va) * easeOut(((t - a) / (b - a)).coerceIn(0f, 1f))
    }
    return frames.last().second
}

/**
 * @keyframes sparkleFloat
 *   0%   { opacity: 0; transform: translate(0, 0) scale(.55) }
 *   25%  { opacity: .9 }   70% { opacity: .65 }
 *   100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) }
 */
private fun sparkleFloat(t: Float, dx: Float, dy: Float) = Frame(
    x = keyframes(t, 0f to 0f, 1f to dx),
    y = keyframes(t, 0f to 0f, 1f to dy),
    scale = keyframes(t, 0f to 0.55f, 1f to 1f),
    opacity = keyframes(t, 0f to 0f, 0.25f to 0.9f, 0.7f to 0.65f, 1f to 0f),
)

/**
 * @keyframes heartRise - it pops out before it drifts, so "pleased" reads as
 * distinct from "finished" rather than the same effect in another colour.
 *   0%   { opacity: 0; transform: translate(0, 4px) scale(.5) }
 *   18%  { opacity: 1; transform: translate(0, 0) scale(1.15) }
 *   35%  {             transform: translate(0, -6px) scale(1) }
 *   100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.9) }
 */
private fun heartRise(t: Float, dx: Float, dy: Float) = Frame(
    x = keyframes(t, 0f to 0f, 0.18f to 0f, 0.35f to 0f, 1f to dx),
    y = keyframes(t, 0f to 4f, 0.18f to 0f, 0.35f to -6f, 1f to dy),
    scale = keyframes(t, 0f to 0.5f, 0.18f to 1.15f, 0.35f to 1f, 1f to 0.9f),
    opacity = keyframes(t, 0f to 0f, 0.18f to 1f, 1f to 0f),
)
