/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/poker/**/*.ts',
    '!lib/poker/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};

module.exports = config;
