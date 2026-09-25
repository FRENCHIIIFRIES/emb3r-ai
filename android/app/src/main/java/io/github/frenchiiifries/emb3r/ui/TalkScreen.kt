package io.github.frenchiiifries.emb3r.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Talk - the desktop's face mode. A view built for not reading the screen, so
 * the face does the work a status line would, and everything else is quieter
 * than it: what she said at 85%, what she heard you say at 55%, the hint at 45%.
 */
@Composable
fun TalkScreen(talk: TalkModel, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val face by talk.face.collectAsState()
    val said by talk.said.collectAsState()
    val heard by talk.heard.collectAsState()
    val trouble by talk.trouble.collectAsState()
    val listening by talk.listening.collectAsState()

    Column(
        modifier.fillMaxSize().background(Emb3rTokens.bg).padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NetIndicator()
            if (listening) MicIndicator(Modifier.padding(start = 12.dp))
        }

        // #faceMode { flex-direction: column; align-items: center; justify-content: center;
        //             gap: clamp(14px, 3vh, 30px) }
        Column(
            Modifier.weight(1f).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterVertically),
        ) {
            BigFace(Faces.forState(if (listening) FaceState.LISTENING else face))

            // #faceSaid { max-width: 44ch; font-size: clamp(15px, 1.7vw, 19px); line-height: 1.5;
            //             opacity: .85; min-height: 3em }
            Column(
                Modifier.widthIn(max = 360.dp).defaultMinSize(minHeight = 67.dp).alpha(0.85f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (said.isNotEmpty()) Lit(said, accent, size = 15.sp, lineHeight = 1.5f, align = TextAlign.Center)
                // .faceTrouble { margin-top: .9em; font-size: .78em; opacity: .75 } - under the
                // answer, never in place of it
                trouble?.let {
                    Lit(
                        it, accent, Modifier.padding(top = 13.dp).alpha(0.75f),
                        size = (15 * 0.78).sp, lineHeight = 1.5f, align = TextAlign.Center,
                    )
                }
            }

            // #faceHeard { font-size: clamp(14px, 1.5vw, 17px); opacity: .55 }
            // #faceHeard::before { content: "you said  "; opacity: .6 }
            if (heard.isNotEmpty()) {
                Row(Modifier.widthIn(max = 360.dp).alpha(0.55f)) {
                    Lit("you said  ", accent, Modifier.alpha(0.6f), size = 14.sp, softWrap = false)
                    Lit(heard, accent, size = 14.sp)
                }
            }

            MicPill(listening, onDown = { talk.hold() }, onUp = { talk.release() })

            // #faceHint { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; opacity: .45 }
            // The desktop's says "hold the button or the spacebar · Esc to go back"; a phone has neither key.
            Lit(
                "hold the button · back to return".uppercase(), accent, Modifier.alpha(0.45f),
                size = 13.sp, letterSpacing = 0.14.em, softWrap = false,
            )

            // #faceExit { opacity: .6; background: transparent }
            Box(
                Modifier.alpha(0.6f).border(1.dp, accent).clickable(onClick = onBack)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Lit("[ back to the terminal ]", accent, glows = BUTTON_GLOW, softWrap = false)
            }
        }
    }
}

/**
 * #faceBig: the face, filling the view, in a gradient made from the accent -
 * lighter at the top, the colour itself at 45%, darker at the bottom - with a
 * glow half as wide again as everything else's.
 */
@Composable
private fun BigFace(face: String) {
    val accent = LocalAccent.current
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        // font-size: clamp(46px, 12vw, 132px)
        val px = (maxWidth.value * 0.12f).coerceIn(46f, 132f)
        val size = with(density) { px.dp.toSp() }
        Text(
            face,
            softWrap = false,
            style = TextStyle(
                fontFamily = Vt323,
                fontSize = size,
                lineHeight = (size.value * 1.1f).sp,
                letterSpacing = (-0.02).em,
                brush = faceGradient(accent),
                shadow = Shadow(accent, Offset.Zero, Emb3rTokens.glowBig * 1.5f),
            ),
        )
    }
}

/**
 * #faceMic: a pill, held rather than tapped. While it is held it fills with the
 * accent and the dot pulses - #app.listening #faceMic and @keyframes micPulse.
 */
@Composable
private fun MicPill(listening: Boolean, onDown: () -> Unit, onUp: () -> Unit) {
    val accent = LocalAccent.current
    val fg = if (listening) Emb3rTokens.bg else accent
    Row(
        Modifier
            .background(if (listening) accent else Emb3rTokens.bg, RoundedCornerShape(50))
            .border(1.dp, accent, RoundedCornerShape(50))
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    onDown()
                    tryAwaitRelease()
                    onUp()
                })
            }
            .padding(horizontal = 26.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PulseDot(fg, pulsing = listening, restingAlpha = 0.4f, size = 9)
        Lit(
            (if (listening) "listening" else "hold to talk").uppercase(), fg,
            size = 15.sp, letterSpacing = 0.1.em, glows = if (listening) NO_GLOW else DOUBLE_GLOW, softWrap = false,
        )
    }
}

/** #micIndicator: the top bar's light for the microphone, matching the network one beside it. */
@Composable
fun MicIndicator(modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        PulseDot(accent, pulsing = true, restingAlpha = 1f, size = 8)
        Spacer(Modifier.width(6.dp))
        Lit("LISTENING", accent, size = 12.sp, letterSpacing = 0.08.em, softWrap = false)
    }
}

/** @keyframes micPulse { 0%, 100% { scale(1); opacity: 1 } 50% { scale(1.5); opacity: .5 } }, 1.1s ease-in-out */
@Composable
private fun PulseDot(color: androidx.compose.ui.graphics.Color, pulsing: Boolean, restingAlpha: Float, size: Int) {
    if (!pulsing) {
        Box(Modifier.size(size.dp).alpha(restingAlpha).background(color, CircleShape))
        return
    }
    val t = rememberInfiniteTransition(label = "micPulse")
    val phase by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(550, easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)), RepeatMode.Reverse),
        label = "micPulsePhase",
    )
    Box(
        Modifier.size(size.dp).scale(1f + 0.5f * phase).alpha(1f - 0.5f * phase).background(color, CircleShape),
    )
}
