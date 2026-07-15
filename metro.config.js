const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// This project lives on an external /Volumes/ drive where Watchman does NOT
// reliably receive file-change events, so Metro served a stale bundle and live
// edits never appeared on the device. Disabling Watchman makes Metro use its
// own Node watcher, which DOES detect changes here — restoring Fast Refresh /
// live reload. Set here (not just as a shell env) so it applies however Metro
// is started: `npm start`, `npx react-native start`, or run-ios's packager.
process.env.WATCHMAN_DISABLE = '1';

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
