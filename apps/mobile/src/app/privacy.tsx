import { ScrollView, StyleSheet, Text } from "react-native";

import { colors, fonts, fontSize, spacing } from "@/constants/theme";

/**
 * The public privacy policy both stores link to, and the Account sheet opens. The one copy of the
 * policy: edit it here. Bracketed text is still to be filled in.
 */

/** A paragraph, or `[lead, text]` for one that opens with a bold lead-in. */
type Block = string | readonly [string, string];

const INTRO =
  "WordPoker Best Word Takes The Pot (“we”, “us” or “our”) makes WordPoker, a word game played like Texas Hold’em with letter tiles. This policy explains what personal data the WordPoker app and website use, why, and the third-party services involved.";
const UPDATED = "Last updated: November 9, 2026.";

const SECTIONS: readonly (readonly [string, readonly Block[]])[] = [
  [
    "Who we are",
    [
      "WordPoker Best Word Takes The Pot, 2300 Walnut Street, Apt 519, Philadelphia, PA 19103, United States. For any privacy question, email privacy@wordpoker.app or call +1 (610) 247-3054.",
    ],
  ],
  [
    "What we collect and why",
    [
      [
        "Your account.",
        "You can play as a guest or create an account with an email and password, Sign in with Apple, Google sign-in or Apple Game Center. We store your email address, a unique player handle, a display name (from Apple or Google we keep only your first name), an optional avatar photo, and which sign-in method you used last. We use these to run your account, recover it, and show other players who they are playing with. Guest play uses a temporary account; if you later sign up, your guest history moves to the new account.",
      ],
      [
        "Gameplay.",
        "We store your games and hands (offline and online), your progress, quests, coin balance history, friends, friend codes, table invites, referrals and whether you are online. Online tables run on our game servers, which process your seat, moves and words in real time. Other players at an online table see your handle, display name and avatar. After a hand ends, that hand stays in the history of the other players who were at the table.",
      ],
      [
        "Purchases and coins.",
        "Coins can be bought in the app or earned (including by watching rewarded ads). Payments are handled by Apple App Store or Google Play — we never see your card details. RevenueCat manages purchases and your coin balance on our behalf and receives your account identifier and purchase records.",
      ],
      ["Emails.", "We send account emails (verification, password reset) through Resend."],
      [
        "Push notifications.",
        "If you allow notifications, we store your device’s push token to send you things like table invites. You can turn them off in your device settings.",
      ],
      [
        "Analytics, crash reports and session replay.",
        "We use PostHog to understand how the game is used and to fix crashes. It receives app events, device and app information (model, OS, app version), error reports, and on mobile a recording of a sample of sessions (about 1 in 10) showing the app’s screens. We use this only to improve WordPoker.",
      ],
    ],
  ],
  [
    "Advertising",
    [
      "WordPoker is free to play. To support it, we offer optional rewarded ads: you choose to watch an ad to earn free coins, and no ad ever plays during a hand. We never show ads you didn’t ask for.",
      "We use Google AdMob to deliver these ads. RevenueCat works alongside AdMob to confirm you watched an ad to the end, so the coins can be added to your account. Today Google is the only ad network we use. If we add other ad partners through AdMob, we will list them here and, where required, in the consent message in the app.",
      "Ad providers may collect and process information such as device identifiers (for example the advertising ID), device and app information, approximate location (from your IP address), app activity, ad interactions and diagnostic data. They use it to deliver, measure, frequency-cap, secure and improve ads and, only where you allow it, to personalise them. If you report an ad, the provider may also process what you submit.",
      "Google: https://policies.google.com/technologies/partner-sites",
      "RevenueCat: https://www.revenuecat.com/privacy",
    ],
  ],
  [
    "Consent and your choices",
    [
      "Where the law requires it, including in the European Economic Area, the United Kingdom and Switzerland, we ask for your consent through a privacy message in the app, provided by Google. It asks whether ads may use cookies or similar storage on your device, and whether your personal data may be collected, shared and used for advertising. On iOS, we also ask your permission before tracking you across other companies’ apps and websites (Apple’s App Tracking Transparency).",
      "You may see the message the first time you go to watch an ad, after reinstalling the app, when your earlier choice needs refreshing, or when our ad setup changes in a way that needs a new choice.",
      "If you don’t consent, or later withdraw consent, you may see non-personalised or limited ads, or none, where ad providers can’t serve ads without consent. Non-personalised and limited ads aren’t based on your interests, but may still use limited data for ad delivery, frequency capping, aggregate reporting, fraud prevention and security.",
      "You can change your mind at any time: where the law requires it, from Account → Privacy choices in the app, and always from your device’s privacy and advertising settings (on iOS, Settings → Privacy & Security → Tracking; on Android, Settings → Privacy → Ads). For ad data Google holds, you can also use Google’s own privacy tools.",
    ],
  ],
  [
    "Cookies, identifiers and local storage",
    [
      "WordPoker and the services it uses may store small pieces of data on your device and use mobile advertising identifiers or similar technologies. We use these to keep you signed in, remember your settings and choices, provide game features, deliver and measure ads, prevent fraud, and understand how the app is used. Where consent is required, we ask for it through the privacy message described above.",
    ],
  ],
  [
    "Who we share data with",
    [
      "We do not sell your personal data. We share it only with the service providers that run WordPoker for us, under contract, for the purposes above:",
      ["Apple, Google:", "sign-in, Game Center, app store purchases, push notifications."],
      ["RevenueCat:", "purchases, coin balance, ad reward verification."],
      ["Google AdMob:", "rewarded ads."],
      ["PostHog:", "analytics, crash reports, session replay."],
      ["Resend:", "account emails."],
      ["Cloudflare:", "avatar photo storage."],
      ["PlanetScale, Colyseus Cloud, Expo (EAS Hosting):", "hosting our database, game servers and website."],
      "We may also disclose data if the law requires it, or to protect players and the game from fraud and abuse.",
    ],
  ],
  [
    "International transfers",
    [
      "Our providers may process data outside your country, including in the United States. Where required, we rely on appropriate safeguards such as the EU Standard Contractual Clauses.",
    ],
  ],
  [
    "Legal bases (EEA/UK)",
    [
      "We process your data to provide the game you asked for (contract), to improve and secure it (legitimate interests), for personalised ads and where else the law requires it (consent), and to meet legal duties such as tax records for purchases (legal obligation).",
    ],
  ],
  [
    "How long we keep it",
    [
      "We keep your account data while your account exists. When you delete your account, we delete your profile, avatar, games, progress, quests, friends, invites, referrals and push tokens. Your seats in online hands other players took part in stay, renamed “Anonymous”. A record of coin transactions is kept for accounting, but no longer linked to you. Analytics and ad providers keep data according to their own retention periods.",
    ],
  ],
  [
    "Deleting your account and your rights",
    [
      "You can delete your account at any time in the app: open the menu on your avatar, choose Settings, then Delete account. Depending on where you live, you may also have the right to access, correct, delete, export, restrict or object to the use of your personal data, and to withdraw consent. Email us at privacy@wordpoker.app and we will respond within the time the law requires. You can also complain to your local data protection authority.",
    ],
  ],
  [
    "Children",
    [
      "WordPoker is not directed at children under 13 (or the minimum age in your country), and we do not knowingly collect their personal data. If you believe a child has given us personal data, contact us and we will delete it.",
    ],
  ],
  [
    "Security",
    [
      "We protect your data with encryption in transit, access controls and secure credential storage. No system is perfectly secure, but we work to keep your data safe.",
    ],
  ],
  [
    "Changes to this policy",
    [
      "We may update this policy when WordPoker, our providers or the law change. We will update the date at the top and, for material changes, tell you in the app.",
    ],
  ],
  [
    "Contact",
    [
      "WordPoker Best Word Takes The Pot\n2300 Walnut Street, Apt 519\nPhiladelphia, PA 19103, United States\nEmail: privacy@wordpoker.app\nPhone: +1 (610) 247-3054",
    ],
  ],
];

export default function PrivacyPolicyPage() {
  return (
    <ScrollView contentContainerStyle={styles.page} style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>Privacy Policy</Text>
      <Text style={styles.body}>{INTRO}</Text>
      <Text style={styles.body}>{UPDATED}</Text>
      {SECTIONS.map(([heading, blocks]) => [
        <Text accessibilityRole="header" key={heading} style={styles.heading}>{heading}</Text>,
        ...blocks.map((block, i) => (
          <Text key={`${heading}-${i}`} selectable style={styles.body}>
            {typeof block === "string" ? block : (
              <>
                <Text style={styles.lead}>{block[0]}</Text> {block[1]}
              </>
            )}
          </Text>
        )),
      ])}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bgElevated },
  page: { gap: spacing.md, maxWidth: 640, width: "100%", alignSelf: "center", padding: spacing.lg },
  title: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.h3 },
  heading: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.body, marginTop: spacing.sm },
  body: { color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body },
  lead: { color: colors.textBright, fontFamily: fonts.ui },
});
