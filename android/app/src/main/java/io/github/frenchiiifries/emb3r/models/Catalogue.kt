package io.github.frenchiiifries.emb3r.models

/**
 * The answering models this app knows by name, in the shape of MODEL_CATALOG
 * in main.js: a name, what it is good for and where it falls short - shown
 * verbatim, because a file name and a size do not tell anyone which to choose.
 *
 * The rule is the desktop's: nothing is listed until it has been asked three
 * ordinary questions on the device it will run on. Every number below was
 * measured on a Nothing Phone (3a), Snapdragon 7s Gen 3, 8 GB, on 26 September
 * 2026, twice - the second time with the library's cache already built. The
 * full record is phone-candidates-2026-09-26.log in the evidence folder.
 *
 * Qwen3.5 0.8B was tested and left out. The first time, it answered all three
 * questions well. The second time, asked "who made you?", it repeated one
 * sentence for eight minutes and 16,078 characters. A model that does that one
 * time in two is not one to hand anybody - the same lesson as step 38, where
 * the newest model loaded perfectly and said nothing.
 *
 * A model file that is not in this list still works if the library can read
 * it; it is shown by its file name, without claims nobody has checked.
 */
data class Listed(
    /** the exact name the file is published under */
    val file: String,
    val name: String,
    val strength: String,
    val limit: String,
    /** the phone memory it wants, for Hardware's recommendation */
    val minRamGB: Int,
    /** where the file comes from - the phone cannot fetch it, so the person has to */
    val source: String,
)

object Catalogue {
    val models = listOf(
        Listed(
            file = "gemma-4-E2B-it.litertlm",
            name = "Gemma 4 E2B",
            strength = "Google's newest small model, and the best of the three on this phone: once loaded it " +
                "answered \"what is the capital of France?\" in 2.7 seconds, and after the first time it loads in about one.",
            limit = "The largest file here at 2.6 GB, and it wants about 2 GB of memory while it answers - " +
                "a phone with 6 GB or more, not 4.",
            // phones report less than the number on the box: this "8 GB" one reports 7.25
            minRamGB = 5,
            source = "huggingface.co/litert-community/gemma-4-E2B-it-litert-lm",
        ),
        Listed(
            file = "LFM2.5-1.2B-Instruct_int4.litertlm",
            name = "LFM2.5 1.2B Instruct",
            strength = "Built by Liquid AI for phones and updated this month. Under a third of Gemma's size, " +
                "and it answered all three questions on both runs.",
            limit = "Chattier than Gemma - 103 characters where Gemma used 31 - and about two seconds before " +
                "the first word. Its licence is Liquid's own, free for personal use, not the Apache licence the others carry.",
            minRamGB = 3,
            source = "huggingface.co/litert-community/LFM2.5-1.2B-Instruct",
        ),
        Listed(
            file = "qwen2.5-0.5b-instruct-q8.task",
            name = "Qwen2.5 0.5B Instruct",
            strength = "The smallest - half a gigabyte - and the desktop's choice for machines with nothing to spare. " +
                "Loads in a second and a half.",
            limit = "Follows its instructions loosely: it rarely says her name, and slang loses it. " +
                "It runs on the older library, the only one that can read this file.",
            minRamGB = 2,
            source = "huggingface.co/litert-community/Qwen2.5-0.5B-Instruct",
        ),
    )

    fun find(file: String): Listed? = models.firstOrNull { it.file.equals(file, ignoreCase = true) }

    /** The name shown under each reply, as the desktop names the model that wrote it. */
    fun nameFor(file: String): String = find(file)?.name
        ?: file.substringBeforeLast(".")

    /** recommendModel(): the most capable listed model this phone has the memory for. */
    fun recommendFor(totalRamGB: Double): Listed? = models.firstOrNull { totalRamGB >= it.minRamGB }

    /** Files the answering libraries can read. */
    fun isAnsweringModel(name: String) = name.endsWith(".litertlm") || name.endsWith(".task")
}
