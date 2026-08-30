const test = require("node:test");
const assert = require("node:assert/strict");
const { booleanSetting } = require("../dist/config");

test("per-category wrap settings default to false", () => {
	assert.equal(booleanSetting(undefined, "TEST_WRAP_REWARDS"), false);
	assert.equal(booleanSetting("", "TEST_WRAP_REWARDS"), false);
});

test("per-category wrap settings accept explicit true and false", () => {
	assert.equal(booleanSetting(" TRUE ", "TEST_WRAP_REWARDS"), true);
	assert.equal(booleanSetting("false", "TEST_WRAP_REWARDS"), false);
});

test("per-category wrap settings reject ambiguous values", () => {
	assert.throws(() => booleanSetting("yes", "TEST_WRAP_REWARDS"), /must be true or false/);
});
