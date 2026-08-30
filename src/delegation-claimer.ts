import { formatEther, hexlify } from "ethers";
import { assertFspAuthorization } from "./authorization";
import { getConfig } from "./config";
import { flareSystemsManager, requireClaimSetupManager, rewardManager } from "./contracts";
import { ClaimType } from "./interfaces";
import { designatedRecipient } from "./recipient";
import { getRewardCalculationData, getWeightBasedRewardClaims } from "./reward-data";
import type { IRewardManager } from "./types";
import { getExecutorSigner } from "./wallet";

type RewardState = Awaited<ReturnType<typeof rewardManager.getStateOfRewards>>[number][number];
type OwnerStates = {
	rewardOwner: string;
	states: RewardState[];
	delegationAccount: string | null;
	delegationAccountStates: RewardState[];
	allowedRecipients: string[];
};

const claimTypeName = (claimType: bigint) => ClaimType[Number(claimType)] || `type ${claimType}`;

function batches<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

export function flattenRewardStates<T>(groups: readonly (readonly T[])[]): T[] {
	const states: T[] = [];
	for (const group of groups) {
		states.push(...group);
	}
	return states;
}

export class DelegationClaimer {
	constructor(public readonly rewardOwners: string[]) {}

	private async statesByOwner() {
		const claimSetupManager = requireClaimSetupManager();
		return Promise.all(
			this.rewardOwners.map(async (rewardOwner): Promise<OwnerStates> => {
				const [[delegationAccount, enabled], states, allowedRecipients] = await Promise.all([
					claimSetupManager.getDelegationAccountData(rewardOwner),
					rewardManager.getStateOfRewards(rewardOwner),
					claimSetupManager.allowedClaimRecipients(rewardOwner),
				]);
				const usesDelegationAccount = enabled && delegationAccount !== "0x0000000000000000000000000000000000000000";
				const delegationAccountStates = usesDelegationAccount
					? flattenRewardStates(await rewardManager.getStateOfRewards(delegationAccount)).filter(
							(state) => Number(state.claimType) === ClaimType.WNAT,
						)
					: [];
				return {
					rewardOwner,
					states: flattenRewardStates(states),
					delegationAccount: usesDelegationAccount ? delegationAccount : null,
					delegationAccountStates,
					allowedRecipients: [...allowedRecipients],
				};
			}),
		);
	}

