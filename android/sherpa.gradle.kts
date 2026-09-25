// sherpa-onnx ships its Android build as a GitHub release asset, not as a Maven
// artifact - a search result said otherwise and the dependency resolver settled
// it, which is the cheaper way round to find that out.
//
// So the AAR is fetched here and checked against a pinned SHA-256 before the
// build is allowed to use it. Fifty megabytes does not belong in the repository,
// and a binary nobody verified does not belong in the app.
val sherpaVersion = "1.13.8"
val sherpaSha256 = "633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96"
val sherpaAar = layout.projectDirectory.file("libs/sherpa-onnx-$sherpaVersion.aar").asFile

val fetchSherpaOnnx by tasks.registering {
    description = "Downloads the sherpa-onnx Android AAR and verifies its checksum"
    outputs.file(sherpaAar)
    doLast {
        fun digest(file: File): String {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    md.update(buffer, 0, read)
                }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        }

        if (!sherpaAar.exists()) {
            val url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/" +
                "v$sherpaVersion/sherpa-onnx-$sherpaVersion.aar"
            logger.lifecycle("fetching sherpa-onnx $sherpaVersion")
            sherpaAar.parentFile.mkdirs()
            java.net.URI(url).toURL().openStream().use { input ->
                sherpaAar.outputStream().use { output -> input.copyTo(output) }
            }
        }

        val actual = digest(sherpaAar)
        if (actual != sherpaSha256) {
            sherpaAar.delete()
            throw GradleException(
                "sherpa-onnx $sherpaVersion did not match its checksum and was discarded.\n" +
                    "  expected $sherpaSha256\n  got      $actual"
            )
        }
        logger.lifecycle("sherpa-onnx $sherpaVersion matches its checksum")
    }
}

tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(fetchSherpaOnnx) }
