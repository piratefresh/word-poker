import ExpoModulesCore
import GameKit
import UIKit

/// Game Center for Word Poker (STO-591): sign the local player in, report their state, and fetch
/// Apple's identity-verification proof for the server to check. Nothing here is trusted by the
/// server; a proof only counts once `auth/server/game-center.ts` verified Apple's signature.
///
/// Everything runs on the main queue, so the pending promises and GameKit's callbacks never race.
public class PlatformAuthModule: Module {
  private var handlerInstalled = false
  /// `authenticate()` calls waiting on the one GameKit attempt in flight.
  private var waiters: [Promise] = []
  /// GameKit's sign-in UI, kept when no screen could present it so a retry can.
  private var heldController: UIViewController?
  private var proofInFlight = false
  private var unavailable = false
  private var lastReported: String?
  private var authObserver: NSObjectProtocol?
  /// Ends an `authenticate()` that GameKit never answers (no network at all): it can stay silent.
  private var silenceTimer: DispatchWorkItem?
  private static let silenceLimit: TimeInterval = 15

  public func definition() -> ModuleDefinition {
    Name("PlatformAuth")

    Events("onAuthStateChange")

    OnCreate {
      DispatchQueue.main.async { self.observeAuthChanges() }
    }

    OnDestroy {
      DispatchQueue.main.async {
        if let observer = self.authObserver { NotificationCenter.default.removeObserver(observer) }
        self.authObserver = nil
        self.heldController = nil
        self.settle(error: ("CANCELLED", "Game Center sign-in was interrupted."))
      }
    }

    OnAppBecomesActive {
      DispatchQueue.main.async { self.report() }
    }

    AsyncFunction("getState") { () -> [String: Any] in
      self.state()
    }.runOnQueue(.main)

    AsyncFunction("authenticate") { (promise: Promise) in
      self.authenticate(promise)
    }.runOnQueue(.main)

    AsyncFunction("getGameCenterProof") { (promise: Promise) in
      self.proof(promise)
    }.runOnQueue(.main)

    AsyncFunction("getPlayGamesServerAuthCode") { (promise: Promise) in
      promise.reject("UNSUPPORTED", "Play Games is Android only.")
    }
  }

  // MARK: - State

  private func observeAuthChanges() {
    authObserver = NotificationCenter.default.addObserver(
      forName: .GKPlayerAuthenticationDidChangeNotificationName, object: nil, queue: .main
    ) { [weak self] _ in self?.report() }
  }

  private func state() -> [String: Any] {
    let player = GKLocalPlayer.local
    if player.isAuthenticated {
      return ["provider": "game-center", "status": "authenticated", "displayName": player.alias]
    }
    return ["provider": "game-center", "status": unavailable ? "unavailable" : "signed-out"]
  }

  /// Emits when the status or the player changed — including a different player with the same name.
  private func report() {
    let player = GKLocalPlayer.local
    let key = player.isAuthenticated ? "authenticated:\(player.teamPlayerID)" : (unavailable ? "unavailable" : "signed-out")
    guard key != lastReported else { return }
    lastReported = key
    sendEvent("onAuthStateChange", state())
  }

  // MARK: - Authentication

  private func authenticate(_ promise: Promise) {
    if GKLocalPlayer.local.isAuthenticated {
      promise.resolve(state())
      return
    }
    waiters.append(promise)
    guard waiters.count == 1 else { return } // shares the attempt already in flight

    // Cancelled as soon as sign-in UI is shown: a player typing a password is not silence.
    let timer = DispatchWorkItem { [weak self] in
      self?.settle(error: ("NETWORK_ERROR", "Game Center did not answer. Check your connection."))
    }
    silenceTimer = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.silenceLimit, execute: timer)

