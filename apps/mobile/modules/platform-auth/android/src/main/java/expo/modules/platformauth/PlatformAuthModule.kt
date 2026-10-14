package expo.modules.platformauth

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Play Games for Word Poker. Until STO-592 adds the PGS bridge, Android reports `unavailable` and
 * the app offers guest play and email sign-in, as it does today.
 */
class PlatformAuthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlatformAuth")

    Events("onAuthStateChange")

    AsyncFunction("getState") {
      mapOf("provider" to null, "status" to "unavailable")
    }

    AsyncFunction("authenticate") { promise: Promise ->
      promise.reject("UNAVAILABLE", "Play Games sign-in is not available yet.", null)
    }

    AsyncFunction("getGameCenterProof") { promise: Promise ->
      promise.reject("UNSUPPORTED", "Game Center is iOS only.", null)
    }

    AsyncFunction("getPlayGamesServerAuthCode") { promise: Promise ->
      promise.reject("UNAVAILABLE", "Play Games sign-in is not available yet.", null)
    }
  }
}
