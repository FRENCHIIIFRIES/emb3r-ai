package io.github.frenchiiifries.emb3r.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class ConfigStoreTest {

    private fun tempFile() = File(kotlin.io.path.createTempDirectory("emb3r-config").toFile(), "config.json")

    @Test
    fun what_is_saved_comes_back_exactly() {
        val file = tempFile()
        val s = SettingsModel(ConfigStore(file))
        s.createProfile("Ziyan")
        s.addMemory("My dog is called Biscuit")
        s.setPersonality("Answer like a pirate.")
        s.setSafeModePin("2468", null)
        s.setSafeMode(true)
        s.setTheme(ThemeName.LIGHT)
        s.setFontSize(24)
        s.setGlow(9)
        s.setAccent(Accent(28f, 90f, 55f))
        s.setSounds(false)
        s.setReactions(false)
        s.setVoice(true)
        s.setVoiceSpeed(1.15f)
        s.setActiveModel("gemma-4-E2B-it.litertlm")

        assertEquals(s.now, ConfigStore(file).load())
    }

    @Test
    fun a_missing_or_broken_file_starts_with_the_defaults_rather_than_refusing_to_start() {
        assertEquals(Config(), ConfigStore(File("does-not-exist/config.json")).load())
        val broken = tempFile().apply { parentFile!!.mkdirs(); writeText("{ not json") }
        assertEquals(Config(), ConfigStore(broken).load())
    }

    @Test
    fun a_hand_edited_number_is_brought_back_inside_the_sliders_range() {
        val file = tempFile().apply { parentFile!!.mkdirs(); writeText("""{"fontSize": 400, "glow": -3, "voiceSpeed": 9}""") }
        val c = ConfigStore(file).load()
        assertEquals(28, c.fontSize)
        assertEquals(0, c.glow)
        assertEquals(1.3f, c.voiceSpeed, 0f)
    }

    @Test
    fun null_personality_is_kept_apart_from_an_empty_one() {
        val c = ConfigStore.fromJson(ConfigStore.toJson(Config(systemPrompt = null)))
        assertNull(c.systemPrompt)
        assertEquals("", ConfigStore.fromJson(ConfigStore.toJson(Config(systemPrompt = ""))).systemPrompt)
    }
}
