import { formatEther } from "ethers";
import { assertFspAuthorization } from "./authorization";
import { directOrFeeRecipientFor, getConfig } from "./config";
import { ZERO_BYTES32 } from "./configs/networks";
import { flareSystemsManager, rewardManager } from "./contracts";
import { ClaimType } from "./interfaces";
import { findRewardClaim, getRewardCalculationData } from "./reward-data";
import type { IRewardManager } from "./types";
import { getExecutorSigner } from "./wallet";

export class Claimer {
	constructor(
		public readonly claimType: ClaimType.DIRECT | ClaimType.FEE,
		public readonly beneficiary: string,
	) {}

	get recipientAddress(): string {
		return directOrFeeRecipientFor(this.beneficiary);
	}

	get wrapRewards(): boolean {
		const wrapRewards = getConfig().wrapRewards;
		return this.claimType === ClaimType.DIRECT ? wrapRewards.direct : wrapRewards.fee;
	}

	async getRewardEpochIdsWithClaimableRewards(): Promise<number[] | null> {
		const [startRewardEpochId, endRewardEpochId] = await this.getClaimableRewardEpochIdRange();
		if (endRewardEpochId < startRewardEpochId) {
			return null;
		}
		const claimableRewardEpochIds: number[] = [];
		for (let epochId = startRewardEpochId; epochId <= endRewardEpochId; epochId++) {
			const rewardsHash = await flareSystemsManager.rewardsHash(epochId);
			if (rewardsHash && rewardsHash !== ZERO_BYTES32) {
				claimableRewardEpochIds.push(epochId);
			}
		}
		return claimableRewardEpochIds.length > 0 ? claimableRewardEpochIds : null;
	}

	async getRewardClaimData(rewardEpochId: number) {
		const rewardsData = await getRewardCalculationData(rewardEpochId);
		return findRewardClaim(rewardsData, this.beneficiary, this.claimType);
	}

	async getRewardClaimWithProofStructs() {
		const claimableRewardEpochIds = await this.getRewardEpochIdsWithClaimableRewards();
		if (!claimableRewardEpochIds?.length) {
			return [];
		}
		const claims: IRewardManager.RewardClaimWithProofStruct[] = [];
		for (const epochId of claimableRewardEpochIds) {
			try {
				const rewardClaimData = await this.getRewardClaimData(epochId);
				if (rewardClaimData) {
					claims.push(rewardClaimData);
				}
			} catch (error) {
				// RewardManager advances the owner's claim cursor to the requested
				// epoch. Never claim past distribution data that we could not verify.
				throw new Error(
					`Failed to fetch ${ClaimType[this.claimType]} reward data for epoch ${epochId}; refusing to advance: ${error}`,
				);
			}
		}
		return claims;
	}

	async listClaimableRewards() {
		const claims = await this.getRewardClaimWithProofStructs();
		if (claims.length === 0) {
			console.log(`No claimable ${ClaimType[this.claimType]} rewards for ${this.beneficiary}`);
			return;
		}
		console.log(
			`${ClaimType[this.claimType]} rewards for ${this.beneficiary} (recipient: ${this.recipientAddress}, payout: ${this.wrapRewards ? "WFLR" : "FLR"}):`,
		);
		for (const { body } of claims) {
			console.log(`  epoch ${body.rewardEpochId}: ${formatEther(body.amount)} FLR`);
		}
	}

	async claimAllUnclaimedRewards() {
		const claims = await this.getRewardClaimWithProofStructs();
		if (claims.length === 0) {
			console.log(`No claimable ${ClaimType[this.claimType]} rewards for ${this.beneficiary}`);
			return false;
		}
		const signer = getExecutorSigner();
		await assertFspAuthorization(signer.address, this.beneficiary, this.recipientAddress);
		const lastEpochIdToClaim = claims[claims.length - 1].body.rewardEpochId;
		const connected = rewardManager.connect(signer);

		console.log(
			`Claiming ${ClaimType[this.claimType]} rewards for ${this.beneficiary} through epoch ${lastEpochIdToClaim} to ${this.recipientAddress} as ${this.wrapRewards ? "WFLR" : "FLR"}`,
		);
		await connected.claim.staticCall(
			this.beneficiary,
			this.recipientAddress,
			lastEpochIdToClaim,
			this.wrapRewards,
			claims,
		);
		const tx = await connected.claim(
			this.beneficiary,
			this.recipientAddress,
			lastEpochIdToClaim,
			this.wrapRewards,
			claims,
		);
		console.log(`  submitted ${tx.hash}`);
		await tx.wait();
		console.log(`  confirmed ${tx.hash}`);
		return true;
	}

	async claimRewards(epochId: number) {
		const [startRewardEpochId, endRewardEpochId] = await this.getClaimableRewardEpochIdRange();
		if (epochId < startRewardEpochId) {
			console.log(`Epoch ${epochId} was already claimed or has expired for ${this.beneficiary}`);
			return false;
		}
		if (epochId > endRewardEpochId) {
			console.log(`Epoch ${epochId} is not claimable yet`);
			return false;
		}
		const claim = await this.getRewardClaimData(epochId);
		if (!claim) {
			console.log(`No ${ClaimType[this.claimType]} reward for ${this.beneficiary} in epoch ${epochId}`);
			return false;
		}
		const signer = getExecutorSigner();
		await assertFspAuthorization(signer.address, this.beneficiary, this.recipientAddress);
		const connected = rewardManager.connect(signer);
		const claims = [claim];
		await connected.claim.staticCall(
			this.beneficiary,
			this.recipientAddress,
			epochId,
			this.wrapRewards,
			claims,
		);
		const tx = await connected.claim(
			this.beneficiary,
			this.recipientAddress,
			epochId,
			this.wrapRewards,
			claims,
		);
		console.log(`Submitted ${ClaimType[this.claimType]} epoch ${epochId}: ${tx.hash}`);
		await tx.wait();
		console.log(`Confirmed ${tx.hash}`);
		return true;
	}

	private async getClaimableRewardEpochIdRange(): Promise<[number, number]> {
		const start = await rewardManager.getNextClaimableRewardEpochId(this.beneficiary);
		const [, end] = await rewardManager.getRewardEpochIdsWithClaimableRewards();
		return [Number(start), Number(end)];
	}
}
