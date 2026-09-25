package io.github.frenchiiifries.emb3r

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.frenchiiifries.emb3r.ui.Emb3rTheme
import io.github.frenchiiifries.emb3r.ui.Emb3rTokens
import io.github.frenchiiifries.emb3r.ui.FaceState
import io.github.frenchiiifries.emb3r.ui.Faces
import io.github.frenchiiifries.emb3r.ui.emberText

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Emb3rTheme(dark = true) {
                Skeleton()
            }
        }
    }
}

/**
 * The shell, so the type, the colours and the glow can be looked at on a real
 * phone before anything is built on top of them. The screens themselves arrive
 * in later tasks.
 */
@Composable
private fun Skeleton() {
    val accent = MaterialTheme.colorScheme.primary
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Emb3rTokens.bg)
            .safeDrawingPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("no network activity", style = emberText(accent, 12))
            Text("[ ≡ ]", style = emberText(accent, 14))
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(Faces.forState(FaceState.IDLE), style = MaterialTheme.typography.displayLarge)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("say something...", style = emberText(accent.copy(alpha = 0.5f), 14))
            Row {
                Text("[o]", style = emberText(accent, 14), modifier = Modifier.padding(end = 12.dp))
                Text("[ send ]", style = emberText(accent, 14))
            }
        }
    }
}
