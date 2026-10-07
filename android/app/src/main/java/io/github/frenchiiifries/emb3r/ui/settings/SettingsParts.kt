package io.github.frenchiiifries.emb3r.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.ui.BUTTON_GLOW
import io.github.frenchiiifries.emb3r.ui.Emb3rTokens
import io.github.frenchiiifries.emb3r.ui.Ink
import io.github.frenchiiifries.emb3r.ui.LocalAccent
import io.github.frenchiiifries.emb3r.ui.Lit
import io.github.frenchiiifries.emb3r.ui.NOTE_GLOW
import io.github.frenchiiifries.emb3r.ui.Vt323

/** .settingsSection h3 { margin: 0 0 6px; font-size: 18px } */
@Composable
fun SectionTitle(text: String) {
    Lit(text, LocalAccent.current, Modifier.padding(bottom = 6.dp), size = 18.sp, bold = true)
}

/** A label, which the desktop leaves as body text: 20px VT323 with the body's glow. */
@Composable
fun FieldLabel(text: String, modifier: Modifier = Modifier) {
    Lit(text, LocalAccent.current, modifier.padding(top = 10.dp, bottom = 4.dp))
}

/** .settingsNote { font-size: 13px; opacity: .7; line-height: 1.5; margin: 8px 0 0 } */
@Composable
fun Note(text: String, modifier: Modifier = Modifier, emphasis: Boolean = false) {
    val accent = LocalAccent.current
    val m = modifier.padding(top = 8.dp).alpha(0.7f).let {
        // .settingsNote.providerWarn: a bar down the left, for the one thing a reader must not miss
        if (emphasis) it.drawBehind { drawRect(accent, Offset.Zero, Size(2.dp.toPx(), size.height)) }.padding(start = 12.dp)
        else it
    }
    Lit(text, accent, m, size = 13.sp, lineHeight = 1.5f)
}

/**
 * The one-line status under a control - #personalityStatus and its siblings:
 * font-size 13px, opacity .75, and a line reserved even when empty, so the
 * panel does not jump the first time it has something to say.
 */
@Composable
fun Status(text: String, modifier: Modifier = Modifier, bad: Boolean = false) {
    val color = if (bad) Color(0xFFFF8C66) else LocalAccent.current
    Lit(
        text.ifEmpty { " " }, color,
        modifier.padding(top = 4.dp).defaultMinSize(minHeight = 16.dp).alpha(if (bad) 1f else 0.75f),
        size = 13.sp, glows = if (bad) NOTE_GLOW else BUTTON_GLOW,
    )
}

/**
 * #settingsPanel input, textarea: the page's background, the accent's text and
 * a 1px accent border, 8px of padding, the body's font, full width.
 */
@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    secret: Boolean = false,
    digits: Boolean = false,
    lines: Int = 1,
    maxLength: Int = Int.MAX_VALUE,
    readOnly: Boolean = false,
    size: TextUnit = Ink.bodySize,
    onDone: (() -> Unit)? = null,
) {
    val accent = LocalAccent.current
    val glow = Ink.glowSmall
    BasicTextField(
        value = value,
        onValueChange = { if (it.length <= maxLength) onChange(it) },
        modifier = modifier
            .border(1.dp, accent)
            .background(Ink.bg)
            .padding(8.dp)
            // #personalityInput[readonly]: legible, visibly not editable
            .alpha(if (readOnly) 0.6f else 1f),
        readOnly = readOnly,
        textStyle = TextStyle(
            fontFamily = Vt323, fontSize = size, color = accent,
            lineHeight = (size.value * 1.4f).sp,
            shadow = if (glow > 0f) Shadow(accent, Offset.Zero, glow) else null,
        ),
        cursorBrush = SolidColor(accent),
        singleLine = lines == 1,
        minLines = lines,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(
            keyboardType = when {
                digits -> KeyboardType.NumberPassword
                secret -> KeyboardType.Password
                else -> KeyboardType.Text
            },
            imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default,
        ),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty() && placeholder.isNotEmpty()) {
                    Lit(placeholder, accent.copy(alpha = 0.5f), size = size, glows = emptyList(), lineHeight = 1.4f)
                }
                inner()
            }
        },
    )
}

/**
 * A toggle row: #soundToggleRow and its siblings - display: flex;
 * align-items: center; gap: 8px - with the box drawn in the terminal's own
 * lines rather than borrowed from a system theme.
 */
@Composable
fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val accent = LocalAccent.current
    val source = remember { MutableInteractionSource() }
    Row(
        modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.5f)
            .clickable(source, indication = null, enabled = enabled) { onChange(!checked) }
            .semantics {
                role = Role.Checkbox
                stateDescription = if (checked) "on" else "off"
            }
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(16.dp).border(1.dp, accent).padding(3.dp)) {
            if (checked) Box(Modifier.size(10.dp).background(accent))
        }
        Lit(label, accent, Modifier.weight(1f))
    }
}

/**
 * The small buttons in a list row - .profileRow button, .memoryRow button:
 * padding 2px 8px, font-size 13px, the same border and glow as every button.
 */
@Composable
fun RowButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val accent = LocalAccent.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.5f)
            .background(if (pressed) Ink.hover else Ink.bg)
            .border(1.dp, accent)
            .clickable(source, indication = null, enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Lit(label, accent, size = 13.sp, glows = BUTTON_GLOW, softWrap = false)
    }
}

/** A range input, drawn in the accent. */
@Composable
fun RangeSlider(value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit, modifier: Modifier = Modifier, steps: Int = 0) {
    val accent = LocalAccent.current
    Slider(
        value = value.coerceIn(range),
        onValueChange = onChange,
        valueRange = range,
        steps = steps,
        modifier = modifier.fillMaxWidth(),
        colors = SliderDefaults.colors(
            thumbColor = accent,
            activeTrackColor = accent,
            inactiveTrackColor = accent.copy(alpha = 0.25f),
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
        ),
    )
}

/** The receipts box: monospace, 12px, a hover-coloured border - #netLog. */
@Composable
fun LogBox(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().border(1.dp, Ink.hover).padding(8.dp)) { content() }
}

/** #chat .sys's colour, for a result that is the expected, reassuring answer. */
val SysColor = Emb3rTokens.sys
