package io.github.frenchiiifries.emb3r.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.Part
import io.github.frenchiiifries.emb3r.models.Catalogue
import io.github.frenchiiifries.emb3r.settings.Hardware
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.ui.BUTTON_GLOW
import io.github.frenchiiifries.emb3r.ui.BracketButton
import io.github.frenchiiifries.emb3r.ui.Emb3rTokens
import io.github.frenchiiifries.emb3r.ui.ImportState
import io.github.frenchiiifries.emb3r.ui.Ink
import io.github.frenchiiifries.emb3r.ui.LocalAccent
import io.github.frenchiiifries.emb3r.ui.Lit
import io.github.frenchiiifries.emb3r.ui.Mono
import io.github.frenchiiifries.emb3r.ui.NOTE_GLOW
import io.github.frenchiiifries.emb3r.ui.NO_GLOW
import io.github.frenchiiifries.emb3r.ui.asciiBar
import java.io.File

/**
 * The desktop's Settings > Models: a line saying what is on disk, then a row
 * per model - name, what it is for and where it falls short, and where it
 * stands. There is an import rather than a download button, because the app
 * has no permission to download anything.
 */
@Composable
fun ModelsSection(engine: Engine, settings: SettingsModel, importState: ImportState, onImport: () -> Unit) {
    val accent = LocalAccent.current
    val context = LocalContext.current
    val llm by engine.llm.collectAsState()
    val voice by engine.voiceState.collectAsState()
    val ears by engine.earsState.collectAsState()
    val changes by engine.changes.collectAsState()
    val config by settings.config.collectAsState()
    val paths = engine.paths
    var confirming by remember { mutableStateOf<String?>(null) }

    // read again whenever the files change or another model is chosen
    val answering = remember(changes, config.activeModel, importState) { paths.answering }
    val active = remember(changes, config.activeModel, importState) { paths.llm }
    val here = listOfNotNull(paths.kokoroDir, paths.whisperDir) + answering
    val bytes = here.sumOf { sizeOf(it) }
    // not knowing the phone's memory is no reason to fail the page - it just marks nothing
    val recommended = remember { runCatching { Catalogue.recommendFor(Hardware.totalRamGB(context))?.file }.getOrNull() }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionTitle("Models")
        Lit(
            "${answering.size} answering model${if (answering.size == 1) "" else "s"} on this phone · about ${gb(bytes)} in all",
            accent.copy(alpha = 0.75f), size = 13.sp, glows = BUTTON_GLOW,
        )

        for (file in answering) {
            val listed = Catalogue.find(file.name)
            val isActive = file == active
            val name = Catalogue.nameFor(file.name)
            ModelRow(
                name = name + if (listed?.file == recommended) "  ★ recommended" else "",
                meta = "${gb(sizeOf(file))} · on this phone" + if (listed == null) " · not tested here" else "",
                about = listed?.let { "${it.strength}\n${it.limit}" }
                    ?: "Not one of the models tested on a phone, so nothing is claimed about it. If the library can read it, it will answer.",
                part = if (isActive) llm else Part.Present,
                active = isActive,
                activeLabel = !isActive,
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!isActive) RowButton("Use", onClick = { confirming = null; engine.useModel(file.name) })
                    RowButton(
                        if (confirming == file.name) "✕ remove it" else "✕",
                        onClick = {
                            if (confirming == file.name) { engine.removeModel(file.name); confirming = null }
                            else confirming = file.name
                        },
                    )
                }
            }
        }

        // what the list offers that is not here yet - the phone cannot fetch it, so say where it comes from
        for (m in Catalogue.models.filter { l -> answering.none { it.name.equals(l.file, ignoreCase = true) } }) {
            ModelRow(
                name = m.name + if (m.file == recommended) "  ★ recommended" else "",
                meta = "not on this phone · bring ${m.file} from ${m.source}",
                about = "${m.strength}\n${m.limit}",
                part = Part.Missing,
            )
        }

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
            is ImportState.Done -> Lit(importState.summary(), Emb3rTokens.sys, glows = NOTE_GLOW, size = 16.sp)
            ImportState.Idle -> Unit
        }

        BracketButton("[ import models from a folder ]", onClick = onImport, enabled = importState !is ImportState.Copying)

        // .settingsNote
        Note(
            "emb3r cannot download anything: it has no permission to reach the network. Copy a folder of models onto " +
                "this phone - through the browser, or over USB - and choose it here. Whatever is in it is added: an " +
                "answering model (.litertlm or .task), a kokoro folder, a whisper folder. What is already here at the " +
                "same size is not copied twice.",
        )
        Note(
            "Every model in this list was asked three ordinary questions on a phone before it was listed. Qwen3.5 0.8B " +
                "was tested and left out: asked \"who made you?\" the second time, it repeated one sentence for eight minutes.",
        )
    }
}

/** .modelRow: the hover colour behind the active one and a bar down its left, as the desktop marks it. */
@Composable
private fun ModelRow(
    name: String,
    meta: String,
    about: String,
    part: Part,
    active: Boolean = part == Part.Ready,
    activeLabel: Boolean = false,
    actions: (@Composable () -> Unit)? = null,
) {
    val accent = LocalAccent.current
    val (state, stateColour) = when {
        activeLabel -> "on this phone · not in use" to accent.copy(alpha = 0.6f)
        else -> when (part) {
            Part.Missing -> "not on this phone" to accent.copy(alpha = 0.55f)
            Part.Present -> "on this phone · loads when it's needed" to accent.copy(alpha = 0.75f)
            Part.Loading -> "loading..." to accent
            Part.Ready -> "● loaded" to accent
            is Part.Failed -> part.why to Emb3rTokens.err
        }
    }
    val hover = Ink.hover
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (active) hover else Color.Transparent)
            .drawBehind { if (active) drawRect(accent, Offset.Zero, Size(2.dp.toPx(), size.height)) }
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .alpha(if (part == Part.Missing) 0.6f else 1f),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Lit(name, accent, Modifier.weight(1f), size = 18.sp, bold = true)
            if (actions != null) { Spacer(Modifier.width(8.dp)); actions() }
        }
        Lit(meta, accent.copy(alpha = 0.75f), size = 13.sp, glows = BUTTON_GLOW)
        Lit(state, stateColour, size = 14.sp, glows = if (part is Part.Failed) NOTE_GLOW else BUTTON_GLOW)
        Spacer(Modifier.height(2.dp))
        Lit(about, accent, size = 14.sp, glows = BUTTON_GLOW, lineHeight = 1.45f)
    }
}

private fun sizeOf(f: File): Long = if (f.isDirectory) f.walkTopDown().filter { it.isFile }.sumOf { it.length() } else f.length()

private fun gb(bytes: Long) = if (bytes < 100L * 1024 * 1024) "%.0f MB".format(bytes / 1_048_576.0)
    else "%.1f GB".format(bytes / 1_073_741_824.0)
