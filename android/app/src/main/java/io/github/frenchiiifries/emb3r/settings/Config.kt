package io.github.frenchiiifries.emb3r.settings

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Something Ember should remember about the person, as main.js stores it. */
data class Memory(val id: String, val text: String, val created: String)

/** A person using the phone. Memories are kept per profile, as on the desktop. */
data class Profile(val id: String, val name: String, val memories: List<Memory> = emptyList())

/** The accent as the desktop's colour wheel stores it: hue and saturation from the wheel, lightness from the slider. */
data class Accent(val h: Float, val s: Float, val l: Float)

enum class ThemeName { DARK, LIGHT }

/**
 * Everything Settings can change. The first half mirrors defaultConfig() in
 * main.js, key for key; the second half is what the desktop keeps in
 * localStorage beside it - look and sound, which are about this device rather
 * than about the person.
 *
 * What is missing is missing on purpose. The Gemini key, the other provider,
 * Spotify and the update check all need the network, and this app does not
 * have the permission to reach it.
 */
data class Config(
    val profiles: List<Profile> = listOf(Profile(DEFAULT_PROFILE, "")),
    val activeProfileId: String = DEFAULT_PROFILE,
    /** null means "use the default personality", kept apart from "" as main.js keeps it */
    val systemPrompt: String? = null,
    val memoryEnabled: Boolean = true,
    val safeMode: Boolean = false,
    /** "salt:key" - a derived key, never the PIN */
    val safeModePin: String? = null,
    /** the answering model's file name; null means the first one found */
    val activeModel: String? = null,

    val theme: ThemeName = ThemeName.DARK,
    val fontSize: Int = DEFAULT_FONT_SIZE,
    val glow: Int = DEFAULT_GLOW,
    /** null means emb3r's own colour, which is not the same as picking it on the wheel */
    val accent: Accent? = null,
    val sounds: Boolean = true,
    val reactions: Boolean = true,
    /** off until asked for: a phone that starts talking unasked is startling */
    val voice: Boolean = false,
    val voiceSpeed: Float = 1f,
) {
    val activeProfile: Profile get() = profiles.firstOrNull { it.id == activeProfileId } ?: profiles.first()

    companion object {
        const val DEFAULT_PROFILE = "default"
        // the sliders' ranges and starting points, from the desktop's markup
        const val DEFAULT_FONT_SIZE = 20
        val FONT_SIZES = 12..28
        const val DEFAULT_GLOW = 6
        val GLOWS = 0..20
        val VOICE_SPEEDS = 0.7f..1.3f
    }
}

/**
 * Reads and writes the config as one JSON file in the app's own storage - the
 * desktop's config.json, in the one place on the phone only this app can read.
 * A file that cannot be read is not fatal: the app starts with the defaults
 * rather than refusing to start.
 */
class ConfigStore(private val file: File) {

    fun load(): Config = runCatching { if (file.exists()) fromJson(JSONObject(file.readText())) else Config() }
        .getOrElse { Config() }

    fun save(config: Config) {
        file.parentFile?.mkdirs()
        // written beside and then renamed over, so a crash mid-write cannot leave half a file
        val next = File(file.path + ".new")
        next.writeText(toJson(config).toString(2))
        if (!next.renameTo(file)) {
            file.delete()
            next.renameTo(file)
        }
    }

    companion object {
        fun toJson(c: Config): JSONObject = JSONObject().apply {
            put("profiles", JSONArray().apply {
                c.profiles.forEach { p ->
                    put(JSONObject().apply {
                        put("id", p.id)
                        put("name", p.name)
                        put("memories", JSONArray().apply {
                            p.memories.forEach { m ->
                                put(JSONObject().put("id", m.id).put("text", m.text).put("created", m.created))
                            }
                        })
                    })
                }
            })
            put("activeProfileId", c.activeProfileId)
            put("systemPrompt", c.systemPrompt ?: JSONObject.NULL)
            put("memoryEnabled", c.memoryEnabled)
            put("safeMode", c.safeMode)
            put("safeModePin", c.safeModePin ?: JSONObject.NULL)
            put("activeModel", c.activeModel ?: JSONObject.NULL)
            put("theme", c.theme.name.lowercase())
            put("fontSize", c.fontSize)
            put("glow", c.glow)
            put("accent", c.accent?.let { JSONObject().put("h", it.h.toDouble()).put("s", it.s.toDouble()).put("l", it.l.toDouble()) } ?: JSONObject.NULL)
            put("sounds", c.sounds)
            put("reactions", c.reactions)
            put("voice", c.voice)
            put("voiceSpeed", c.voiceSpeed.toDouble())
        }

        fun fromJson(o: JSONObject): Config {
            val d = Config()
            val profiles = o.optJSONArray("profiles")?.let { arr ->
                (0 until arr.length()).mapNotNull { i ->
                    val p = arr.optJSONObject(i) ?: return@mapNotNull null
                    val memories = p.optJSONArray("memories")?.let { ms ->
                        (0 until ms.length()).mapNotNull { j ->
                            val m = ms.optJSONObject(j) ?: return@mapNotNull null
                            Memory(m.optString("id"), m.optString("text"), m.optString("created"))
                        }
                    } ?: emptyList()
                    Profile(p.optString("id"), p.optString("name"), memories)
                }
            }?.filter { it.id.isNotEmpty() }?.takeIf { it.isNotEmpty() } ?: d.profiles
            // isNull is true for a missing key as well as a null one: both mean "not set"
            fun str(key: String): String? = if (o.isNull(key)) null else o.optString(key)
            return Config(
                profiles = profiles,
                activeProfileId = o.optString("activeProfileId", d.activeProfileId)
                    .takeIf { id -> profiles.any { it.id == id } } ?: profiles.first().id,
                systemPrompt = str("systemPrompt"),
                memoryEnabled = o.optBoolean("memoryEnabled", d.memoryEnabled),
                safeMode = o.optBoolean("safeMode", d.safeMode),
                safeModePin = str("safeModePin"),
                activeModel = str("activeModel"),
                theme = if (o.optString("theme") == "light") ThemeName.LIGHT else ThemeName.DARK,
                // a stored number from an older build, or a hand-edited one, is
                // brought back inside the range the slider can show
                fontSize = o.optInt("fontSize", d.fontSize).coerceIn(Config.FONT_SIZES),
                glow = o.optInt("glow", d.glow).coerceIn(Config.GLOWS),
                accent = o.optJSONObject("accent")?.let {
                    Accent(it.optDouble("h", 140.0).toFloat(), it.optDouble("s", 80.0).toFloat(), it.optDouble("l", 55.0).toFloat())
                },
                sounds = o.optBoolean("sounds", d.sounds),
                reactions = o.optBoolean("reactions", d.reactions),
                voice = o.optBoolean("voice", d.voice),
                voiceSpeed = o.optDouble("voiceSpeed", d.voiceSpeed.toDouble()).toFloat()
                    .coerceIn(Config.VOICE_SPEEDS.start, Config.VOICE_SPEEDS.endInclusive),
            )
        }
    }
}
