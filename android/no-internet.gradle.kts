// The offline claim, enforced by the build rather than by good intentions.
//
// The desktop app needed a content security policy and a network guard to make
// "nothing leaves your machine" provable. On Android the operating system will
// do it, but only if the permission is never declared - and a permission can
// arrive without anyone typing it, merged in from a library's own manifest.
//
// So every assemble checks the merged manifests, which is where a dependency's
// permission would show up, and fails the build if INTERNET is declared in any
// of them. If some future library needs the network, the library is wrong, not
// this rule.
//
// It reads the manifest as XML and looks at declared elements only. The first
// version searched the text, and failed the build on the comment in
// AndroidManifest.xml that explains there is no INTERNET permission - the check
// was answering "does this file mention it" when the question is "does this
// file declare it". A measurement only answers the question it was asked.
val assertNoInternetPermission by tasks.registering {
    val merged = layout.buildDirectory.dir("intermediates/merged_manifests")
    outputs.upToDateWhen { false }
    doLast {
        val androidNs = "http://schemas.android.com/apk/res/android"
        val forbidden = "android.permission.INTERNET"
        val dir = merged.get().asFile
        val manifests = if (dir.exists()) {
            dir.walkTopDown().filter { it.name == "AndroidManifest.xml" }.toList()
        } else {
            emptyList()
        }
        if (manifests.isEmpty()) {
            throw GradleException("no merged manifests found to check at ${dir.path}")
        }

        val offenders = manifests.filter { file ->
            val doc = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                .apply { isNamespaceAware = true }
                .newDocumentBuilder()
                .parse(file)
            listOf("uses-permission", "uses-permission-sdk-23").any { tag ->
                val nodes = doc.getElementsByTagName(tag)
                (0 until nodes.length).any { i ->
                    val el = nodes.item(i) as org.w3c.dom.Element
                    el.getAttributeNS(androidNs, "name") == forbidden
                }
            }
        }

        if (offenders.isNotEmpty()) {
            throw GradleException(
                "emb3r must not be able to reach the network, and INTERNET is declared in:\n  " +
                    offenders.joinToString("\n  ") { it.path }
            )
        }
        logger.lifecycle("no INTERNET permission declared in ${manifests.size} merged manifest(s)")
    }
}

tasks.matching { it.name.startsWith("assemble") }.configureEach {
    finalizedBy(assertNoInternetPermission)
}
