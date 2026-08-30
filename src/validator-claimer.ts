import { formatEther } from "ethers";
import { assertValidatorAuthorization } from "./authorization";
import { recordConfirmedClaim } from "./claim-history";
import { getConfig } from "./config";
import { requireValidatorRewardManager } from "./contracts";
import { designatedRecipient } from "./recipient";
import { getExecutorSigner } from "./wallet";

export function designatedValidatorRecipient(rewardOwner: string, allowedRecipients: readonly string[]): string {
	return designatedRecipient(rewardOwner, allowedRecipients, "validator");
}

export class ValidatorClaimer {
	constructor(public readonly rewardOwners: string[]) {}

	async listClaimableRewards() {
		const manager = requireValidatorRewardManager();
		const payoutToken = getConfig().wrapRewards.validator ? "WFLR" : "FLR";
		for (const rewardOwner of this.rewardOwners) {
			const [[totalReward, claimedReward], allowedRecipients] = await Promise.all([
				manager.getStateOfRewards(rewardOwner),
				manager.allowedClaimRecipients(rewardOwner),
			]);
			const unclaimed = totalReward - claimedReward;
			const recipient = designatedValidatorRecipient(rewardOwner, [...allowedRecipients]);
			console.log(
				`Validator staking rewards for ${rewardOwner}: ${formatEther(unclaimed)} FLR (recipient: ${recipient}, payout: ${payoutToken})`,
			);
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
		const wrapRewards = getConfig().wrapRewards.validator;
		let submitted = false;
		const failures: string[] = [];

		for (const rewardOwner of this.rewardOwners) {
			try {
				const [[totalReward, claimedReward], claimExecutors, allowedRecipients] = await Promise.all([
					manager.getStateOfRewards(rewardOwner),
					manager.claimExecutors(rewardOwner),
					manager.allowedClaimRecipients(rewardOwner),
				]);
				const unclaimed = totalReward - claimedReward;
				if (unclaimed === 0n) {
					console.log(`No validator staking rewards for ${rewardOwner}`);
					continue;
				}
				const recipient = designatedValidatorRecipient(rewardOwner, [...allowedRecipients]);
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
					wrapRewards,
				);
				console.log(
					`Claiming ${formatEther(unclaimed)} FLR of validator staking rewards for ${rewardOwner} to ${recipient} as ${wrapRewards ? "WFLR" : "FLR"}`,
				);
				const tx = await connected.claim(rewardOwner, recipient, unclaimed, wrapRewards);
				console.log(`  submitted ${tx.hash}`);
				await tx.wait();
				console.log(`  confirmed ${tx.hash}`);
				await recordConfirmedClaim({
					rewardType: "VALIDATOR_STAKING",
					rewardOwnerAddress: rewardOwner,
					recipientAddress: recipient,
					amount: formatEther(unclaimed),
					transactionHash: tx.hash,
				});
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
