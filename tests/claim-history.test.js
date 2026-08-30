const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
	appendClaimHistory,
	CLAIM_HISTORY_COLUMNS,
	rewardEpochColumns,
} = require("../dist/claim-history");

test("rewardEpochColumns separates single epochs from multi-epoch ranges", () => {
	assert.deepEqual(rewardEpochColumns([]), {
		rewardEpoch: "",
		rewardEpochStart: "",
		rewardEpochEnd: "",
	});
	assert.deepEqual(rewardEpochColumns([427]), {
		rewardEpoch: "427",
		rewardEpochStart: "",
		rewardEpochEnd: "",
	});
	assert.deepEqual(rewardEpochColumns([429n, 427n, 428n, 429n]), {
		rewardEpoch: "",
		rewardEpochStart: "427",
		rewardEpochEnd: "429",
	});
});

test("appendClaimHistory creates one header and appends confirmed claim rows", async () => {
	const directory = await mkdtemp(join(tmpdir(), "flare-claim-history-"));
	const outputPath = join(directory, "nested", "claims.csv");
	const entry = {
		rewardType: "FEE",
		rewardOwnerAddress: "0x1111111111111111111111111111111111111111",
		recipientAddress: "0x2222222222222222222222222222222222222222",
		...rewardEpochColumns([427]),
		amount: "12.5",
		transactionHash: "0xabc",
	};
	const date = new Date("2026-08-30T12:34:56.000Z");

	try {
		await appendClaimHistory(entry, outputPath, date);
		await appendClaimHistory(entry, outputPath, date);
		const lines = (await readFile(outputPath, "utf8")).trimEnd().split("\n");

		assert.equal(lines.length, 3);
		assert.equal(lines[0], CLAIM_HISTORY_COLUMNS.join(","));
		assert.equal(
			lines[1],
			"2026-08-30T12:34:56.000Z,FEE,0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222,427,,,12.5,0xabc,https://flare-explorer.flare.network/tx/0xabc",
		);
		assert.equal(lines[2], lines[1]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
