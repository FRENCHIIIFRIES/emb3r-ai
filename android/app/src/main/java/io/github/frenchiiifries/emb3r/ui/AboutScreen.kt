package io.github.frenchiiifries.emb3r.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.net.NetworkProof
import kotlinx.coroutines.launch

/**
 * The claim, and the means to check it. On the desktop the connections the app
 * made are listed so they can be checked; here there are none to list, so the
 * screen lets the claim be tested instead - a real attempt, and what Android did.
 */
@Composable
fun AboutScreen(modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf<NetworkProof.Result?>(null) }
    var trying by remember { mutableStateOf(false) }
    val version = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "?"
    }

    Column(
        modifier.fillMaxSize().background(Emb3rTokens.bg).padding(horizontal = 16.dp, vertical = 12.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        NetIndicator()
        Lit("About", accent, size = 24.sp, bold = true)
        Lit("emb3r for Android · $version", accent.copy(alpha = 0.75f), size = 14.sp, glows = BUTTON_GLOW)

        Lit("Can it reach the internet?", accent, size = 20.sp, bold = true)
        Lit(
            "No. This app holds no permission to use the network, so Android refuses every connection " +
                "it could attempt. Nothing you type or say to Ember can leave this phone - not because she " +
                "is careful, but because she is not allowed to ask.",
            accent, size = 15.sp, glows = BUTTON_GLOW, lineHeight = 1.5f,
        )
        BracketButton(
            if (trying) "[ trying... ]" else "[ try to reach the internet ]",
            onClick = {
                trying = true
                scope.launch { result = NetworkProof.attempt(); trying = false }
            },
            enabled = !trying,
        )
        result?.let {
            // A refusal is the expected answer and reads as a note; a connection
            // would mean the claim is false, and reads as the error it would be.
            Lit(
                it.what,
                if (it.connected) Emb3rTokens.err else Emb3rTokens.sys,
                size = 15.sp, glows = NOTE_GLOW, family = Mono,
            )
        }

        Spacer(Modifier.height(4.dp))
        Lit("What it deliberately cannot do", accent, size = 20.sp, bold = true)
        Lit(
            "Search the web, use Gemini or any other provider, download models, or update itself. " +
                "The desktop can do all of these when asked; this one cannot be asked.",
            accent, size = 15.sp, glows = BUTTON_GLOW, lineHeight = 1.5f,
        )

        Spacer(Modifier.height(4.dp))
        Lit("Made from", accent, size = 20.sp, bold = true)
        Lit(
            "VT323 and JetBrains Mono (SIL Open Font License) · Qwen2.5 (Apache-2.0) · " +
                "Kokoro (Apache-2.0) · Whisper (MIT) · sherpa-onnx (Apache-2.0) · MediaPipe (Apache-2.0)",
            accent.copy(alpha = 0.75f), size = 13.sp, glows = BUTTON_GLOW, lineHeight = 1.5f,
        )
    }
}
