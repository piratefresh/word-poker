# Code style

This guide applies to the whole pnpm monorepo. Follow AGENTS.md, CONTEXT.md, the gameplay rules, and relevant ADRs for architecture and domain behavior. Follow a package's compiler and runtime requirements where they differ from these defaults.

## Keep code easy to change

- Keep each file focused on one responsibility. Split files that mix UI, state coordination, domain rules, data access, or unrelated helpers. Prefer several named files over one large component or utility file. File length is a prompt to review cohesion, not a hard limit.
- Extract a component when it has its own behavior, state, accessibility contract, or reusable visual role. Keep tiny markup near its parent when extraction would make the flow harder to follow. Colocate a feature's components, hooks, styles, and tests.
- Mode features (offline, online, tutorial) do not import each other's internals: what the modes share lives in features/table/ (hero-view, power-view) or lower, in lib/ or components/. The one layering on purpose is tutorial, which runs on the offline adapter (useOfflineGame).
- Prefer composition (children, slots) over a growing list of boolean or variant props; when a component keeps sprouting flags, split it.
- Give modules small public surfaces. Use named exports and package index.ts files for public APIs; keep implementation details private. Expo Router route files may use their required default export and should stay thin.
- Put shared game behavior in packages/game-rules and wire types in packages/contracts. Do not copy rules into mobile or server. The server owns authoritative state; the client may use shared rules for previews.
- Use domain names from CONTEXT.md, docs/FINAL_RULES.md, and the contracts. Comments should explain a non-obvious invariant or trade-off and point to the canonical rule when useful. Avoid repeating long documentation in source comments.

## Folder organization

- Group files by domain or feature first. Prefer nested folders over a large, flat directory containing screens, hooks, components, and helpers together.
- Within each domain, organize files by responsibility. Common examples include `components/` for child components, `hooks/` for hooks, `utils/` for utility functions, `services/` for external integrations and data access, `types/` for shared domain types, `constants/` for constants, and `schemas/` for validation schemas. These names are examples, not an exhaustive list; choose meaningful folders for the domain's actual responsibilities.
- Add deeper subfolders for distinct workflows or subdomains as a feature grows. Create folders when they help navigation; do not scaffold empty categories or split tightly related code just to match the examples.
- Keep feature-specific code inside its feature. Move code into shared folders only when multiple domains use it.
- Keep screen entry points and public `index.ts` files at the feature root. Colocate tests with the files they cover, including inside nested folders.

For example:

```text
features/receipts/
  components/
    reading-view.tsx
    scan-summary-sheet.tsx
  hooks/
    use-receipt-scan.ts
  utils/
    parse-receipt.ts
    parse-receipt.test.ts
  index.ts
  scan-screen.tsx
```

## TypeScript and files

- Use two spaces, double quotes, semicolons, and trailing commas in multiline structures, matching existing code. Avoid formatting-only churn outside files you change.
- Use camelCase for values and functions, PascalCase for components and types, and UPPER_SNAKE_CASE for fixed constants. Use kebab-case filenames by default; preserve PascalCase filenames for server classes where established.
- Use import type for type-only dependencies. Prefer precise types, readonly inputs and boundary data, and discriminated unions for commands or state variants. Give exported domain functions explicit return types. Both type and interface are acceptable; choose the clearer shape.
- Handle missing values explicitly. Avoid any, non-null assertions, and casts that hide uncertainty. When a framework boundary forces one, keep it local and explain it. Strengthen loose code when touching it.
- Import workspace packages by package name. Use @/ for mobile app imports and relative imports within a feature. Follow the server's .js relative import specifiers for its ESM output.

## Expo and React Native

- Design for iOS and Android first, while keeping web usable. Check the [versioned Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) for APIs and platform support before changing Expo code.
- Prefer @expo/ui when it supports the component and target platform. Otherwise use an Expo or React Native component; write custom UI when the product needs behavior those components cannot supply. Keep platform-specific code behind a small adapter or platform file.
- Use Expo Router for navigation. Keep routes as composition and wiring; move substantial screen behavior into focused components or hooks. Keep presentation components independent of room transport and engine details.
- Use react-native-reanimated-dnd for drag and drop, with a tap path for accessibility and tests. The word builder strip's documented pan implementation is the sole current exception; see apps/mobile/src/components/word-builder/AGENTS.md before changing it.
- Give interactive controls accessible labels and states, and verify behavior on affected platforms.

## State and effects

- Keep one source of truth for each state value. Derive cheap values during render; use useMemo when computation is meaningfully expensive or stable identity is needed. Keep user action logic in its event handler.
- Use useEffect to synchronize with an external system, such as a subscription, timer, animation, or imperative API, and clean it up when needed. Avoid effects for derived state, prop-driven resets, event-triggered mutations, effect chains, or notifying a parent after a local update. Review new or changed effects with the use-effect-killer skill and [React's effect guidance](https://react.dev/learn/you-might-not-need-an-effect).
- Let the appropriate owner hold state: the shared engine for game rules, the server for multiplayer truth, and a screen or feature hook for local UI state. Pass data down and report deliberate user edits through callbacks.

## Tests and changes

- Test meaningful behavior and edge cases, especially game rules, contract boundaries, and interaction flows. Keep mobile tests beside their subject; follow each other package's existing test/ layout and runner.
- Update docs/rules/, packages/game-rules, and packages/contracts together when gameplay behavior changes. Add a Maestro flow for a material end-to-end interaction when unit tests cannot cover it — web flows at `.maestro/`, device flows beside `eas.json` under `apps/mobile/.maestro/native/` (see docs/agents/e2e.md).
- Run relevant package tests and typechecks for changed code. Use pnpm --filter @wordpoker/mobile lint for mobile edits and pnpm check:boundaries for cross-package changes. These are the checks currently available; a repo-wide formatter and lint command have not yet been configured.
