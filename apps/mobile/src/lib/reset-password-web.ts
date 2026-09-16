/**
 * The two browser responses for the password-reset callback route.
 *
 * The reset mail's http(s) button lands on the Better Auth callback so that
 * *any* mail client can follow it (clients only open http links). What should
 * happen next depends on the device:
 *
 * - On a phone, the account lives in the native app, so we bounce into it over
 *   the `wordpoker://` deep link — but via an interstitial, because a browser
 *   will not launch a custom scheme from a bare 302 `Location` header (desktop
 *   has no handler; in-app webviews refuse non-http redirects). A page with a
 *   real, tappable link turns that dead redirect into a reliable hand-off.
 * - On a desktop, there is no app to open, so we serve a self-contained form
 *   that resets the password over the same API the app would call.
 */

const brand = {
  felt: "#051410",
  card: "#060d06",
  border: "rgba(212,175,55,0.24)",
  gold: "#d4af37",
  onGold: "#1a1208",
  cream: "#f4e4c1",
  dim: "rgba(232,220,192,0.6)",
  faint: "rgba(232,220,192,0.35)",
  danger: "#e08a7a",
} as const;

const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const serif = "Georgia,'Times New Roman',serif";

/** Better Auth's default `minPasswordLength`; mirror it for a friendly message. */
const MIN_PASSWORD_LENGTH = 8;

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A reset link is single-use and per-user; keep it out of shared caches.
      "cache-control": "no-store",
    },
  });
}

const pageShell = (title: string, main: string, script = ""): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: ${brand.felt};
        color: ${brand.cream};
        font-family: ${sans};
      }
      main {
        width: 100%;
        max-width: 400px;
        background: ${brand.card};
        border: 1px solid ${brand.border};
        border-radius: 14px;
        padding: 32px;
      }
      .eyebrow {
        margin: 0;
        font-size: 11px;
        letter-spacing: 2.2px;
        text-transform: uppercase;
        color: ${brand.gold};
      }
      h1 {
        margin: 20px 0 0;
        font-family: ${serif};
        font-size: 24px;
        line-height: 32px;
        font-weight: 700;
      }
      p.sub { margin: 12px 0 0; font-size: 15px; line-height: 22px; color: ${brand.dim}; }
      label { display: block; margin: 24px 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: ${brand.gold}; }
      input {
        width: 100%;
        padding: 13px 14px;
        font-size: 15px;
        color: ${brand.cream};
        background: rgba(0,0,0,0.25);
        border: 1px solid ${brand.border};
        border-radius: 8px;
      }
      input:focus { outline: none; border-color: ${brand.gold}; }
      button, a.btn {
        display: block;
        width: 100%;
        margin-top: 24px;
        padding: 14px 28px;
        font-family: ${sans};
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-align: center;
        text-decoration: none;
        color: ${brand.onGold};
        background: ${brand.gold};
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.5; cursor: default; }
      .hint { margin: 20px 0 0; font-size: 13px; line-height: 19px; color: ${brand.faint}; }
      .msg { margin: 20px 0 0; font-size: 14px; line-height: 20px; min-height: 20px; }
      .msg.error { color: ${brand.danger}; }
      .msg.ok { color: ${brand.gold}; }
    </style>
  </head>
  <body>
    <main>${main}</main>
    ${script ? `<script>${script}</script>` : ""}
  </body>
</html>`;

/**
 * Bounce a phone into the native app. The visitor already tapped a link to get
 * here, so most mobile browsers still treat the immediate scheme navigation as
 * a user gesture; the button is the fallback when they do not.
 */
export function deepLinkInterstitial(deepLink: string): Response {
  const href = JSON.stringify(deepLink); // Safe in both the href attribute and JS.

  return htmlResponse(
    pageShell(
      "Opening Word Poker…",
      `
        <p class="eyebrow">Word Poker</p>
        <h1>Opening the app…</h1>
        <p class="sub">If Word Poker doesn't open on its own, use the button below.</p>
        <a class="btn" id="open" href="">Open Word Poker</a>
        <p class="hint">Open this on the device where Word Poker is installed.</p>
      `,
      `
        var link = ${href};
        document.getElementById("open").setAttribute("href", link);
        window.location.href = link;
      `,
    ),
  );
}

/**
 * Reset the password from a desktop browser, against the same Better Auth POST
 * endpoint the app uses. The token is validated (and consumed) server-side on
 * submit, so an expired or reused link surfaces as an inline error here.
 */
export function webResetPasswordPage(token: string): Response {
  return htmlResponse(
    pageShell(
      "Reset your Word Poker password",
      `
        <p class="eyebrow">Word Poker</p>
        <h1>Choose a new password.</h1>
        <p class="sub">Set a new password for your account. This link works once and expires after an hour.</p>
        <form id="form" novalidate>
          <label for="password">New password</label>
          <input id="password" name="password" type="password" autocomplete="new-password"
            minlength="${MIN_PASSWORD_LENGTH}" required />
          <label for="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" autocomplete="new-password"
            minlength="${MIN_PASSWORD_LENGTH}" required />
          <button id="submit" type="submit">Reset password</button>
        </form>
        <p class="msg" id="msg" role="status" aria-live="polite"></p>
      `,
      `
        var token = ${JSON.stringify(token)};
        var form = document.getElementById("form");
        var msg = document.getElementById("msg");
        var submit = document.getElementById("submit");

        function show(text, kind) {
          msg.textContent = text;
          msg.className = "msg " + kind;
        }

        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          var password = document.getElementById("password").value;
          var confirm = document.getElementById("confirm").value;

          if (password.length < ${MIN_PASSWORD_LENGTH}) {
            show("Use at least ${MIN_PASSWORD_LENGTH} characters.", "error");
            return;
          }
          if (password !== confirm) {
            show("Those passwords don't match.", "error");
            return;
          }

          submit.disabled = true;
          show("Saving…", "");

          try {
            var res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ newPassword: password, token: token }),
            });
            if (res.ok) {
              form.style.display = "none";
              show("Password reset. Open Word Poker and sign in with your new password.", "ok");
              return;
            }
            var body = await res.json().catch(function () { return {}; });
            show(body.message || "That reset link is invalid or has expired. Request a new one.", "error");
          } catch (err) {
            show("Something went wrong. Please try again.", "error");
          } finally {
            submit.disabled = false;
          }
        });
      `,
    ),
  );
}
