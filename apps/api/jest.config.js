/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.ts", "**/src/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Jest runs in CommonJS mode. Override module/moduleResolution from
          // the project's NodeNext settings so ts-jest can resolve imports.
          module: "CommonJS",
          moduleResolution: "node",
        },
      },
    ],
  },
  // Strip .js extensions from relative imports — required because our source
  // uses NodeNext-style explicit .js extensions but Jest resolves without them.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  verbose: true,
};
