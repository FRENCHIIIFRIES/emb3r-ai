package io.github.frenchiiifries.emb3r.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.frenchiiifries.emb3r.Engine
import io.github.frenchiiifries.emb3r.infer.EMBER_SYSTEM
import io.github.frenchiiifries.emb3r.infer.LiteRtAnswerer
import io.github.frenchiiifries.emb3r.infer.Prompts
import io.github.frenchiiifries.emb3r.net.NetworkProof
import io.github.frenchiiifries.emb3r.settings.Accent
import io.github.frenchiiifries.emb3r.settings.Config
import io.github.frenchiiifries.emb3r.settings.Hardware
import io.github.frenchiiifries.emb3r.settings.SettingsModel
import io.github.frenchiiifries.emb3r.settings.ThemeName
import io.github.frenchiiifries.emb3r.ui.BracketButton
import io.github.frenchiiifries.emb3r.ui.Emb3rTokens
import io.github.frenchiiifries.emb3r.ui.Ink
import io.github.frenchiiifries.emb3r.ui.LocalAccent
import io.github.frenchiiifries.emb3r.ui.LocalDark
import io.github.frenchiiifries.emb3r.ui.Lit
import io.github.frenchiiifries.emb3r.ui.Mono
import io.github.frenchiiifries.emb3r.ui.NOTE_GLOW
import io.github.frenchiiifries.emb3r.ui.NO_GLOW
import io.github.frenchiiifries.emb3r.ui.Palettes
import io.github.frenchiiifries.emb3r.ui.Palettes.rgb
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// ---------------------------------------------------------------- Account

@Composable
fun AccountSection(settings: SettingsModel, onNote: (String) -> Unit) {
    val accent = LocalAccent.current
    val config by settings.config.collectAsState()
    var name by remember { mutableStateOf("") }
    Column {
        SectionTitle("Account")
        for (p in config.profiles) {
            val active = p.id == config.activeProfileId
            // .profileRow: space-between, 4px 0, 15px
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Lit("${p.name.ifEmpty { "(unnamed)" }}${if (active) " ● active" else ""}", accent, Modifier.weight(1f), size = 15.sp)
                if (!active) {
                    RowButton("Switch", onClick = { settings.switchProfile(p.id).let { if (it.ok) onNote(it.message) } })
                    Spacer(Modifier.width(4.dp))
                    RowButton("✕", onClick = { settings.deleteProfile(p.id) })
                }
            }
        }
        FieldLabel("New profile name")
        Field(name, { name = it }, Modifier.fillMaxWidth(), placeholder = "e.g. Ziyan", maxLength = Prompts.MAX_PROFILE_NAME_LENGTH)
        Spacer(Modifier.height(8.dp))
        BracketButton("Add Profile", onClick = {
            if (name.isBlank()) return@BracketButton
            val r = settings.createProfile(name)
            if (r.ok) { name = ""; onNote(r.message) }
        })
    }
}

// ---------------------------------------------------------------- Privacy

/**
 * On the desktop the offline lock is a switch, because a fresh install has to
 * fetch a model. Here it is the app itself: Android refuses every connection,
 * because emb3r never asked for the permission to make one. So the box is
 * ticked and cannot be unticked, and the receipts show the proof instead.
 */