	async listClaimableRewards() {
		const owners = await this.statesByOwner();
		const wrapRewards = getConfig().wrapRewards.ftso;
		for (const { rewardOwner, states, delegationAccount, delegationAccountStates, allowedRecipients } of owners) {
			const allStates = [...states, ...delegationAccountStates];
			const claimable = allStates.filter((state) => state.amount > 0n);
			const recipient = delegationAccount || designatedRecipient(rewardOwner, allowedRecipients, "FTSO");
			const payoutToken = delegationAccount ? "WFLR (required by delegation-account autoClaim)" : wrapRewards ? "WFLR" : "FLR";
			if (claimable.length === 0) {
				const pending = allStates.filter((state) => !state.initialised).length;
				console.log(
					`No initialized weight-based FSP rewards for ${rewardOwner}${pending ? ` (${pending} reward states await initialization)` : ""} (recipient: ${recipient}, payout: ${payoutToken})`,
				);
				continue;
			}
			console.log(`Weight-based FSP rewards for ${rewardOwner} (recipient: ${recipient}, payout: ${payoutToken}):`);
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
		const signer = getExecutorSigner();
		const claimSetupManager = requireClaimSetupManager();
		const wrapRewards = getConfig().wrapRewards.ftso;
		const preflightStates = await this.statesByOwner();
		const eligibleOwners = new Set<string>();
		const failures: string[] = [];

		for (const { rewardOwner, delegationAccount, allowedRecipients } of preflightStates) {
			try {
				if (!(await claimSetupManager.isClaimExecutor(rewardOwner, signer.address))) {
					console.warn(`Skipping ${rewardOwner}: executor ${signer.address} is not authorized for FSP claiming`);
					continue;
				}
				if (delegationAccount) {
					if (!wrapRewards) {
						throw new Error(
							`enabled delegation account ${delegationAccount} requires FTSO_WRAP_REWARDS=true because autoClaim always pays WFLR`,
						);
					}
				} else {
					const recipient = designatedRecipient(rewardOwner, allowedRecipients, "FTSO");
					await assertFspAuthorization(signer.address, rewardOwner, recipient);
				}
				eligibleOwners.add(rewardOwner.toLowerCase());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`FTSO claim preflight for ${rewardOwner} failed: ${message}`);
				failures.push(`${rewardOwner}: ${message}`);
			}
		}

		if (eligibleOwners.size === 0) {
			if (failures.length > 0) {
				throw new Error(`${failures.length} FTSO claim(s) failed preflight: ${failures.join("; ")}`);
			}
			console.log("No eligible FTSO reward owners");
			return false;
		}

		await this.initialiseMissingWeightBasedClaims();
		const ownerStates = await this.statesByOwner();
		const [, endEpoch] = await rewardManager.getRewardEpochIdsWithClaimableRewards();
		const connected = rewardManager.connect(signer);
		const proofs: IRewardManager.RewardClaimWithProofStruct[] = [];
		let submitted = false;

		for (const { rewardOwner, states, delegationAccount, delegationAccountStates, allowedRecipients } of ownerStates) {
			if (!eligibleOwners.has(rewardOwner.toLowerCase())) {
				continue;
			}
			try {
				const amount = [...states, ...delegationAccountStates].reduce((sum, state) => sum + state.amount, 0n);
				if (amount === 0n) {
					console.log(`No claimable weight-based FSP rewards for ${rewardOwner}`);
					continue;
				}
				if (delegationAccount) {
					const [, executorFee] = await claimSetupManager.getAutoClaimAddressesAndExecutorFee(signer.address, [rewardOwner]);
					if (amount < executorFee) {
						console.warn(
							`Skipping ${rewardOwner}: ${formatEther(amount)} FLR is below executor fee ${formatEther(executorFee)} FLR`,
						);
						continue;
					}
					await connected.autoClaim.staticCall([rewardOwner], endEpoch, proofs);
					console.log(
						`Claiming ${formatEther(amount)} FLR of weight-based FSP rewards for ${rewardOwner} to delegation account ${delegationAccount} as WFLR`,
					);
					const tx = await connected.autoClaim([rewardOwner], endEpoch, proofs);
					console.log(`  submitted ${tx.hash}`);
					await tx.wait();
					console.log(`  confirmed ${tx.hash}`);
					submitted = true;
					continue;
				}

				const recipient = designatedRecipient(rewardOwner, allowedRecipients, "FTSO");
				await connected.claim.staticCall(rewardOwner, recipient, endEpoch, wrapRewards, proofs);
				console.log(
					`Claiming ${formatEther(amount)} FLR of weight-based FSP rewards for ${rewardOwner} to ${recipient} as ${wrapRewards ? "WFLR" : "FLR"}`,
				);
				const tx = await connected.claim(rewardOwner, recipient, endEpoch, wrapRewards, proofs);
				console.log(`  submitted ${tx.hash}`);
				await tx.wait();
				console.log(`  confirmed ${tx.hash}`);
				submitted = true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`FTSO claim for ${rewardOwner} failed: ${message}`);
				failures.push(`${rewardOwner}: ${message}`);
			}
		}

		if (failures.length > 0) {
			throw new Error(`${failures.length} FTSO claim(s) failed: ${failures.join("; ")}`);
		}
		return submitted;
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
					`Epoch ${epoch} still has only ${finalCount}/${totalCount} initialized weight-based claims; refusing to claim`,
				);
			}
		}
	}
}
