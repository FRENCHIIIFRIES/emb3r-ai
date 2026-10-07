package io.github.frenchiiifries.emb3r.settings

import io.github.frenchiiifries.emb3r.infer.Prompts
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** What a setting said back: whether it was applied, and the words to show either way. */
data class Outcome(val ok: Boolean, val message: String = "")

/** What the settings do to a message on its way to the model. Chat and Talk both go through it. */
interface Shaping {
    /** A fixed reply that stands in for the model's, or null to let the model answer. */
    fun guard(message: String): String?
    /** What the model is actually given: the message, with any remembered facts that bear on it. */
    fun prompt(message: String): String
}

/** For the tests and the renders: messages go through untouched. */
object Unshaped : Shaping {
    override fun guard(message: String): String? = null
    override fun prompt(message: String): String = message
}

/**
 * The settings, with the rules the desktop's main process applies to them -
 * the same limits, the same refusals, and the same words for both. Kept out of
 * Compose, so every rule can be tested on this machine without a phone.
 */
class SettingsModel(private val store: ConfigStore?) : Shaping {

    private val _config = MutableStateFlow(store?.load() ?: Config())
    val config: StateFlow<Config> = _config.asStateFlow()
    val now: Config get() = _config.value

    private fun update(change: (Config) -> Config): Config {
        val next = change(_config.value)
        _config.value = next
        store?.save(next)
        return next
    }

    // ------------------------------------------------------------ the prompt

    /** systemPrompt() in main.js. Read at the moment of asking, so a change applies to the very next reply. */
    fun systemPrompt(): String = now.let { Prompts.system(it.systemPrompt, it.activeProfile.name, it.safeMode) }

    // ------------------------------------------------------------ profiles

    fun createProfile(raw: String): Outcome {
        val name = raw.trim().take(Prompts.MAX_PROFILE_NAME_LENGTH)
        if (name.isEmpty()) return Outcome(false, "Name can't be empty.")
        val id = "p_${System.currentTimeMillis()}"
        update { it.copy(profiles = it.profiles + Profile(id, name), activeProfileId = id) }
        return Outcome(true, "new profile created: $name")
    }

    fun switchProfile(id: String): Outcome {
        val p = now.profiles.firstOrNull { it.id == id } ?: return Outcome(false, "Profile not found.")
        update { it.copy(activeProfileId = id) }
        return Outcome(true, "switched profile to ${p.name.ifEmpty { "(unnamed)" }}")
    }

    fun deleteProfile(id: String): Outcome {
        if (now.profiles.size <= 1) return Outcome(false, "Can't delete the only profile.")
        update { c ->
            val left = c.profiles.filter { it.id != id }
            c.copy(profiles = left, activeProfileId = if (c.activeProfileId == id) left.first().id else c.activeProfileId)
        }
        return Outcome(true)
    }

    // ------------------------------------------------------------ personality

    fun setPersonality(text: String): Outcome {
        // an empty box means "use the default", as the desktop's Save treats it -
        // giving Ember no instructions at all is not a choice worth a control
        val t = text.trim()
        update { it.copy(systemPrompt = if (t.isEmpty()) null else t.take(Prompts.MAX_PERSONALITY_LENGTH)) }
        return Outcome(true, "saved")
    }

    fun resetPersonality(): Outcome {
        update { it.copy(systemPrompt = null) }
        return Outcome(true, "reset to default")
    }

    // ------------------------------------------------------------ memory

    fun setMemoryEnabled(on: Boolean): Outcome {
        update { it.copy(memoryEnabled = on) }
        return Outcome(true, if (on) "on — remembered facts will be used where they fit the question."
            else "off — nothing remembered will be consulted.")
    }

    fun addMemory(text: String): Outcome {
        val t = text.trim().replace(Regex("\\s+"), " ")
        if (t.isEmpty()) return Outcome(false, "Nothing to remember.")
        if (t.length > MEMORY_MAX_CHARS) return Outcome(false,
            "Keep it under $MEMORY_MAX_CHARS characters — that one is ${t.length}. " +
                "Memories are re-read on every reply, so a long one costs you the same every time.")
        val items = now.activeProfile.memories
        if (items.size >= MEMORY_MAX_ENTRIES) return Outcome(false,
            "That is the $MEMORY_MAX_ENTRIES-memory limit. Delete one first — they all go into " +
                "every reply, and past this point they crowd out the conversation itself.")
        if (items.any { it.text.equals(t, ignoreCase = true) }) return Outcome(false, "Already remembered.")
        val entry = Memory(
            "m${System.currentTimeMillis()}${(1..4).map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }.joinToString("")}",
            t, Instant.now().toString(),
        )
        setMemories(items + entry)
        return Outcome(true, "remembered.")
    }

