module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '\\.(m4a|mp3|wav|aac|caf)$': '<rootDir>/jest/assetStub.js',
    // See jest/devTokenStub.js — this replaces five per-file virtual mocks that only worked while
    // jest happened to run each file in its own process.
    'counseling/api/devToken$': '<rootDir>/jest/devTokenStub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|@react-native|@react-native-async-storage|@react-navigation|react-native-.*|@azesmway/react-native-unity)/)',
  ],
};
