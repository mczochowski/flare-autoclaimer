const test = require("node:test");
const assert = require("node:assert/strict");
const { booleanSetting, getConfig } = require("../dist/config");

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

test("autoclaimer polling defaults to five minutes", () => {
	const configured = process.env.POLL_INTERVAL_MINUTES;
	delete process.env.POLL_INTERVAL_MINUTES;
	try {
		assert.equal(getConfig().pollIntervalMs, 5 * 60 * 1000);
	} finally {
		if (configured === undefined) {
			delete process.env.POLL_INTERVAL_MINUTES;
		} else {
			process.env.POLL_INTERVAL_MINUTES = configured;
		}
	}
});
