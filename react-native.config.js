/**
 * RN CLI config. `assets` are linked into the native projects by
 * `npx react-native-asset` (fonts land in iOS Info.plist + Android assets/fonts).
 *
 * We bundle the Ionicons font ourselves (assets/fonts) and only use the JS
 * <Icon> component (glyphs render as text), so we disable native autolinking of
 * react-native-vector-icons — otherwise its pod ALSO copies the fonts and the
 * iOS build fails with "Multiple commands produce Ionicons.ttf".
 *
 * `expo` is a dependency but no expo modules are used (zero `expo` imports, no
 * expo-* packages). Its Android build.gradle relies on Expo's own Gradle plugins
 * (which this bare RN project does not apply), so autolinking it breaks the build
 * with "project ':expo' does not specify compileSdk". Disable native autolinking.
 */
module.exports = {
  dependencies: {
    'react-native-vector-icons': {
      platforms: { ios: null, android: null },
    },
    expo: {
      platforms: { ios: null, android: null },
    },
  },
  assets: ['./assets/fonts'],
};
