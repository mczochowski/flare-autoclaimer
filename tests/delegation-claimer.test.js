const test = require("node:test");
const assert = require("node:assert/strict");
const { Result } = require("ethers");
const { flattenRewardStates } = require("../dist/reward-states");

test("flattenRewardStates handles an empty ethers Result", () => {
	const groups = Result.fromItems([]);

	assert.deepEqual(flattenRewardStates(groups), []);
});

test("flattenRewardStates preserves states in nested ethers Results", () => {
	const first = { amount: 1n };
	const second = { amount: 2n };
	const groups = Result.fromItems([
		Result.fromItems([first]),
		Result.fromItems([second]),
	]);

	assert.deepEqual(flattenRewardStates(groups), [first, second]);
});
