package io.github.frenchiiifries.emb3r.settings

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import io.github.frenchiiifries.emb3r.models.Catalogue

/** What emb3r:scan-hardware reports on the desktop, measured on the phone. */
data class HardwareInfo(
    val totalRamGB: Double,
    val freeRamGB: Double,
    val chip: String,
    val cores: Int,
    val platform: String,
) {
    /** The desktop's report, line for line, with the phone's numbers in it. */
    fun report(): String {
        val pick = Catalogue.recommendFor(totalRamGB)
        return "RAM: ${totalRamGB}GB total (${freeRamGB}GB free)\n" +
            "CPU: $chip ($cores cores)\n" +
            "Platform: $platform\n\n" +
            "Recommended model: ${pick?.name ?: "none of the listed ones fit"}\n" +
            "See Models — the model that fits is marked ★ recommended."
    }
}

object Hardware {
    fun scan(context: Context): HardwareInfo {
        val info = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        fun gb(bytes: Long) = Math.round(bytes / 1_073_741_824.0 * 10) / 10.0
        val chip = if (Build.VERSION.SDK_INT >= 31 && Build.SOC_MODEL != Build.UNKNOWN) Build.SOC_MODEL else Build.HARDWARE
        return HardwareInfo(
            totalRamGB = gb(info.totalMem),
            freeRamGB = gb(info.availMem),
            chip = chip,
            cores = Runtime.getRuntime().availableProcessors(),
            platform = "Android ${Build.VERSION.RELEASE} (${Build.MANUFACTURER} ${Build.MODEL})",
        )
    }

    /** Total memory alone, for marking the recommended model without a scan. */
    fun totalRamGB(context: Context): Double {
        val info = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        return info.totalMem / 1_073_741_824.0
    }
}
