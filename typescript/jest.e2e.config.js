// End-to-end specs: they drive the running shop over HTTP and read Postgres directly (start both first with `npm run up`).
// The specs are the lab's cases and its grader matrix, against the same HTTP contract.
/** @type {import('jest').Config} */
module.exports = {
    testMatch: ["<rootDir>/test/e2e/**/*.e2e-spec.ts"],
    transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
    testEnvironment: "node",
    testTimeout: 180_000,
}
