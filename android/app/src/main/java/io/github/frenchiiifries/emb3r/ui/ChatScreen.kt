package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** What the terminal's [o] button needs: start listening, then hand back the words. */
interface Dictation {
    /** Returns false, having said why, if it could not start. */
    fun start(): Boolean
    suspend fun finish(): String
}

/**
 * The terminal. Its parts are the desktop's, in the desktop's order: the header
 * box with the mark, the wordmark, the face and the mood; the bordered
 * transcript; and the input row - a ">" prompt, the box, [o] and [ send ].
 */
@Composable
fun ChatScreen(chat: ChatModel, dictation: Dictation, onNewChat: () -> Unit, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val lines by chat.lines.collectAsState()
    val face by chat.face.collectAsState()
    val mood by chat.mood.collectAsState()
    val generating by chat.generating.collectAsState()

    var input by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(lines.size, lines.lastOrNull()?.text?.length) {
        if (lines.isNotEmpty()) list.scrollToItem(lines.lastIndex, Int.MAX_VALUE)
    }

    fun send() {
        if (input.isBlank() || generating) return
        chat.send(input)
        input = ""
    }

    Column(
        modifier
            .fillMaxSize()
            .background(Emb3rTokens.bg)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .imePadding(),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            NetIndicator(Modifier.weight(1f))
            BracketButton("[+]", onClick = { input = ""; onNewChat() }, size = 16.sp)
        }
        Spacer(Modifier.height(12.dp))

        // #pet { border: 1px solid; padding: 24px } - #pet.compact { padding: 8px 24px }
        // Compact while typing, as on the desktop: the keyboard wants the room.
        Column(
            Modifier
                .fillMaxWidth()
                .border(1.dp, accent)
                .padding(horizontal = 24.dp, vertical = if (focused) 8.dp else 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (!focused) {
                LogoRow()
                Spacer(Modifier.height(20.dp))
            }
            // #stats { display: flex; align-items: baseline; gap: 18px; font-size: 13px }
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.Bottom) {
                Lit(Faces.forState(face), accent, size = if (focused) 18.sp else 26.sp, bold = true, lineHeight = 1f, softWrap = false)
                Lit("mood " + ChatModel.bar(mood), accent, size = 13.sp, softWrap = false)
            }
        }
        Spacer(Modifier.height(12.dp))

        // #chat { border: 1px solid; padding: 12px }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().border(1.dp, accent).padding(12.dp),
            state = list,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(lines) { _, line -> LineView(line) }
        }

        // #row { display: flex; align-items: center; gap: 8px; margin-top: 10px }
        Row(
            Modifier.fillMaxWidth().padding(top = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Lit(">", accent, softWrap = false)
            BasicTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, accent)
                    .background(Emb3rTokens.bg)
                    .padding(horizontal = 10.dp, vertical = 8.dp)
                    .onFocusChanged { focused = it.isFocused },
                textStyle = TextStyle(
                    fontFamily = Vt323, fontSize = Emb3rTokens.bodySize, color = accent,
                    shadow = Shadow(accent, Offset.Zero, Emb3rTokens.glowSmall),
                ),
                cursorBrush = SolidColor(accent),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                decorationBox = { inner ->
                    Box {
                        if (input.isEmpty()) Lit("say something...", accent.copy(alpha = 0.5f), softWrap = false)
                        inner()
                    }
                },
            )
            // Dictation: the words land in the box to be read and corrected before
            // sending, because recognition is wrong often enough that sending unseen
            // text is worse than one extra tap - the desktop's reasoning, kept.
            HoldButton(
                "[o]",
                onDown = { dictation.start() },
                onUp = { scope.launch { val heard = dictation.finish(); if (heard.isNotBlank()) input = heard } },
                enabled = !generating,
            )
            if (generating) StopButton(onClick = { chat.stop() })
            else BracketButton("[ send ]", onClick = { send() })
        }
    }
}

/**
 * #logoWrap: the salamander beside the wordmark, 16px apart. The desktop's
 * composition is 104px of mark, 16px of gap and 43 columns of 17px JetBrains
 * Mono; on a phone that is wider than the screen, so the whole composition is
 * scaled by one factor rather than rearranged - it keeps its proportions.
 * Sizes are fixed rather than following the system font scale, because a larger
 * font would break the art rather than make it more readable.
 */
@Composable
private fun LogoRow() {
    val accent = LocalAccent.current
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val advance = 0.6f                                   // JetBrains Mono is 600 units to the em
        val desktopWidth = 104f + 16f + Wordmark.COLUMNS * advance * 17f
        val scale = minOf(1f, maxWidth.value / desktopWidth)
        val fontSp = with(density) { (17f * scale).dp.toSp() }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy((16f * scale).dp)) {
            CoilMark(accent, Modifier.size((104f * scale).dp), dark = LocalDark.current, description = "emb3r")
            Column {
                for (row in Wordmark.rows) {
                    // #logo { font-size: 17px; line-height: 1 }
                    Lit(row, accent, size = fontSp, family = Mono, lineHeight = 1f, softWrap = false)
                }
            }
        }
    }
}
