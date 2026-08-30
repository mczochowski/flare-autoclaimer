import axios from "axios";
import { ClaimType, RewardsData, RewardsDataSchema } from "./interfaces";
import type { IRewardManager } from "./types";

const rewardDataCache = new Map<number, Promise<RewardsData>>();

export function getRewardCalculationDataPath(rewardEpochId: number) {
  const network = process.env.NETWORK || "flare";
  switch (network) {
    case "coston2":
      return `https://gitlab.com/timivesel/ftsov2-testnet-rewards/-/raw/main/rewards-data/coston2/${rewardEpochId}/reward-distribution-data-tuples.json`;
    case "coston":
      return `https://gitlab.com/timivesel/ftsov2-testnet-rewards/-/raw/main/rewards-data/coston/${rewardEpochId}/reward-distribution-data-tuples.json`;
    case "songbird":
      return `https://raw.githubusercontent.com/flare-foundation/fsp-rewards/refs/heads/main/songbird/${rewardEpochId}/reward-distribution-data-tuples.json`;
    case "flare":
      return `https://raw.githubusercontent.com/flare-foundation/fsp-rewards/refs/heads/main/flare/${rewardEpochId}/reward-distribution-data-tuples.json`;
    default:
      throw new Error("Network not supported");
  }
}

// Throws on any fetch/parse failure. A successful return means the epoch's
// reward data definitively exists — callers may safely treat a missing claim
// tuple in it as "no rewards for this epoch".
export const getRewardCalculationData = async (rewardEpochId: number) => {
	let request = rewardDataCache.get(rewardEpochId);
	if (!request) {
		request = axios
			.get(getRewardCalculationDataPath(rewardEpochId))
			.then((response) => RewardsDataSchema.parse(response.data));
		rewardDataCache.set(rewardEpochId, request);
		request.catch(() => rewardDataCache.delete(rewardEpochId));
	}
	return request;
};

export function toRewardClaimWithProof(
	entry: RewardsData["rewardClaims"][number],
): IRewardManager.RewardClaimWithProofStruct {
	const [merkleProof, [rewardEpochId, beneficiary, amount, claimType]] = entry;
	return {
		merkleProof,
		body: {
			rewardEpochId: BigInt(rewardEpochId),
			beneficiary,
			amount: BigInt(amount),
			claimType: BigInt(claimType),
		},
	};
}

export function findRewardClaim(
	rewardsData: RewardsData,
	beneficiary: string,
	claimType: ClaimType,
): IRewardManager.RewardClaimWithProofStruct | null {
	const entry = rewardsData.rewardClaims.find(
		([, [, address, , type]]) =>
			address.toLowerCase() === beneficiary.toLowerCase() && type === claimType,
	);
	return entry ? toRewardClaimWithProof(entry) : null;
}

export function getWeightBasedRewardClaims(rewardsData: RewardsData) {
	return rewardsData.rewardClaims
		.filter(([, [, , , claimType]]) => claimType >= ClaimType.WNAT)
		.map(toRewardClaimWithProof);
}