    if let controller = heldController {
      // An earlier attempt had UI to show and nowhere to show it; this is the player's retry.
      heldController = nil
      present(controller)
    } else if !handlerInstalled {
      handlerInstalled = true
      GKLocalPlayer.local.authenticateHandler = { [weak self] controller, error in
        DispatchQueue.main.async { self?.handle(controller, error) }
      }
    } else {
      // GameKit only re-runs its handler when one is assigned; assigning the same one asks again.
      let handler = GKLocalPlayer.local.authenticateHandler
      GKLocalPlayer.local.authenticateHandler = handler
    }
  }

  /// GameKit may call this many times: with UI to show, on success, on failure, and later on its own
  /// when the player changes accounts in Settings.
  private func handle(_ controller: UIViewController?, _ error: Error?) {
    if let controller {
      // Sign-in UI means in progress, not signed in. Shown only when someone asked for it.
      if waiters.isEmpty {
        heldController = controller
      } else {
        present(controller)
      }
      return
    }
    if GKLocalPlayer.local.isAuthenticated {
      unavailable = false
      settle(error: nil)
    } else {
      let failure = Self.code(for: error)
      unavailable = failure.0 == "UNAVAILABLE" || failure.0 == "UNSUPPORTED"
      settle(error: failure)
    }
    report()
  }

  private func present(_ controller: UIViewController) {
    guard let presenter = Self.presenter() else {
      heldController = controller
      settle(error: ("NO_ACTIVITY", "Game Center sign-in needs a visible screen. Try again."))
      return
    }
    silenceTimer?.cancel()
    silenceTimer = nil
    presenter.present(controller, animated: true)
  }

  private func settle(error: (String, String)?) {
    silenceTimer?.cancel()
    silenceTimer = nil
    let pending = waiters
    waiters = []
    for promise in pending {
      if let error {
        promise.reject(error.0, error.1)
      } else {
        promise.resolve(state())
      }
    }
  }

  /// The topmost controller of the foreground scene's key window, unless it is on its way out.
  private static func presenter() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    guard var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return nil }
    while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
    return top.isBeingDismissed || top.view.window == nil ? nil : top
  }

  // MARK: - Proof

  private func proof(_ promise: Promise) {
    let player = GKLocalPlayer.local
    guard player.isAuthenticated else {
      promise.reject("NOT_AUTHENTICATED", "Sign in to Game Center first.")
      return
    }
    guard !proofInFlight else {
      promise.reject("BUSY", "A Game Center proof is already being made.")
      return
    }
    guard let bundleId = Bundle.main.bundleIdentifier else {
      promise.reject("INTERNAL_ERROR", "The app has no bundle identifier.")
      return
    }
    proofInFlight = true
    let teamPlayerID = player.teamPlayerID
    player.fetchItems { [weak self] url, signature, salt, timestamp, error in
      DispatchQueue.main.async {
        self?.proofInFlight = false
        if let error {
          let failure = Self.code(for: error)
          promise.reject(failure.0, failure.1)
          return
        }
        // The proof is for whoever was signed in when it was asked for; a switch mid-way voids it.
        let now = GKLocalPlayer.local
        guard now.isAuthenticated, now.teamPlayerID == teamPlayerID else {
          promise.reject("NOT_AUTHENTICATED", "The Game Center player changed. Try again.")
          return
        }
        guard let url, let signature, let salt else {
          promise.reject("INTERNAL_ERROR", "Game Center returned an incomplete proof.")
          return
        }
        promise.resolve([
          "teamPlayerID": teamPlayerID,
          "bundleId": bundleId,
          "publicKeyURL": url.absoluteString,
          "signatureBase64": signature.base64EncodedString(),
          "saltBase64": salt.base64EncodedString(),
          // UInt64 as decimal text: a JS number would round it.
          "timestamp": String(timestamp),
        ])
      }
    }
  }

  // MARK: - Errors

  private static func code(for error: Error?) -> (String, String) {
    guard let error else { return ("NOT_AUTHENTICATED", "Not signed in to Game Center.") }
    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
      return ("NETWORK_ERROR", "Could not reach Game Center.")
    }
    guard nsError.domain == GKErrorDomain, let code = GKError.Code(rawValue: nsError.code) else {
      return ("INTERNAL_ERROR", "Game Center failed.")
    }
    switch code {
    case .cancelled, .userDenied:
      return ("CANCELLED", "Game Center sign-in was cancelled.")
    case .notAuthenticated:
      return ("NOT_AUTHENTICATED", "Not signed in to Game Center.")
    case .communicationsFailure, .connectionTimeout:
      return ("NETWORK_ERROR", "Could not reach Game Center.")
    case .authenticationInProgress:
      return ("BUSY", "Game Center sign-in is already in progress.")
    case .notSupported:
      return ("UNSUPPORTED", "Game Center is not supported on this device.")
    case .gameUnrecognized, .appUnlisted, .underage, .parentalControlsBlocked, .apiNotAvailable, .notAuthorized, .lockdownMode:
      return ("UNAVAILABLE", "Game Center is not available for this app or account.")
    default:
      return ("INTERNAL_ERROR", "Game Center failed.")
    }
  }
}