@Composable
fun PrivacySection() {
    val accent = LocalAccent.current
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf<NetworkProof.Result?>(null) }
    var trying by remember { mutableStateOf(false) }
    Column {
        SectionTitle("Privacy")
        Toggle("Offline lock — refuse all outbound connections", checked = true, onChange = {}, enabled = false)
        Status("on, and it cannot be switched off here: emb3r holds no permission to use the network")
        Note(
            "On a computer this is a switch, because a fresh install has to fetch a model. On this phone it is " +
                "not a setting at all. The app does not declare Android's INTERNET permission, so the phone " +
                "itself refuses every connection it tries - not code inside emb3r that could be wrong, and not " +
                "something a later update could quietly change without Android saying so.",
        )
        Note("It does not firewall the rest of your phone. Other apps are unaffected.")
        Note(
            "Spotify, web access and updates are not on this phone for the same reason: each of them needs " +
                "the network. The models arrive the one way left - you copy them onto the phone yourself.",
        )

        FieldLabel("Connections since launch")
        LogBox {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Lit("none. emb3r has no permission to make one.", accent, size = 12.sp, family = Mono, glows = NO_GLOW)
                result?.let {
                    Lit(it.what, if (it.connected) Emb3rTokens.err else SysColor, size = 12.sp, family = Mono, glows = NOTE_GLOW)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        BracketButton(
            if (trying) "[ trying... ]" else "[ try to reach the internet ]",
            onClick = { trying = true; scope.launch { result = NetworkProof.attempt(); trying = false } },
            enabled = !trying,
            size = 16.sp,
        )
    }
}

// ---------------------------------------------------------------- Student mode

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StudentSection(settings: SettingsModel) {
    val config by settings.config.collectAsState()
    val on = config.safeMode
    val pinSet = config.safeModePin != null
    // when a PIN guards it, the box stops being the way to turn it off - the unlock row is
    val locked = on && pinSet
    var status by remember { mutableStateOf("") }
    var unlockPin by remember { mutableStateOf("") }
    var currentPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var pinStatus by remember { mutableStateOf("") }
    LaunchedEffect(pinStatus) { if (pinStatus == "PIN saved" || pinStatus == "PIN removed") { delay(2000); pinStatus = "" } }

    val state = when {
        !on -> "off"
        pinSet -> "on — the PIN is needed to turn it off"
        else -> "on — no PIN set, so it can be switched off here"
    }

    Column {
        SectionTitle("Student mode")
        Toggle("Student mode — keep replies suitable for school", checked = on, enabled = !locked, onChange = { wanted ->
            val r = settings.setSafeMode(wanted)
            status = if (r.ok) "" else r.message
        })
        Status(status.ifEmpty { state })

        if (locked) {
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(unlockPin, { unlockPin = it }, Modifier.width(130.dp), placeholder = "PIN", secret = true, digits = true, maxLength = 8)
                BracketButton("Turn off student mode", size = 16.sp, onClick = {
                    val r = settings.setSafeMode(false, unlockPin.trim())
                    status = if (r.ok) "" else r.message
                    unlockPin = ""
                })
            }
        }

        Note(
            "Ember is told, before every reply, that it is talking to a school student: no sexual content, no graphic " +
                "violence, no profanity, and nothing about weapons, drugs or self-harm. If a student brings up hurting " +
                "themselves, Ember says plainly to talk to a teacher or another trusted adult instead of trying to counsel them.",
        )
        Note("A small number of blunt, explicitly harmful questions are answered with a fixed safe reply and never reach the model at all.")
        Note(
            "Be clear about what this is. It steers a language model; it does not police it. A determined student can " +
                "still phrase something to get around it, and it is not a substitute for supervision or for your school's " +
                "network filtering. It reduces accidental exposure — treat it as that, not as a guarantee.",
        )
        Note("While it is on, the Personality page is read-only, because Ember's instructions are the thing student mode changes.")

        FieldLabel("PIN (optional)")
        Note(
            "Without a PIN, student mode is a setting anyone can switch off. Set one and turning it off asks for it " +
                "first. Turning it on never needs a PIN.",
        )
        FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // a "current PIN" box only once there is one - asking for a PIN never set is a box nobody can fill in
            if (pinSet) Field(currentPin, { currentPin = it }, Modifier.width(150.dp), placeholder = "Current PIN", secret = true, digits = true, maxLength = 8)
            Field(newPin, { newPin = it }, Modifier.width(150.dp), placeholder = "New PIN (4–8 digits)", secret = true, digits = true, maxLength = 8)
            BracketButton(if (pinSet) "Change PIN" else "Set PIN", size = 16.sp, onClick = {
                if (newPin.isBlank()) { pinStatus = "Enter a new PIN of 4 to 8 digits."; return@BracketButton }
                val r = settings.setSafeModePin(newPin.trim(), currentPin.trim())
                pinStatus = r.message
                if (r.ok) { newPin = ""; currentPin = "" }
            })
            BracketButton("Remove PIN", size = 16.sp, enabled = pinSet, onClick = {
                val r = settings.setSafeModePin(null, currentPin.trim())
                pinStatus = r.message
                if (r.ok) { newPin = ""; currentPin = "" }
            })
        }
        Status(pinStatus, bad = pinStatus.isNotEmpty() && pinStatus != "PIN saved" && pinStatus != "PIN removed")
        Note(
            "Keep the PIN somewhere you can find it. There is no recovery — if it is lost, the only way back is to " +
                "clear emb3r's storage in Android's settings, which removes the imported models too.",
        )
    }
}

// ---------------------------------------------------------------- Personality

