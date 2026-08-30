import { claimCategories, claimConfiguredRewards } from "./autoclaimer";
import { getConfig } from "./config";
import { getExecutorSigner } from "./wallet";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
	const signer = getExecutorSigner();
	const { pollIntervalMs } = getConfig();
	console.log(`Starting Flare autoclaimer with executor ${signer.address}`);

	while (true) {
		const startedAt = new Date();
		console.log(`Claim cycle started at ${startedAt.toISOString()}`);
		const failures = await claimConfiguredRewards([...claimCategories]);
		if (failures.length > 0) {
			console.error(`Claim cycle completed with ${failures.length} failure(s)`);
		} else {
			console.log("Claim cycle completed successfully");
		}
		await delay(pollIntervalMs);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
