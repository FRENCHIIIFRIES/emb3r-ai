package io.github.frenchiiifries.emb3r.ui

import io.github.frenchiiifries.emb3r.infer.LiteRtAnswerer
import io.github.frenchiiifries.emb3r.models.Catalogue
import io.github.frenchiiifries.emb3r.ui.settings.Section
import io.github.frenchiiifries.emb3r.ui.settings.needsNetwork
import io.github.frenchiiifries.emb3r.ui.settings.offeredSections
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** The smaller behaviours that came over with Settings: search, the catalogue, sounds, the heart. */
class SettingsBehaviourTest {

    @Test
    fun student_mode_is_tucked_away_until_searched_for_or_switched_on() {
        assertFalse(Section.STUDENT in offeredSections("", studentOn = false))
        assertTrue(Section.STUDENT in offeredSections("", studentOn = true))
        assertEquals(listOf(Section.STUDENT), offeredSections("pin", studentOn = false))
    }

    @Test
    fun a_search_narrowed_to_one_section_finds_it_by_the_words_people_use() {
        assertEquals(listOf(Section.DISPLAY), offeredSections("glow", false))
        assertEquals(listOf(Section.HARDWARE), offeredSections("ram", false))
        assertEquals(listOf(Section.MODELS), offeredSections("gemma", false))
    }

    @Test
    fun a_search_for_something_that_needs_the_network_is_told_why_it_is_missing() {
        assertTrue(offeredSections("spotify", false).isEmpty())
        assertTrue(needsNetwork("spotify"))
        assertTrue(needsNetwork("gemini"))
        assertTrue(needsNetwork("update"))
        assertFalse(needsNetwork("zebra"))
    }

    @Test
    fun the_recommendation_follows_the_memory_phones_actually_report() {
        // this "8 GB" phone reports 7.25; a "6 GB" one about 5.5; a "4 GB" one about 3.6
        assertEquals("Gemma 4 E2B", Catalogue.recommendFor(7.25)?.name)
        assertEquals("Gemma 4 E2B", Catalogue.recommendFor(5.5)?.name)
        assertEquals("LFM2.5 1.2B Instruct", Catalogue.recommendFor(3.6)?.name)
        assertNull(Catalogue.recommendFor(1.5))
    }

    @Test
    fun only_models_that_passed_on_the_phone_are_listed() {
        val listed = Catalogue.models.map { it.file }
        assertTrue("gemma-4-E2B-it.litertlm" in listed)
        assertFalse("Qwen3.5-0.8B_int8.litertlm" in listed)
        assertEquals("gemma-4-E2B-it", Catalogue.nameFor("gemma-4-E2B-it") )
        assertEquals("some-other-model", Catalogue.nameFor("some-other-model.litertlm"))
    }

    @Test
    fun the_window_is_what_each_file_allows() {
        assertEquals(1280, LiteRtAnswerer.contextFor("qwen2.5-0.5b-instruct-q8.task"))
        assertEquals(4096, LiteRtAnswerer.contextFor("gemma-4-E2B-it.litertlm"))
    }

    @Test
    fun a_beep_is_as_long_as_asked_and_fades_to_nothing() {
        val t = Sounds.tone(660.0, 0.08, Sounds.Wave.SQUARE, 0.05)
        assertEquals((0.08 * Sounds.RATE).toInt(), t.size)
        val peak = t.maxOf { abs(it) }
        assertTrue("never louder than the volume asked for: $peak", peak <= 0.05f + 1e-4f)
        assertTrue("fades out: ${t.last()}", abs(t.last()) < 0.001f)
    }

    @Test
    fun the_heart_is_for_warm_moments_not_every_reply() {
        assertTrue(Warmth.deservesHeart("thanks!", "The capital of France is Paris."))
        assertTrue(Warmth.deservesHeart("what is 2+2", "Happy to help - it's 4."))
        assertFalse(Warmth.deservesHeart("what is 2+2", "It's 4."))
    }
}
