package io.github.frenchiiifries.emb3r.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.ui.settings.SettingsScreen
import io.github.frenchiiifries.emb3r.ui.settings.SpeechControls

/**
 * The four places, in the bracketed-key style of the desktop's own menu, where
 * talk is [o] and settings is [=]. The models live inside Settings, where the
 * desktop keeps them.
 */
enum class Tab(val key: String, val label: String) {
    CHAT("[>]", "chat"),
    TALK("[o]", "talk"),
    SETTINGS("[=]", "settings"),
    ABOUT("[?]", "about"),
}

/**
 * Android's structure - a bottom bar, the system's back gesture - with the
 * desktop's skin on it: its background, its type, its glow, and a rule across
 * the top of the bar drawn at the same 35% the desktop's menu rule uses.
 */
@Composable
fun App(
    engine: Engine,
    settings: SettingsModel,
    chat: ChatModel,
    talk: TalkModel,
    dictation: Dictation,
    importState: ImportState,
    onImport: () -> Unit,
    speech: SpeechControls,
    onType: () -> Unit = {},
) {
    var tab by rememberSaveable { mutableStateOf(Tab.CHAT) }

    // Nothing loads at launch. The answering model when there is somewhere to
    // ask it; her voice and hearing only when Talk is opened.
    LaunchedEffect(tab) {
        when (tab) {
            Tab.CHAT -> engine.warmAnswers()
            Tab.TALK -> { engine.warmAnswers(); engine.warmSpeech() }
            else -> Unit
        }
    }

    // "back to return": from anywhere else, the system back gesture comes home to the terminal
    BackHandler(enabled = tab != Tab.CHAT) { tab = Tab.CHAT }

    Scaffold(
        containerColor = Ink.bg,
        bottomBar = { BottomBar(tab) { tab = it } },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).background(Ink.bg)) {
            when (tab) {
                Tab.CHAT -> ChatScreen(chat, dictation, onNewChat = { chat.newChat() }, onType = onType)
                Tab.TALK -> TalkScreen(talk, onBack = { tab = Tab.CHAT })
                Tab.SETTINGS -> SettingsScreen(settings, engine, importState, onImport, onNote = chat::note, speech = speech)
                Tab.ABOUT -> AboutScreen()
            }
        }
    }
}

@Composable
private fun BottomBar(current: Tab, onSelect: (Tab) -> Unit) {
    val accent = LocalAccent.current
    NavigationBar(
        containerColor = Ink.bg,
        tonalElevation = 0.dp,
        modifier = Modifier.drawBehind {
            drawLine(accent.copy(alpha = 0.35f), Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx())
        },
    ) {
        for (t in Tab.values()) {
            val selected = t == current
            // unselected at 55%, the same fade the desktop gives a model name under a reply
            val colour = if (selected) accent else accent.copy(alpha = 0.55f)
            NavigationBarItem(
                selected = selected,
                onClick = { onSelect(t) },
                icon = { Lit(t.key, colour, glows = if (selected) DOUBLE_GLOW else NO_GLOW, softWrap = false) },
                label = { Lit(t.label, colour, size = 14.sp, glows = if (selected) BUTTON_GLOW else NO_GLOW, softWrap = false) },
                colors = NavigationBarItemDefaults.colors(indicatorColor = Ink.hover),
            )
        }
    }
}
