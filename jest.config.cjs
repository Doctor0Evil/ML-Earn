module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.cjs'],
  restoreMocks: true,
  clearMocks: true,
  resetMocks: true,
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
};
