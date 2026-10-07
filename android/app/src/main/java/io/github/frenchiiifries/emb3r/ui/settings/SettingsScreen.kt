package io.github.frenchiiifries.emb3r.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.ui.BUTTON_GLOW
import io.github.frenchiiifries.emb3r.ui.ImportState
import io.github.frenchiiifries.emb3r.ui.Ink
import io.github.frenchiiifries.emb3r.ui.LocalAccent
import io.github.frenchiiifries.emb3r.ui.Lit
import io.github.frenchiiifries.emb3r.ui.NO_GLOW
import io.github.frenchiiifries.emb3r.ui.NetIndicator

/**
 * The sections, in the desktop's order, with the words people actually search
 * for - SETTINGS_KEYWORDS in renderer.js. Spotify, Web access and Updates are
 * not here: each of them needs the network, and this app has no permission to
 * reach it.
 */
enum class Section(val label: String, val keywords: String, val tucked: Boolean = false) {
    ACCOUNT("Account", "profile profiles name user rename switch identity who"),
    PRIVACY("Privacy", "offline lock network connections log outbound internet security airplane"),
    // tucked: kept out of the list until searched for, so the default install
    // has no entry about children in it - the desktop's reasoning, kept
    STUDENT(
        "Student mode",
        "safe mode school child kid age restriction pin lock filter parent teacher " +
            "classroom appropriate block swearing profanity supervision",
        tucked = true,
    ),
    PERSONALITY("Personality", "prompt system character instructions behaviour behavior tone persona"),
    MEMORY("Memory", ""),
    MODELS("Models", "model import delete disk space storage gemma qwen lfm litertlm task size brain"),
    HARDWARE("Hardware", "ram cpu gpu vram memory cores detect scan specs"),
    DISPLAY(
        "Display",
        "theme dark light colour color accent font size glow sound effects reactions " +
            "animation mute appearance contrast voice speech speak talk aloud read " +
            "narrate tts spoken pitch speed accessibility",
    ),
}

/** The desktop's words for the three sections that need the network, so a search for them can say why they are missing. */
private const val NETWORK_ONLY = "spotify music now playing track integration gemini internet search online api key " +
    "current information lookup provider endpoint openai compatible groq openrouter together deepseek mistral " +
    "base url custom anthropic claude gpt server web update version upgrade release install newer"

/**
 * applySettingsFilter(): which tabs are offered for a search. A tucked tab is
 * offered only when searched for, or while its mode is on; the open tab is
 * never hidden, or nothing would show as selected while its content sat there.
 */
fun offeredSections(query: String, studentOn: Boolean): List<Section> {
    val q = query.trim().lowercase()
    return Section.entries.filter { s ->
        val matched = q.isEmpty() || "${s.label} ${s.keywords}".lowercase().contains(q)
        matched && (!s.tucked || studentOn || q.isNotEmpty())
    }
}

/** A search for something that exists only where there is a network. */
fun needsNetwork(query: String): Boolean {
    val q = query.trim().lowercase()
    return q.length >= 3 && NETWORK_ONLY.contains(q)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    settings: SettingsModel,
    engine: Engine,
    importState: ImportState,
    onImport: () -> Unit,
    onNote: (String) -> Unit,
    speech: SpeechControls,
    modifier: Modifier = Modifier,
    start: Section = Section.ACCOUNT,
) {
    val accent = LocalAccent.current
    val config by settings.config.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf(start) }

    val offered = offeredSections(query, config.safeMode)
    // the tab whose section is open stays in the list; it does not count as a match
    val shown = Section.entries.filter { it in offered || it == open }

    Column(
        modifier.fillMaxSize().background(Ink.bg).padding(horizontal = 16.dp, vertical = 12.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        NetIndicator()
        Spacer(Modifier.height(10.dp))
        // #settingsHeader h2 - the browser's h2, 1.5em of the body's 20px
        Lit("Settings", accent, size = 30.sp, bold = true)
        Spacer(Modifier.height(14.dp))

        // #settingsNav, narrow: the search, the tabs wrapping as a row, a rule underneath
        Column(
            Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Field(
                value = query,
                onChange = { next ->
                    query = next
                    // Jump straight there once the search has narrowed to one
                    // section - typing "glow" and still having to tap Display
                    // would be the search not finishing its job.
                    val hits = offeredSections(next, config.safeMode)
                    if (next.isNotBlank() && hits.size == 1 && hits[0] != open) open = hits[0]
                },
                modifier = Modifier.fillMaxWidth(),
                placeholder = "Search settings...",
                size = 13.sp,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (s in shown) Tab(s.label, active = s == open) { open = s }
            }
            if (offered.isEmpty()) {
                // #settingsNoMatch { font-size: 12.5px; opacity: .55 }
                Lit(
                    if (needsNetwork(query)) "that needs the network - emb3r on a phone has no permission to reach it, " +
                        "so Spotify, web access and updates are not here"
                    else "no setting matches that",
                    accent, Modifier.alpha(0.55f).padding(horizontal = 2.dp, vertical = 4.dp), size = 12.5.sp, glows = NO_GLOW,
                )
            }
        }
        // border-bottom: 1px solid var(--hover-color)
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.hover))
        Spacer(Modifier.height(12.dp))

        when (open) {
            Section.ACCOUNT -> AccountSection(settings, onNote)
            Section.PRIVACY -> PrivacySection()
            Section.STUDENT -> StudentSection(settings)
            Section.PERSONALITY -> PersonalitySection(settings)
            Section.MEMORY -> MemorySection(settings, engine)
            Section.MODELS -> ModelsSection(engine, settings, importState, onImport)
            Section.HARDWARE -> HardwareSection()
            Section.DISPLAY -> DisplaySection(settings, engine, speech)
        }
        Spacer(Modifier.height(16.dp))
    }
}

/**
 * .settingsTab: 6px 10px, 14px, at 60% until chosen; the chosen one at full
 * strength on the hover colour. (The border down its left edge is the wide
 * layout's; the narrow one drops it, and a phone is narrow.)
 */
@Composable
private fun Tab(label: String, active: Boolean, onClick: () -> Unit) {
    val accent = LocalAccent.current
    val source = remember { MutableInteractionSource() }
    Box(
        Modifier
            .background(if (active) Ink.hover else Ink.bg)
            .clickable(source, indication = null, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .alpha(if (active) 1f else 0.6f),
    ) {
        Lit(label, accent, size = 14.sp, glows = BUTTON_GLOW, softWrap = false)
    }
}

/** Ember's voice, as Display needs it: a line to audition her with, and a way to stop. */
interface SpeechControls {
    /** Speaks the preview line; returns why it could not, or null once it has been said. */
    suspend fun preview(): String?
    fun stop()

    object None : SpeechControls {
        override suspend fun preview(): String? = null
        override fun stop() = Unit
    }
}
