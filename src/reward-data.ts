import axios from "axios";
import { RewardsDataSchema } from "./interfaces";

export function getRewardCalculationDataPath(rewardEpochId: number) {
  const network = process.env.NETWORK;
  if (!network) {
    throw new Error("NETWORK environment variable is not set");
  }
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
  const rewardsDataPath = getRewardCalculationDataPath(rewardEpochId);
  const res = await axios.get(rewardsDataPath);
  return RewardsDataSchema.parse(res.data);
}