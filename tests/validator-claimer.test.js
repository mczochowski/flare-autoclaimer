const test = require("node:test");
const assert = require("node:assert/strict");
const { designatedValidatorRecipient } = require("../dist/validator-claimer");

const owner = "0x1111111111111111111111111111111111111111";
const designated = "0x2222222222222222222222222222222222222222";

test("validator recipient falls back to the reward owner when none is designated", () => {
	assert.equal(designatedValidatorRecipient(owner, []), owner);
});

test("validator recipient uses the sole designated recipient", () => {
	assert.equal(designatedValidatorRecipient(owner, [designated]), designated);
});

test("validator recipient ignores a redundant owner entry", () => {
	assert.equal(designatedValidatorRecipient(owner, [owner, designated, designated.toUpperCase()]), designated);
});

test("validator recipient refuses to guess when multiple recipients are designated", () => {
	assert.throws(
		() =>
			designatedValidatorRecipient(owner, [
				designated,
				"0x3333333333333333333333333333333333333333",
			]),
		/multiple designated validator claim recipients/,
	);
});
