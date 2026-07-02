module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reanimated 4 relies on the worklets Babel plugin. It MUST be listed last.
    'react-native-worklets/plugin',
  ],
};
