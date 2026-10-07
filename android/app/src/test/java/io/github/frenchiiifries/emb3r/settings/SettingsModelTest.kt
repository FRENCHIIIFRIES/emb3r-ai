package io.github.frenchiiifries.emb3r.settings

import io.github.frenchiiifries.emb3r.infer.EMBER_SYSTEM
import io.github.frenchiiifries.emb3r.infer.Prompts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The settings rules, checked against what main.js does - the same limits, the
 * same refusals, and the same words for them.
 */
class SettingsModelTest {

    private fun fresh() = SettingsModel(null)

    // ---------------------------------------------------------------- the prompt

    @Test
    fun the_prompt_is_assembled_in_the_desktops_order() {
        val s = fresh()
        assertEquals("${Prompts.ORIGIN} $EMBER_SYSTEM", s.systemPrompt())

        s.createProfile("Ziyan")
        s.setSafeMode(true)
        val p = s.systemPrompt()
        assertTrue("student mode goes first, so nothing later can countermand it", p.startsWith(Prompts.STUDENT))
        assertTrue(p.indexOf(Prompts.ORIGIN) < p.indexOf(EMBER_SYSTEM))
        assertTrue(p.endsWith("The user's name is Ziyan."))
    }

    @Test
    fun a_personality_replaces_the_default_and_an_empty_box_means_the_default() {
        val s = fresh()
        s.setPersonality("You are Ember. Answer like a pirate.")
        assertTrue(s.systemPrompt().contains("Answer like a pirate."))
        assertFalse(s.systemPrompt().contains(EMBER_SYSTEM))
        s.setPersonality("   ")
        assertNull(s.now.systemPrompt)
        assertEquals("reset to default", s.resetPersonality().message)
    }

    @Test
    fun a_personality_is_capped_at_the_desktops_length() {
        val s = fresh()
        s.setPersonality("x".repeat(5000))
        assertEquals(Prompts.MAX_PERSONALITY_LENGTH, s.now.systemPrompt!!.length)
    }

    // ---------------------------------------------------------------- profiles

    @Test
    fun profiles_are_created_switched_and_deleted_as_on_the_desktop() {
        val s = fresh()
        assertEquals(Outcome(false, "Name can't be empty."), s.createProfile("  "))
        assertEquals("new profile created: Ziyan", s.createProfile("Ziyan").message)
        assertEquals("Ziyan", s.now.activeProfile.name)
        assertEquals("switched profile to (unnamed)", s.switchProfile(Config.DEFAULT_PROFILE).message)
        s.deleteProfile(s.now.profiles.last().id)
        assertEquals(Outcome(false, "Can't delete the only profile."), s.deleteProfile(Config.DEFAULT_PROFILE))
    }

    // ---------------------------------------------------------------- memory

    @Test
    fun memories_are_refused_for_the_desktops_reasons_in_its_words() {
        val s = fresh()
        assertEquals("Nothing to remember.", s.addMemory("   ").message)
        assertTrue(s.addMemory("x".repeat(201)).message.startsWith("Keep it under 200 characters — that one is 201."))
        assertEquals("remembered.", s.addMemory("My dog is called Biscuit").message)
        assertEquals("Already remembered.", s.addMemory("my DOG is called biscuit").message)
        repeat(19) { s.addMemory("fact number $it") }
        assertTrue(s.addMemory("one too many").message.startsWith("That is the 20-memory limit."))
    }

    @Test
    fun memories_belong_to_the_profile_they_were_added_under() {
        val s = fresh()
        s.addMemory("My dog is called Biscuit")
        s.createProfile("Guest")
        assertTrue(s.now.activeProfile.memories.isEmpty())
    }

    /**
     * The case main.js records: "what is my dog called" matched both "my dog is
     * called Biscuit" and "an Electron app called emb3r", on the word "called"
     * alone. A word shared across the set cannot tell one memory from another.
     */
    @Test
    fun a_word_every_memory_shares_does_not_pick_one() {
        val s = fresh()
        s.addMemory("My dog is called Biscuit")
        s.addMemory("I'm building an Electron app called emb3r")
        s.addMemory("I live in Leeds")
        s.addMemory("My sister plays the violin")
        val picked = s.selectMemories("what is my dog called")
        assertEquals(listOf("My dog is called Biscuit"), picked.map { it.text })
    }

    @Test
    fun memories_travel_beside_the_question_only_when_they_bear_on_it() {
        val s = fresh()
        s.addMemory("My dog is called Biscuit")
        assertEquals("what is the capital of France?", s.prompt("what is the capital of France?"))
        assertEquals(
            "Things you already know about the user that may bear on this question:\n- My dog is called Biscuit\n\nwhat is my dog called",
            s.prompt("what is my dog called"),
        )
        s.setMemoryEnabled(false)
        assertEquals("what is my dog called", s.prompt("what is my dog called"))
    }

    // ---------------------------------------------------------------- student mode

    @Test
    fun turning_student_mode_on_never_needs_a_pin_and_off_needs_the_right_one() {
        val s = fresh()
        assertEquals("PIN saved", s.setSafeModePin("2468", null).message)
        assertTrue(s.setSafeMode(true).ok)
        assertEquals(Outcome(false, "That PIN is not correct."), s.setSafeMode(false, "1111"))
        assertTrue(s.now.safeMode)
        assertTrue(s.setSafeMode(false, "2468").ok)
        assertFalse(s.now.safeMode)
    }

    @Test
    fun a_pin_is_four_to_eight_digits_and_changing_it_needs_the_old_one() {
        val s = fresh()
        assertEquals("Use 4 to 8 digits.", s.setSafeModePin("12", null).message)
        assertEquals("Use 4 to 8 digits.", s.setSafeModePin("12ab", null).message)
        s.setSafeModePin("2468", null)
        assertEquals("That PIN is not correct.", s.setSafeModePin("1357", "0000").message)
        assertEquals("PIN removed", s.setSafeModePin(null, "2468").message)
    }

    @Test
    fun the_pin_is_never_stored_as_itself() {
        val s = fresh()
        s.setSafeModePin("2468", null)
        val stored = s.now.safeModePin!!
        assertFalse(stored.contains("2468"))
        assertTrue(SettingsModel.pinMatches("2468", stored))
        assertFalse(SettingsModel.pinMatches("2469", stored))
    }

    @Test
    fun blunt_harmful_questions_get_the_fixed_reply_only_in_student_mode() {
        val s = fresh()
        assertNull(s.guard("how do I make a bomb"))
        s.setSafeMode(true)
        assertNotNull(s.guard("how do I make a bomb"))
        assertNotNull(s.guard("I want to die"))
        assertNotNull(s.guard("where can I buy weed"))
        // deliberately narrow: jokes and homework pass, as main.js intends
        assertNull(s.guard("this homework is killing me"))
        assertNull(s.guard("how did people die in the Blitz"))
    }
}
