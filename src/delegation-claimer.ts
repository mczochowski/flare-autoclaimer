import { formatEther, hexlify } from "ethers";
import { getConfig } from "./config";
import { flareSystemsManager, requireClaimSetupManager, rewardManager } from "./contracts";
import { ClaimType } from "./interfaces";
import { getRewardCalculationData, getWeightBasedRewardClaims } from "./reward-data";
import type { IRewardManager } from "./types";
import { getExecutorSigner } from "./wallet";

type RewardState = Awaited<ReturnType<typeof rewardManager.getStateOfRewards>>[number][number];
type OwnerStates = {
	rewardOwner: string;
	states: RewardState[];
	delegationAccount: string | null;
	delegationAccountStates: RewardState[];
};

const claimTypeName = (claimType: bigint) => ClaimType[Number(claimType)] || `type ${claimType}`;

function batches<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

export class DelegationClaimer {
	constructor(public readonly rewardOwners: string[]) {}

	private async statesByOwner() {
		const claimSetupManager = requireClaimSetupManager();
		return Promise.all(
			this.rewardOwners.map(async (rewardOwner): Promise<OwnerStates> => {
				const [[delegationAccount, enabled], states] = await Promise.all([
					claimSetupManager.getDelegationAccountData(rewardOwner),
					rewardManager.getStateOfRewards(rewardOwner),
				]);
				const usesDelegationAccount = enabled && delegationAccount !== "0x0000000000000000000000000000000000000000";
				const delegationAccountStates = usesDelegationAccount
					? (await rewardManager.getStateOfRewards(delegationAccount))
							.flat()
							.filter((state) => Number(state.claimType) === ClaimType.WNAT)
					: [];
				return {
					rewardOwner,
					states: states.flat(),
					delegationAccount: usesDelegationAccount ? delegationAccount : null,
					delegationAccountStates,
				};
			}),
		);
	}

	async listClaimableRewards() {
		const owners = await this.statesByOwner();
		for (const { rewardOwner, states, delegationAccount, delegationAccountStates } of owners) {
			const allStates = [...states, ...delegationAccountStates];
			const claimable = allStates.filter((state) => state.amount > 0n);
			if (claimable.length === 0) {
				const pending = allStates.filter((state) => !state.initialised).length;
				console.log(
					`No initialized weight-based FSP rewards for ${rewardOwner}${pending ? ` (${pending} reward states await initialization)` : ""}`,
				);
				continue;
			}
			console.log(`Weight-based FSP rewards for ${rewardOwner}:`);
			if (delegationAccount) {
				console.log(`  delegation account: ${delegationAccount}`);
			}
			for (const state of claimable) {
				console.log(
					`  epoch ${state.rewardEpochId} ${claimTypeName(state.claimType)}: ${formatEther(state.amount)} FLR`,
				);
			}
		}
	}

	async claimAllUnclaimedRewards() {
		if (this.rewardOwners.length === 0) {
			console.log("No FTSO reward owners configured");
			return false;
		}
		await this.initialiseMissingWeightBasedClaims();

		const signer = getExecutorSigner();
		const claimSetupManager = requireClaimSetupManager();
		const ownerStates = await this.statesByOwner();
		const eligibleOwners: string[] = [];
		let totalClaimable = 0n;

		for (const { rewardOwner, states, delegationAccountStates } of ownerStates) {
			if (!(await claimSetupManager.isClaimExecutor(rewardOwner, signer.address))) {
				console.warn(`Skipping ${rewardOwner}: executor ${signer.address} is not authorized for FSP autoclaiming`);
				continue;
			}
			const [, executorFee] = await claimSetupManager.getAutoClaimAddressesAndExecutorFee(signer.address, [rewardOwner]);
			const amount = [...states, ...delegationAccountStates].reduce((sum, state) => sum + state.amount, 0n);
			if (amount === 0n) {
				continue;
			}
			if (amount < executorFee) {
				console.warn(
					`Skipping ${rewardOwner}: ${formatEther(amount)} FLR is below executor fee ${formatEther(executorFee)} FLR`,
				);
				continue;
			}
			eligibleOwners.push(rewardOwner);
			totalClaimable += amount;
		}

		if (eligibleOwners.length === 0) {
			console.log("No claimable weight-based FSP rewards");
			return false;
		}

		const [, endEpoch] = await rewardManager.getRewardEpochIdsWithClaimableRewards();
		const connected = rewardManager.connect(signer);
		// Initialization is complete, so no Merkle proofs are needed in the
		// autoClaim call itself. This keeps calldata and gas bounded.
		const proofs: IRewardManager.RewardClaimWithProofStruct[] = [];
		await connected.autoClaim.staticCall(eligibleOwners, endEpoch, proofs);
		console.log(
			`Claiming ${formatEther(totalClaimable)} FLR of weight-based FSP rewards for ${eligibleOwners.length} owners through epoch ${endEpoch}`,
		);
		const tx = await connected.autoClaim(eligibleOwners, endEpoch, proofs);
		console.log(`  submitted ${tx.hash}`);
		await tx.wait();
		console.log(`  confirmed ${tx.hash}`);
		return true;
	}

	private async initialiseMissingWeightBasedClaims() {
		const [startEpoch, endEpoch] = await rewardManager.getRewardEpochIdsWithClaimableRewards();
		const rewardManagerId = await rewardManager.rewardManagerId();
		const signer = getExecutorSigner();
		const connected = rewardManager.connect(signer);

		for (let epoch = Number(startEpoch); epoch <= Number(endEpoch); epoch++) {
			const [initialisedCount, totalCount] = await Promise.all([
				rewardManager.noOfInitialisedWeightBasedClaims(epoch),
				flareSystemsManager.noOfWeightBasedClaims(epoch, rewardManagerId),
			]);
			if (initialisedCount >= totalCount) {
				continue;
			}

			const rewardData = await getRewardCalculationData(epoch);
			const weightClaims = getWeightBasedRewardClaims(rewardData);
			const missing: IRewardManager.RewardClaimWithProofStruct[] = [];
			for (const group of batches(weightClaims, 25)) {
				const states = await Promise.all(
					group.map((claim) =>
						rewardManager.getUnclaimedRewardState(
							hexlify(claim.body.beneficiary),
							claim.body.rewardEpochId,
							claim.body.claimType,
						),
					),
				);
				for (let index = 0; index < group.length; index++) {
					if (!states[index].initialised) {
						missing.push(group[index]);
					}
				}
			}

			if (missing.length === 0) {
				continue;
			}
			console.log(`Initializing ${missing.length} weight-based FSP claims for epoch ${epoch}`);
			for (const proofBatch of batches(missing, getConfig().maxProofsPerTransaction)) {
				await connected.initialiseWeightBasedClaims.staticCall(proofBatch);
				const tx = await connected.initialiseWeightBasedClaims(proofBatch);
				console.log(`  submitted initialization ${tx.hash}`);
				await tx.wait();
				console.log(`  confirmed initialization ${tx.hash}`);
			}

			const finalCount = await rewardManager.noOfInitialisedWeightBasedClaims(epoch);
			if (finalCount < totalCount) {
				throw new Error(
					`Epoch ${epoch} still has only ${finalCount}/${totalCount} initialized weight-based claims; refusing to autoclaim`,
				);
			}
		}
	}
}
