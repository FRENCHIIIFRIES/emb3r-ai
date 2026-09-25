package io.github.frenchiiifries.emb3r.ui

/**
 * Ember's faces, copied character for character from FACES in src/renderer.js.
 *
 * They are not decoration: each one is wired to a state the app can actually be
 * in. A face with no trigger is a string nobody ever sees, so none are invented
 * here either.
 *
 * Three of them - [music1], [music2] and [delighted] - use characters that exist
 * in neither JetBrains Mono nor VT323. On the desktop the browser quietly
 * substitutes another typeface; here that would mean a face in the wrong font at
 * the wrong width, which is the mistake step 35 recorded when a fallback came
 * back 33% wider than an ASCII row. They are kept for fidelity with the desktop
 * and deliberately not mapped to any state on the phone. Checked, not assumed:
 * FacesTest asserts every face a state can reach is drawable in both fonts.
 */
object Faces {
    const val idle = "( ^_^ )"
    const val think1 = "( o_o )"
    const val think2 = "( -_- )"
    const val happy = "( ^o^ )"
    const val sad = "( ;_; )"
    const val sleeping = "( u_u ) zZz"
    const val error = "( x_x )"

    /** Spotify only, and not drawable in the bundled fonts. */
    const val music1 = "( ᵔ◡ᵔ )♪"
    const val music2 = "( ᵔ◡ᵔ )♫"

    const val wink = "( ^_~ )"
    const val surprised = "( o_O )"
    const val search1 = "( >_> )"
    const val search2 = "( <_< )"

    /** Mood at full, and not drawable in the bundled fonts. */
    const val delighted = "( ♥‿♥ )"

    const val dizzy = "( @_@ )"

    // The voice states. Talk is a view built for not reading the screen, so the
    // face does the work a status line would.
    const val listening = "( O_O )"
    const val hearing = "( ·_· )?"
    const val puzzled = "( ?_? )"
    const val talking = "( ^o^ )"
    const val deaf = "( ×_· )"
    const val offline = "( ·_· )"

    /** Faces the bundled fonts cannot draw, so no state maps to them. */
    val notDrawable = listOf(music1, music2, delighted)

    fun forState(state: FaceState): String = when (state) {
        FaceState.IDLE -> idle
        FaceState.THINK -> think1
        FaceState.THINK_ALT -> think2
        FaceState.HAPPY -> happy
        FaceState.SAD -> sad
        FaceState.SLEEPING -> sleeping
        FaceState.ERROR -> error
        FaceState.WINK -> wink
        FaceState.SURPRISED -> surprised
        FaceState.READING -> search1
        FaceState.READING_ALT -> search2
        FaceState.DIZZY -> dizzy
        FaceState.LISTENING -> listening
        FaceState.HEARING -> hearing
        FaceState.PUZZLED -> puzzled
        FaceState.TALKING -> talking
        FaceState.DEAF -> deaf
        FaceState.OFFLINE -> offline
    }
}

enum class FaceState {
    IDLE, THINK, THINK_ALT, HAPPY, SAD, SLEEPING, ERROR, WINK, SURPRISED,
    READING, READING_ALT, DIZZY,
    LISTENING, HEARING, PUZZLED, TALKING, DEAF, OFFLINE,
}