    fun deleteMemory(id: String): Outcome {
        val items = now.activeProfile.memories
        val next = items.filter { it.id != id }
        if (next.size == items.size) return Outcome(false, "No such memory.")
        setMemories(next)
        return Outcome(true, "forgotten.")
    }

    private fun setMemories(list: List<Memory>) = update { c ->
        c.copy(profiles = c.profiles.map { if (it.id == c.activeProfile.id) it.copy(memories = list) else it })
    }

    /**
     * selectMemories() in main.js: which remembered facts this question touches.
     * Deliberately dumb - word overlap, no model call - so it cannot become the
     * thing that slows the phone down. A word found across a quarter or more of
     * the memories cannot tell one from another, and does not count.
     */
    fun selectMemories(question: String): List<Memory> {
        if (!now.memoryEnabled) return emptyList()
        val items = now.activeProfile.memories
        if (items.isEmpty()) return emptyList()
        val asked = words(question)
        val perMemory = items.map { words(it.text) }
        val df = HashMap<String, Int>()
        perMemory.forEach { ws -> ws.forEach { df[it] = (df[it] ?: 0) + 1 } }
        val tooCommon = maxOf(1, items.size / 4)
        return items.indices
            .map { i -> items[i] to perMemory[i].count { w -> w !in STOPWORDS && w in asked && (df[w] ?: 0) <= tooCommon } }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(MEMORY_PICK_MAX)
            .map { it.first }
    }

    // ------------------------------------------------------------ student mode

    fun setSafeMode(on: Boolean, pin: String? = null): Outcome {
        if (on == now.safeMode) return Outcome(true)
        // turning it ON is never gated - anyone may make the app safer without a
        // password. Only turning it OFF is, and only if a PIN was set.
        if (!on && now.safeModePin != null && !pinMatches(pin.orEmpty(), now.safeModePin)) {
            return Outcome(false, "That PIN is not correct.")
        }
        update { it.copy(safeMode = on) }
        return Outcome(true)
    }

    fun setSafeModePin(pin: String?, current: String?): Outcome {
        // changing or clearing an existing PIN needs the existing one, or it is not a lock
        if (now.safeModePin != null && !pinMatches(current.orEmpty(), now.safeModePin)) {
            return Outcome(false, "That PIN is not correct.")
        }
        if (pin.isNullOrEmpty()) {
            update { it.copy(safeModePin = null) }
            return Outcome(true, "PIN removed")
        }
        if (!Regex("^\\d{4,8}$").matches(pin)) return Outcome(false, "Use 4 to 8 digits.")
        update { it.copy(safeModePin = hashPin(pin)) }
        return Outcome(true, "PIN saved")
    }

    // ------------------------------------------------------------ Shaping

    override fun guard(message: String): String? {
        if (!now.safeMode) return null
        return SAFE_MODE_BLOCKS.firstOrNull { it.first.containsMatchIn(message) }?.second
    }

    /** Remembered facts travel beside the message rather than inside the personality, as main.js sends them. */
    override fun prompt(message: String): String {
        val picked = selectMemories(message)
        if (picked.isEmpty()) return message
        val lines = picked.joinToString("\n") { "- ${it.text}" }
        return "Things you already know about the user that may bear on this question:\n$lines\n\n$message"
    }

    // ------------------------------------------------------------ the rest

