package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * button { background: var(--bg-color); color: var(--text-color);
 *          border: 1px solid var(--text-color); padding: 6px 12px }
 * button:hover { background: var(--hover-color) } - which on a phone is pressed.
 */
@Composable
fun BracketButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = LocalAccent.current,
    size: TextUnit = Ink.bodySize,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.5f)
            .background(if (pressed) Ink.hover else Ink.bg)
            .border(1.dp, color)
            .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Lit(label, color, size = size, glows = BUTTON_GLOW, softWrap = false)
    }
}

/**
 * A button that acts while it is held - the [o] microphone. Same look as
 * BracketButton, lit with the hover colour for as long as it is down.
 */
@Composable
fun HoldButton(
    label: String,
    onDown: () -> Unit,
    onUp: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = LocalAccent.current,
) {
    var down by remember { mutableStateOf(false) }
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.5f)
            .background(if (down) color else Ink.bg)
            .border(1.dp, color)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures(onPress = {
                    down = true; onDown()
                    tryAwaitRelease()
                    down = false; onUp()
                })
            }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        // #app.listening #micButton { background: var(--text-color); color: var(--bg-color) }
        Lit(label, if (down) Ink.bg else color, glows = if (down) NO_GLOW else BUTTON_GLOW, softWrap = false)
    }
}

/** #stopButton: amber, with an orange glow - the one control on screen that is not the accent. */
@Composable
fun StopButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val amber = Color(0xFFFFB020)
    Box(
        modifier
            .background(Ink.bg)
            .border(1.dp, amber)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Lit("[ stop ]", amber, glows = listOf(4f), softWrap = false)
    }
}

/**
 * #netIndicator: the light and its words, at 60% - the one thing in the top
 * bar that is a promise rather than a control. On the phone it can never light,
 * because nothing here can reach the network; it is still shown, because it is
 * still the promise.
 */
@Composable
fun NetIndicator(modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    Row(modifier.alpha(0.6f), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).alpha(0.3f).background(accent, CircleShape))
        Spacer(Modifier.width(6.dp))
        Lit("no network activity", accent, size = 13.sp)
    }
}

/** A line of the transcript, in the shape #chat .you and #chat .bot give it, with any reactions over it. */
@Composable
fun LineView(line: Line, modifier: Modifier = Modifier) {
    Box(modifier) {
        LineBody(line)
        if (line.bursts.isNotEmpty()) {
            val color = if (line.who == Who.ERROR) Emb3rTokens.err else LocalAccent.current
            BurstLayer(line.bursts, color, Modifier.matchParentSize())
        }
    }
}

@Composable
private fun LineBody(line: Line, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    when (line.who) {
        Who.DIM -> Lit(line.text, Emb3rTokens.dim, modifier, glows = NO_GLOW)
        Who.SYSTEM -> NoteLine("sys", line.text, Emb3rTokens.sys, modifier)
        Who.ERROR -> NoteLine("err", line.text, Emb3rTokens.err, modifier)
        Who.YOU -> BarLine(Ink.userText, modifier, prompt = {
            // #chat .prompt { opacity: .72 }
            Lit("you >", Ink.userText, Modifier.alpha(0.72f), softWrap = false)
        }) {
            Lit(line.text, Ink.userText)
        }
        Who.EMBER -> BarLine(accent, modifier, prompt = {
            // the coil stands in for "ember:", at full strength (#chat .coilWrap { opacity: 1 })
            Box(Modifier.padding(top = 3.dp)) {
                CoilMark(accent, Modifier.size(17.dp), animate = false, description = "ember:")
            }
        }) {
            Column {
                Lit(line.text, accent)
                line.model?.let {
                    // #chat .msgModel { margin-top: 4px; font-size: 12px; letter-spacing: .04em;
                    //                   color: color-mix(in srgb, var(--text-color) 55%, transparent) }
                    Lit(
                        it, accent.copy(alpha = 0.55f), Modifier.padding(top = 4.dp),
                        size = 12.sp, letterSpacing = 0.04.em, glows = NO_GLOW,
                    )
                }
            }
        }
    }
}

/** display: flex; gap: 9px; border-left: 2px solid (55% of the line's colour); padding-left: 10px */
@Composable
private fun BarLine(
    color: Color,
    modifier: Modifier,
    prompt: @Composable () -> Unit,
    text: @Composable () -> Unit,
) {
    val bar = color.copy(alpha = 0.55f)
    Row(
        modifier
            .fillMaxWidth()
            .drawBehind { drawRect(bar, Offset.Zero, Size(2.dp.toPx(), size.height)) }
            .padding(start = 12.dp, end = 26.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        prompt()
        Box(Modifier.weight(1f)) { text() }
    }
}

/** #chat .sys and .err: their prompt, then the words, both in the note's colour with a 4px glow. */
@Composable
private fun NoteLine(who: String, text: String, color: Color, modifier: Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        Lit("$who >", color, Modifier.alpha(0.72f), glows = NOTE_GLOW, softWrap = false)
        Lit(text, color, Modifier.weight(1f), glows = NOTE_GLOW)
    }
}

/** The ASCII progress bar the desktop draws for a download: [█████░░░░░] 37% */
fun asciiBar(fraction: Float, width: Int = 16): String {
    val f = fraction.coerceIn(0f, 1f)
    val filled = (f * width).toInt()
    return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "] " + (f * 100).toInt() + "%"
}
