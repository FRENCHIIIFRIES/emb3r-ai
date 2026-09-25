plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    // renders the screens on this machine, to check them against the desktop before a phone is attached
    id("app.cash.paparazzi") version "1.3.5" apply false
}