@Composable
fun PersonalitySection(settings: SettingsModel) {
    val config by settings.config.collectAsState()
    val locked = config.safeMode
    // the box holds your own words; an empty box means the default, shown as its placeholder
    var text by remember(config.systemPrompt) { mutableStateOf(config.systemPrompt ?: "") }
    var status by remember { mutableStateOf("") }
    LaunchedEffect(status) { if (status.isNotEmpty()) { delay(1500); status = "" } }

    Column {
        SectionTitle("Personality")
        FieldLabel("What Ember is told to be, before every reply")
        Field(
            text, { text = it }, Modifier.fillMaxWidth(),
            placeholder = EMBER_SYSTEM, lines = 4, maxLength = Prompts.MAX_PERSONALITY_LENGTH, readOnly = locked,
        )
        // #personalityButtons: two buttons sharing the row equally
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BracketButton("Save", modifier = Modifier.weight(1f), enabled = !locked, onClick = { status = settings.setPersonality(text).message })
            BracketButton("Reset to default", modifier = Modifier.weight(1f), enabled = !locked, onClick = {
                status = settings.resetPersonality().message
                text = ""
            })
        }
        Status(status)
        if (locked) {
            Note("Student mode is on, so this is read-only. Turn it off under Student mode to edit Ember's personality.")
        }
    }
}

// ---------------------------------------------------------------- Memory

