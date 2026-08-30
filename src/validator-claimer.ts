import { formatEther } from "ethers";
import { assertValidatorAuthorization } from "./authorization";
import { getConfig } from "./config";
import { requireValidatorRewardManager } from "./contracts";
import { getExecutorSigner } from "./wallet";

const sameAddress = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export function designatedValidatorRecipient(rewardOwner: string, allowedRecipients: readonly string[]): string {
	const recipientsByAddress = new Map<string, string>();
	for (const recipient of allowedRecipients) {
		if (!sameAddress(recipient, rewardOwner) && !recipientsByAddress.has(recipient.toLowerCase())) {
			recipientsByAddress.set(recipient.toLowerCase(), recipient);
		}
	}
	const designatedRecipients = [...recipientsByAddress.values()];
	if (designatedRecipients.length === 0) {
		return rewardOwner;
	}
	if (designatedRecipients.length === 1) {
		return designatedRecipients[0];
	}
	throw new Error(
		`${rewardOwner} has multiple designated validator claim recipients; refusing to choose: ${designatedRecipients.join(", ")}`,
	);
}

export class ValidatorClaimer {
	constructor(public readonly rewardOwners: string[]) {}

	async listClaimableRewards() {
		const manager = requireValidatorRewardManager();
		for (const rewardOwner of this.rewardOwners) {
			const [[totalReward, claimedReward], allowedRecipients] = await Promise.all([
				manager.getStateOfRewards(rewardOwner),
				manager.allowedClaimRecipients(rewardOwner),
			]);
			const unclaimed = totalReward - claimedReward;
			const recipient = designatedValidatorRecipient(rewardOwner, [...allowedRecipients]);
			console.log(
				`Validator staking rewards for ${rewardOwner}: ${formatEther(unclaimed)} FLR (recipient: ${recipient})`,
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
					getConfig().wrapRewards,
				);
				console.log(
					`Claiming ${formatEther(unclaimed)} FLR of validator staking rewards for ${rewardOwner} to ${recipient}`,
				);
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
