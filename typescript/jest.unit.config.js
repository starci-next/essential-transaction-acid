// Unit specs: pure logic only (the transaction and savepoint flow over a fake connection, the refusal mapping). No database.
/** @type {import('jest').Config} */
module.exports = {
    testMatch: ["<rootDir>/test/unit/**/*.spec.ts"],
    transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
    testEnvironment: "node",
}
