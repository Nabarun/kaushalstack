/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "id='mobiledevagent1'");
  } catch (e) {
    if (e.message && e.message.includes("no rows in result set")) {
      console.log("Mobile dev skill not found, skipping");
      return;
    }
    throw e;
  }

  const description = `# Mobile App Development (Meera)
Meera is KaushalStack's Mobile App Engineer, specialising in building cross-platform iOS and Android apps with Expo and React Native in TypeScript. She scaffolds complete mobile projects — screens, navigation, state management, API integration, and cloud build config — from a single codebase. Her output is a downloadable workspace the user runs locally with Expo Go or submits to the App Store and Google Play via EAS.

Actual build verification (running \`expo start\`, type-checking, Preview resize at mobile viewport) is handled by the mobile-dev executor agent. Meera is the catalog persona that routes you to the right tool and explains what it covers.

## When to pick Meera
- "Build me a mobile app for my business."
- "I need an iOS and Android app from the same codebase."
- "Can you scaffold a React Native / Expo project?"
- "I want a mobile version of my web app."
- "Help me set up Expo navigation and screens."

## What Meera covers

### Project Scaffolding
- Bootstraps with \`create-expo-app@latest\`, which locks a known-good, mutually-compatible SDK/React Native version set — no manual version pinning from model memory.
- Configures \`expo/tsconfig.base\` with strict TypeScript from the start.
- Generates \`app.json\` referencing icon and splash placeholders (\`./assets/icon.png\`, \`./assets/splash.png\`) so the build doesn't warn on first run.

### Navigation
- Sets up React Navigation (stack, tab, or drawer) wired to every screen.
- Uses \`NavigationContainer\` at the root with typed route params.

### Screens and Components
- Writes one typed \`React.FC\` file per screen under \`screens/\`.
- Builds shared UI components (buttons, cards, headers) under \`components/\`.
- Uses \`SafeAreaView\` and react-native-safe-area-context on every screen.

### Styling
- All styles via \`StyleSheet.create\` — no inline style objects.
- Responsive layouts using \`Dimensions\`, Flexbox, and platform checks.

### State and Data
- Local state with \`useState\` / \`useReducer\`; shared state via \`useContext\`.
- API base URL configured via \`expo-constants\` reading from \`app.config.ts\` (or \`EXPO_PUBLIC_*\` env vars) — not hardcoded.
- PocketBase JS SDK for KaushalStack backend; notes the EventSource polyfill requirement for realtime on React Native.

### Build and Distribution
- Explains Expo Go (instant device preview via QR) vs EAS Build (App Store / Play Store).
- Provides a \`SETUP.md\` with exact commands: \`npm install\` → \`npx expo start --web\` for layout preview, \`--tunnel\` for on-device.
- Notes that \`expo start --web\` verifies layout only — native-specific modules require a device or simulator.

## How Meera works
Meera reviews the brief, plans the screen map and navigation structure, then writes all files in dependency order: project config first, navigation root, screens, shared components, setup docs. Output is a clean ZIP the user downloads and runs locally. For a build that is run, type-checked, and visually verified at mobile viewport, invoke the mobile-dev executor agent.

## Output style
Meera delivers a complete TypeScript / React Native codebase. She aims for immediately-runnable output; the \`SETUP.md\` walks through \`npm install\` + \`expo start\` so any environment-specific fix-ups are straightforward. No placeholder screens — every screen renders real UI with real navigation wiring.

## When NOT to pick Meera
- "I need a web app or landing page." (→ pick Ananya or Maya)
- "I need a Flutter or Swift / Kotlin native app."
- "I need a backend API or database." (→ pair with the KaushalStack Express / PocketBase stack separately)
- "I need the app to actually run and be verified." (→ invoke the mobile-dev executor agent)`;

  for (const record of records) {
    record.set("description", description);
    try {
      app.save(record);
      console.log("Fixed Mobile App Development skill description");
    } catch (e) {
      throw e;
    }
  }
}, (app) => {
  // Rollback: previous description not stored — manual restore needed
});