    fun setActiveModel(file: String) = update { it.copy(activeModel = file) }
    fun setTheme(theme: ThemeName) = update { it.copy(theme = theme) }
    fun setFontSize(size: Int) = update { it.copy(fontSize = size.coerceIn(Config.FONT_SIZES)) }
    fun setGlow(n: Int) = update { it.copy(glow = n.coerceIn(Config.GLOWS)) }
    fun setAccent(accent: Accent?) = update { it.copy(accent = accent) }
    fun setSounds(on: Boolean) = update { it.copy(sounds = on) }
    fun setReactions(on: Boolean) = update { it.copy(reactions = on) }
    fun setVoice(on: Boolean) = update { it.copy(voice = on) }
    fun setVoiceSpeed(speed: Float) = update {
        it.copy(voiceSpeed = speed.coerceIn(Config.VOICE_SPEEDS.start, Config.VOICE_SPEEDS.endInclusive))
    }

    companion object {
        // The caps main.js enforces, for its reasons: memories cost context, and
        // an exhausted context does not error - it quietly loses the oldest tokens.
        const val MEMORY_MAX_ENTRIES = 20
        const val MEMORY_MAX_CHARS = 200
        const val MEMORY_PICK_MAX = 5

        private val STOPWORDS = setOf(
            "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
            "these", "those", "is", "are", "was", "were", "be", "been", "am", "i", "im",
            "me", "my", "you", "your", "it", "its", "of", "to", "in", "on", "for", "with",
            "at", "by", "from", "as", "do", "does", "did", "can", "could", "would",
            "should", "will", "what", "when", "where", "who", "how", "why", "not", "no",
            "yes", "so", "up", "out", "about", "into", "over", "again", "just", "some",
        )

        private fun words(s: String): Set<String> =
            Regex("[a-z0-9]{3,}").findAll(s.lowercase()).map { it.value }.toSet()

        /**
         * SAFE_MODE_BLOCKS in main.js: deliberately narrow, covering blunt asks
         * where a wrong answer could do real harm and nothing else, because a
         * broad filter on a school device mostly blocks homework. It catches
         * explicit requests and will miss anything phrased around them.
         */
        val SAFE_MODE_BLOCKS: List<Pair<Regex, String>> = listOf(
            Regex("""\b(kill|hurt|harm|cut|starve)\s+myself\b|\bsuicid|\bself[-\s]?harm\b|\bend (my life|it all)\b|\b(want|going) to die\b|\bwanna die\b|\bdon'?t want to (live|be alive|exist)\b""", RegexOption.IGNORE_CASE) to
                "I'm not the right thing to talk to about this, and I don't want to give you a bad answer on something that matters. Please talk to a teacher, a parent, or another adult you trust today. If you need someone now, your country's crisis line can be reached any time.",
            Regex("""\bhow (do|can|to) i? ?(make|build|construct)\b.*\b(bomb|explosive|napalm|thermite|gun|firearm|silencer|poison|nerve agent)\b""", RegexOption.IGNORE_CASE) to
                "I can't help with that. If it's for a school project on chemistry or history, ask me about the topic itself and I'll help with that instead.",
            Regex("""\b(how (do|to) i? ?(buy|get|make)|where (do|can) i (buy|get))\b.*\b(cocaine|heroin|meth|mdma|weed|cannabis|vape|nicotine|alcohol|fake id)\b""", RegexOption.IGNORE_CASE) to
                "I can't help with that one. If you're researching it for school — the health effects, the law, the history — ask me that and I'll help properly.",
        )

        /**
         * The desktop derives the key with scrypt, which Android does not carry.
         * PBKDF2 is the key derivation the platform does carry, and the point is
         * the same: a 4-digit PIN is never strong, but guessing it should need
         * the app rather than a look inside its config file.
         */
        fun hashPin(pin: String, salt: String = randomHex(16)): String = "$salt:${derive(pin, salt)}"

        fun pinMatches(pin: String, stored: String?): Boolean {
            if (stored.isNullOrEmpty()) return false
            val parts = stored.split(":")
            if (parts.size != 2 || parts[0].isEmpty() || parts[1].isEmpty()) return false
            return MessageDigest.isEqual(derive(pin, parts[0]).toByteArray(), parts[1].toByteArray())
        }

        private fun derive(pin: String, salt: String): String {
            val spec = PBEKeySpec(pin.toCharArray(), salt.toByteArray(), 120_000, 256)
            val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
            return key.joinToString("") { "%02x".format(it) }
        }

        private fun randomHex(bytes: Int): String =
            ByteArray(bytes).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    }
}
