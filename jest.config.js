export default {
  clearMocks: true,
  // https://kulshekhar.github.io/ts-jest/docs/guides/esm-support/
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  reporters: [
    'default',
    [
      // https://github.com/jest-community/jest-junit
      'jest-junit',
      {
        // parallel-test-action requires the file attribute
        addFileAttribute: 'true',
      },
    ],
  ],
}
