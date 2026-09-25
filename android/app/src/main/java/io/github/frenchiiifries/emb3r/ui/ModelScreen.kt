package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.Part
import java.io.File

/** Where an import stands. */
sealed interface ImportState {
    data object Idle : ImportState
    data class Copying(val fraction: Float, val current: String) : ImportState
    data class Done(val what: List<String>) : ImportState
    data class Failed(val why: String) : ImportState
}

/**
 * The model screen, laid out like the desktop's Settings > Models: a line
 * saying what is on disk, then a row per model - name, what it is, and where
 * it stands. There is one import rather than a download button, because the
 * app has no permission to download anything.
 */
@Composable
fun ModelScreen(
    engine: Engine,
    importState: ImportState,
    onImport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = LocalAccent.current
    val llm by engine.llm.collectAsState()
    val voice by engine.voiceState.collectAsState()
    val ears by engine.earsState.collectAsState()
    val paths = engine.paths

    val present = listOfNotNull(paths.llm, paths.kokoroDir, paths.whisperDir)
    val bytes = present.sumOf { sizeOf(it) }

    Column(
        modifier.fillMaxSize().background(Emb3rTokens.bg).padding(horizontal = 16.dp, vertical = 12.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        NetIndicator()
        Lit("Models", accent, size = 24.sp, bold = true)
        Lit(
            "${present.size} of 3 on this phone · about ${gb(bytes)}",
            accent.copy(alpha = 0.75f), size = 13.sp, glows = BUTTON_GLOW,
        )

        ModelRow(
            name = engine.modelName() ?: "The answering model",
            meta = paths.llm?.let { "${gb(sizeOf(it))} · on this phone" } ?: "bring: a .task file, such as Qwen2.5 0.5B Instruct",
            about = "Answers you, on this phone. Qwen2.5 0.5B is the model the desktop recommends " +
                "for the smallest machines - a third of a gigabyte, and it runs where nothing else will.",
            part = if (paths.llm == null) Part.Missing else llm,
        )
        ModelRow(
            name = "Ember's voice",
            meta = paths.kokoroDir?.let { "${gb(sizeOf(it))} · Kokoro · bf_lily, speaker 23" } ?: "bring: the kokoro-multi-lang-v1_0 folder",
            about = "The voice chosen on the desktop in step 34. Made at 0.9 speed and played at 1.11, " +
                "so she sits a little higher than the stock voice and is nobody else's.",
            part = if (paths.kokoroDir == null) Part.Missing else voice,
        )
        ModelRow(
            name = "Her hearing",
            meta = paths.whisperDir?.let { "${gb(sizeOf(it))} · Whisper tiny.en · int8" } ?: "bring: the sherpa-onnx-whisper-tiny.en folder",
            about = "Turns what you say into words when you hold the button. The same model the desktop uses.",
            part = if (paths.whisperDir == null) Part.Missing else ears,
        )

        when (importState) {
            is ImportState.Copying -> Column {
                Lit(asciiBar(importState.fraction), accent, family = Mono, size = 14.sp, softWrap = false)
                Lit(importState.current, accent.copy(alpha = 0.6f), size = 13.sp, glows = NO_GLOW)
            }
            is ImportState.Failed -> Lit(importState.why, Emb3rTokens.err, glows = NOTE_GLOW, size = 16.sp)
            is ImportState.Done -> Lit(
                "imported: " + importState.what.joinToString(", "), Emb3rTokens.sys, glows = NOTE_GLOW, size = 16.sp,
            )
            ImportState.Idle -> Unit
        }

        BracketButton(
            "[ import the models folder ]",
            onClick = onImport,
            enabled = importState !is ImportState.Copying,
        )

        // .settingsNote
        Lit(
            "emb3r cannot download anything: it has no permission to reach the network. " +
                "Copy the emb3r-models folder onto this phone - through the browser, or over USB - " +
                "and choose it here once. It holds the answering model, a kokoro folder and a whisper folder.",
            accent.copy(alpha = 0.7f), size = 14.sp, glows = BUTTON_GLOW, lineHeight = 1.5f,
        )
    }
}

@Composable
private fun ModelRow(name: String, meta: String, about: String, part: Part) {
    val accent = LocalAccent.current
    val active = part == Part.Ready
    val (state, stateColour) = when (part) {
        Part.Missing -> "not imported" to accent.copy(alpha = 0.55f)
        Part.Present -> "on this phone · loads when it's needed" to accent.copy(alpha = 0.75f)
        Part.Loading -> "loading..." to accent
        Part.Ready -> "● loaded" to accent
        is Part.Failed -> part.why to Emb3rTokens.err
    }
    Column(
        Modifier
            .fillMaxWidth()
            // .modelRow.isActive: the hover colour behind it and a bar down the left
            .background(if (active) Emb3rTokens.hover else Color.Transparent)
            .drawBehind {
                if (active) drawRect(accent, Offset.Zero, Size(2.dp.toPx(), size.height))
            }
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .alpha(if (part == Part.Missing) 0.6f else 1f),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Lit(name, accent, Modifier.weight(1f), size = 18.sp, bold = true)
        }
        Lit(meta, accent.copy(alpha = 0.75f), size = 13.sp, glows = BUTTON_GLOW)
        Lit(state, stateColour, size = 14.sp, glows = if (part is Part.Failed) NOTE_GLOW else BUTTON_GLOW)
        Lit(about, accent, size = 14.sp, glows = BUTTON_GLOW, lineHeight = 1.45f)
    }
}

private fun sizeOf(f: File): Long = if (f.isDirectory) f.walkTopDown().filter { it.isFile }.sumOf { it.length() } else f.length()

private fun gb(bytes: Long) = if (bytes < 100L * 1024 * 1024) "%.0f MB".format(bytes / 1_048_576.0)
    else "%.1f GB".format(bytes / 1_073_741_824.0)
