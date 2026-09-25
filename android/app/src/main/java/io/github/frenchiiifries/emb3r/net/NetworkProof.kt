package io.github.frenchiiifries.emb3r.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket

/**
 * The offline claim, demonstrated rather than asserted.
 *
 * This makes a real attempt to reach a real host, and reports exactly what
 * Android did about it. Without the INTERNET permission the process is not
 * allowed a network socket at all, so the attempt fails before a single byte
 * is sent - and that failure, word for word, is the evidence.
 */
object NetworkProof {

    data class Result(val connected: Boolean, val what: String)

    suspend fun attempt(host: String = "example.com", port: Int = 80): Result = withContext(Dispatchers.IO) {
        try {
            Socket().use { s ->
                s.connect(InetSocketAddress(host, port), 5000)
            }
            // If this line is ever reached, the claim is false, and the screen says so.
            Result(true, "connected to $host - this should not be possible")
        } catch (e: SecurityException) {
            Result(false, "refused by Android: ${e.message ?: "no permission"}")
        } catch (e: Exception) {
            Result(false, "refused: ${e::class.simpleName}: ${e.message ?: "no reason given"}")
        }
    }
}
