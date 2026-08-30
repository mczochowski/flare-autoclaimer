const test = require("node:test");
const assert = require("node:assert/strict");
const { ClaimType } = require("../dist/interfaces");
const { findRewardClaim, getWeightBasedRewardClaims } = require("../dist/reward-data");
const { parseAddressList } = require("../dist/config");

const beneficiary = "0x1111111111111111111111111111111111111111";
const directBeneficiary = "0x2222222222222222222222222222222222222222";
const rewardsData = {
	rewardEpochId: 427,
	rewardClaims: [
		[["0x01"], [427, directBeneficiary, "42", ClaimType.DIRECT]],
		[["0x02"], [427, beneficiary, "123", ClaimType.WNAT]],
	],
	noOfWeightBasedClaims: 1,
	merkleRoot: "0x01",
};

test("findRewardClaim matches beneficiary case-insensitively and preserves tuple values", () => {
	const claim = findRewardClaim(rewardsData, beneficiary.toLowerCase(), ClaimType.WNAT);
	assert.equal(claim.body.rewardEpochId, 427n);
	assert.equal(claim.body.beneficiary, beneficiary);
	assert.equal(claim.body.amount, 123n);
	assert.equal(claim.body.claimType, 2n);
});

test("getWeightBasedRewardClaims excludes DIRECT and FEE tuples", () => {
	const claims = getWeightBasedRewardClaims(rewardsData);
	assert.equal(claims.length, 1);
	assert.equal(claims[0].body.claimType, 2n);
});

test("parseAddressList accepts comma and whitespace separators and removes duplicates", () => {
	const parsed = parseAddressList(`${beneficiary}, ${beneficiary.toLowerCase()}\n${directBeneficiary}`, "REWARD_OWNER_ADDRESSES");
	assert.deepEqual(parsed, [beneficiary, directBeneficiary]);
});
