module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '\\.(m4a|mp3|wav|aac|caf)$': '<rootDir>/jest/assetStub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|@react-native|@react-native-async-storage|@react-navigation|react-native-.*|@azesmway/react-native-unity)/)',
  ],
};
