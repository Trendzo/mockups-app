module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: [
    '/node_modules/',
    // Stubs live next to the tests but are helpers, not suites.
    '/__tests__/__stubs__/',
    // RN-template smoke test that renders the WHOLE app; it needs a mock for every native
    // module (gesture handler, reanimated, vision camera, ...) and has never run. Covered
    // instead by unit tests of the logic and by on-device checks.
    '/__tests__/App.test.tsx',
  ],
  // Native-backed modules that cannot load under node: use the in-memory stubs everywhere.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__stubs__/asyncStorage.js',
    '^react-native-config$': '<rootDir>/__tests__/__stubs__/config.js',
  },
};