@Composable
fun MemorySection(settings: SettingsModel, engine: Engine) {
    val accent = LocalAccent.current
    val config by settings.config.collectAsState()
    val memories = config.activeProfile.memories
    var input by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }

    fun submit() {
        val t = input.trim()
        if (t.isEmpty()) return
        val r = settings.addMemory(t)
        status = r.message
        if (r.ok) input = ""
    }

    // what it actually costs: only the few memories a question touches are sent,
    // so the figure is the worst case for one reply, not a standing charge
    val worst = memories.take(SettingsModel.MEMORY_PICK_MAX).sumOf { it.text.length }
    val window = engine.activeFile()?.name?.let(LiteRtAnswerer::contextFor) ?: 4096
    val budget = if (config.memoryEnabled) {
        "${memories.size} of ${SettingsModel.MEMORY_MAX_ENTRIES} kept · at most ${SettingsModel.MEMORY_PICK_MAX} are sent with " +
            "any one question, about ${(worst + 3) / 4} tokens of the $window-token window, and only when they match what you asked."
    } else {
        "${memories.size} of ${SettingsModel.MEMORY_MAX_ENTRIES} kept · not being used, costing nothing."
    }

    Column {
        SectionTitle("Memory")
        Toggle("Let Ember use what it remembers", config.memoryEnabled, onChange = { status = settings.setMemoryEnabled(it).message })
        Note("Off means remembered facts are never consulted and cost nothing. They are kept, not deleted.")
        FieldLabel("Things Ember should remember about you between conversations")
        Field(
            input, { input = it }, Modifier.fillMaxWidth(),
            placeholder = "e.g. I'm learning Python, and I prefer short answers",
            maxLength = SettingsModel.MEMORY_MAX_CHARS, readOnly = !config.memoryEnabled, onDone = ::submit,
        )
        Spacer(Modifier.height(8.dp))
        BracketButton("Remember this", enabled = config.memoryEnabled, onClick = ::submit)
        Status(status)

        if (memories.isEmpty()) {
            Lit("Nothing remembered yet.", Emb3rTokens.dim, glows = NO_GLOW)
        }
        val rule = accent.copy(alpha = 0.14f)
        for (m in memories) {
            // .memoryRow: the text wraps rather than being clipped - a memory you
            // cannot read in full is one you cannot decide whether to keep
            Row(
                Modifier.fillMaxWidth()
                    .drawBehind { drawRect(rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
                    .padding(vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Lit(m.text, accent, Modifier.weight(1f), size = 15.sp)
                RowButton("✕", onClick = { status = settings.deleteMemory(m.id).message })
            }
        }
        Note(budget)
        Note(
            "These are stored on this phone, in the same file as the rest of your settings, and belong to the " +
                "profile you are using. They are never sent anywhere - this app cannot reach the network.",
        )
    }
}

// ---------------------------------------------------------------- Hardware

@Composable
fun HardwareSection() {
    val context = LocalContext.current
    var result by remember { mutableStateOf("") }
    Column {
        SectionTitle("Hardware")
        BracketButton("Scan Hardware", onClick = {
            result = "scanning..."
            result = runCatching { Hardware.scan(context).report() }.getOrElse { "scan failed: ${it.message ?: it}" }
        })
        if (result.isNotEmpty()) {
            // #hardwareResult { font-size: 16px; white-space: pre-wrap; margin-top: 6px }
            Lit(result, LocalAccent.current, Modifier.padding(top = 6.dp), size = 16.sp)
        }
    }
}

// ---------------------------------------------------------------- Display

@Composable
fun DisplaySection(settings: SettingsModel, engine: Engine, speech: SpeechControls) {
    val accent = LocalAccent.current
    val config by settings.config.collectAsState()
    val bg = Ink.bg
    val scope = rememberCoroutineScope()

    // the wheel's own position, kept while the page is open; the stored accent is what the app uses
    var hue by remember { mutableFloatStateOf(config.accent?.h ?: Palettes.DEFAULT_HUE) }
    var sat by remember { mutableFloatStateOf(config.accent?.s ?: Palettes.DEFAULT_SAT) }
    var light by remember { mutableFloatStateOf(config.accent?.l ?: Palettes.DEFAULT_LIGHTNESS) }
    var hex by remember { mutableStateOf("") }
    var hexStatus by remember { mutableStateOf("") }
    var hexBad by remember { mutableStateOf(false) }
    var voiceStatus by remember { mutableStateOf("") }

    fun apply() = settings.setAccent(Accent(hue, sat, light))

    Column {
        SectionTitle("Display")

        FieldLabel("Accent Color")
        ColorWheel(onPick = { h, s -> hue = h; sat = s; apply() }, Modifier.padding(bottom = 8.dp))
        RangeSlider(light, 20f..80f, onChange = { light = it.roundToInt().toFloat(); apply() })

        FieldLabel("Or type a hex code")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field(hex, { hex = it.uppercase() }, Modifier.width(96.dp), placeholder = "#7CFF9E", maxLength = 7, onDone = {
                applyHex(hex, bg, settings) { msg, bad, h, s, l -> hexStatus = msg; hexBad = bad; if (!bad) { hue = h; sat = s; light = l } }
            })
            BracketButton("Use this colour", size = 16.sp, onClick = {
                applyHex(hex, bg, settings) { msg, bad, h, s, l -> hexStatus = msg; hexBad = bad; if (!bad) { hue = h; sat = s; light = l } }
            })
        }
        Row(Modifier.padding(top = 8.dp)) {
            // the easiest of the three to wreck, and the one that had no way back
            BracketButton("Reset to default", size = 16.sp, onClick = {
                settings.setAccent(null)
                hue = Palettes.DEFAULT_HUE; sat = Palettes.DEFAULT_SAT; light = Palettes.DEFAULT_LIGHTNESS
                hexStatus = "Back to the colour it ships with."; hexBad = false
            })
        }
        Status(hexStatus, bad = hexBad)

        FieldLabel("Theme")
        ThemeSelect(config.theme) { settings.setTheme(it) }

        FieldLabel("Font Size")
        RangeSlider(config.fontSize.toFloat(), Config.FONT_SIZES.first.toFloat()..Config.FONT_SIZES.last.toFloat(),
            onChange = { settings.setFontSize(it.roundToInt()) }, steps = Config.FONT_SIZES.last - Config.FONT_SIZES.first - 1)

        FieldLabel("Phosphor Glow")
        RangeSlider(config.glow.toFloat(), Config.GLOWS.first.toFloat()..Config.GLOWS.last.toFloat(),
            onChange = { settings.setGlow(it.roundToInt()) }, steps = Config.GLOWS.last - Config.GLOWS.first - 1)

        Spacer(Modifier.height(8.dp))
        Toggle("Sound effects", config.sounds, onChange = { settings.setSounds(it) })
        Toggle("Reactions — sparkles, hearts and transitions", config.reactions, onChange = { settings.setReactions(it) })
        Toggle("Read replies aloud in the terminal", config.voice, onChange = {
            settings.setVoice(it)
            // turning it off is a request for silence now, not from the next reply
            if (!it) speech.stop()
        })

        // folded away until the toggle is on - four controls for a feature nobody
        // has switched on are four controls of noise
        if (config.voice) {
            val hover = Ink.hover
            Column(
                Modifier.padding(top = 8.dp)
                    .drawBehind { drawRect(hover, Offset.Zero, Size(1.dp.toPx(), size.height)) }
                    .padding(start = 14.dp),
            ) {
                val installed = engine.paths.kokoroDir != null
                Lit(
                    if (installed) "Ember's voice is on this phone." else "Ember's voice isn't on this phone yet - bring the kokoro folder in under Models.",
                    accent, Modifier.alpha(0.85f), size = 13.sp,
                )
                FieldLabel("Speed — ${"%.2f".format(config.voiceSpeed)}×")
                RangeSlider(config.voiceSpeed, Config.VOICE_SPEEDS, onChange = {
                    // the slider's own steps are 0.05, as the desktop's are
                    settings.setVoiceSpeed((it * 20).roundToInt() / 20f)
                }, steps = 11)
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BracketButton("Hear it", modifier = Modifier.weight(1f), enabled = installed, onClick = {
                        voiceStatus = "speaking..."
                        scope.launch { voiceStatus = speech.preview() ?: "" }
                    })
                    BracketButton("Stop", modifier = Modifier.weight(1f), onClick = { speech.stop(); voiceStatus = "" })
                }
                Status(voiceStatus)
                Note("This is about the terminal only. Talk always speaks — it is the whole point of that view — and it does not need this switched on.")
                Note(
                    "Ember's voice is a speech model that runs on this phone, imported with the others - there is nothing " +
                        "to sign up for. Nothing you hear was made anywhere else, and nothing said to you is sent anywhere. You can " +
                        "speak to her in either place: hold [o] beside the message box, or the button in Talk.",
                )
            }
        }
    }
}

