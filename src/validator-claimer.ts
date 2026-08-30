import { formatEther } from "ethers";
import { assertValidatorAuthorization } from "./authorization";
import { getConfig, recipientFor } from "./config";
import { requireValidatorRewardManager } from "./contracts";
import { getExecutorSigner } from "./wallet";

export class ValidatorClaimer {
	constructor(public readonly rewardOwners: string[]) {}

	async listClaimableRewards() {
		const manager = requireValidatorRewardManager();
		for (const rewardOwner of this.rewardOwners) {
			const [totalReward, claimedReward] = await manager.getStateOfRewards(rewardOwner);
			const unclaimed = totalReward - claimedReward;
			console.log(`Validator staking rewards for ${rewardOwner}: ${formatEther(unclaimed)} FLR`);
		}
	}

	async claimAllUnclaimedRewards() {
		if (this.rewardOwners.length === 0) {
			console.log("No validator reward owners configured");
			return false;
		}
		const manager = requireValidatorRewardManager();
		if (!(await manager.active())) {
			throw new Error("ValidatorRewardManager is not active");
		}
		const signer = getExecutorSigner();
		const connected = manager.connect(signer);
		let submitted = false;
		const failures: string[] = [];

		for (const rewardOwner of this.rewardOwners) {
			try {
				const [totalReward, claimedReward] = await manager.getStateOfRewards(rewardOwner);
				const unclaimed = totalReward - claimedReward;
				if (unclaimed === 0n) {
					console.log(`No validator staking rewards for ${rewardOwner}`);
					continue;
				}
				const recipient = recipientFor(rewardOwner);
				const [claimExecutors, allowedRecipients] = await Promise.all([
					manager.claimExecutors(rewardOwner),
					manager.allowedClaimRecipients(rewardOwner),
				]);
				await assertValidatorAuthorization(
					signer.address,
					rewardOwner,
					recipient,
					[...claimExecutors],
					[...allowedRecipients],
				);

				await connected.claim.staticCall(
					rewardOwner,
					recipient,
					unclaimed,
					getConfig().wrapRewards,
				);
				console.log(`Claiming ${formatEther(unclaimed)} FLR of validator staking rewards for ${rewardOwner}`);
				const tx = await connected.claim(rewardOwner, recipient, unclaimed, getConfig().wrapRewards);
				console.log(`  submitted ${tx.hash}`);
				await tx.wait();
				console.log(`  confirmed ${tx.hash}`);
				submitted = true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Validator claim for ${rewardOwner} failed: ${message}`);
				failures.push(`${rewardOwner}: ${message}`);
			}
		}
		if (failures.length > 0) {
			throw new Error(`${failures.length} validator claim(s) failed: ${failures.join("; ")}`);
		}
		return submitted;
	}
}
