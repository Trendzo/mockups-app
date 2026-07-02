/**
 * RN CLI config. `assets` are linked into the native projects by
 * `npx react-native-asset` (fonts land in iOS Info.plist + Android assets/fonts).
 *
 * We bundle the Ionicons font ourselves (assets/fonts) and only use the JS
 * <Icon> component (glyphs render as text), so we disable native autolinking of
 * react-native-vector-icons — otherwise its pod ALSO copies the fonts and the
 * iOS build fails with "Multiple commands produce Ionicons.ttf".
 */
module.exports = {
  dependencies: {
    'react-native-vector-icons': {
      platforms: { ios: null, android: null },
    },
  },
  assets: ['./assets/fonts'],
};