/**
 * applyHex(): a typed colour becomes a point on the wheel and goes through the
 * same readability clamp as any other pick - and if the clamp moved it, the
 * page says so rather than pretending it did not.
 */
private fun applyHex(
    raw: String,
    bg: androidx.compose.ui.graphics.Color,
    settings: SettingsModel,
    report: (message: String, bad: Boolean, h: Float, s: Float, l: Float) -> Unit,
) {
    var v = raw.trim().removePrefix("#")
    // #abc is a legal shorthand people type by hand
    if (Regex("^[0-9a-fA-F]{3}$").matches(v)) v = v.map { "$it$it" }.joinToString("")
    if (!Regex("^[0-9a-fA-F]{6}$").matches(v)) { report("Six hex digits, like #7CFF9E.", true, 0f, 0f, 0f); return }
    val n = v.toInt(16)
    val (h, s, l) = Palettes.rgbToHsl((n shr 16) and 255, (n shr 8) and 255, n and 255)
    val sliderL = l.coerceIn(20f, 80f).roundToInt().toFloat()
    settings.setAccent(Accent(h, s, sliderL))
    // compared against what was typed, not against the slider - comparing the
    // slider once reported #050505 as applied unchanged after it had been lifted
    val applied = Palettes.legibleLightness(h, s, sliderL, Palettes.relativeLuminance(bg.rgb()))
    val shown = Palettes.describe(h, s, applied)
    val asked = l.roundToInt()
    val moved = kotlin.math.abs(applied - asked) > 1.5f
    report(
        if (moved) "Using $shown — ${if (applied > asked) "lightened" else "darkened"} from #${v.uppercase()} to stay readable on this theme."
        else "Using $shown.",
        false, h, s, sliderL,
    )
}

/** #themeSelect: a select with the page's border, opening to Dark and Light. */
@Composable
private fun ThemeSelect(current: ThemeName, onPick: (ThemeName) -> Unit) {
    val accent = LocalAccent.current
    var open by remember { mutableStateOf(false) }
    Box {
        Box(
            Modifier.fillMaxWidth()
                .drawBehind {
                    val w = 1.dp.toPx()
                    drawRect(accent, Offset.Zero, Size(size.width, w)); drawRect(accent, Offset(0f, size.height - w), Size(size.width, w))
                    drawRect(accent, Offset.Zero, Size(w, size.height)); drawRect(accent, Offset(size.width - w, 0f), Size(w, size.height))
                }
                .clickable { open = true }
                .padding(8.dp),
        ) {
            Lit((if (current == ThemeName.DARK) "Dark" else "Light") + "  ▾", accent)
        }
        DropdownMenu(open, onDismissRequest = { open = false }) {
            for (t in ThemeName.entries) {
                DropdownMenuItem(
                    text = { Lit(if (t == ThemeName.DARK) "Dark" else "Light", accent) },
                    onClick = { onPick(t); open = false },
                )
            }
        }
    }
}
