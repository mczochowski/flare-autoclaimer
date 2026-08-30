import { JsonRpcProvider } from "ethers";
import {
	FlareSystemsManager__factory,
	IClaimSetupManager__factory,
	IRewardManager__factory,
	IValidatorRewardManager__factory,
} from "./types";
import { CONTRACTS, RPC } from "./configs/networks";
import { configDotenv } from "dotenv";

configDotenv();

export const provider = new JsonRpcProvider(RPC());

const contracts = CONTRACTS();
if (!contracts) {
  throw new Error("Contracts not found");
}

export const flareSystemsManager = FlareSystemsManager__factory.connect(
  contracts.FlareSystemsManager.address,
  provider
);

export const rewardManager = IRewardManager__factory.connect(
  contracts.RewardManager.address,
  provider
);

export const claimSetupManager = contracts.ClaimSetupManager
	? IClaimSetupManager__factory.connect(contracts.ClaimSetupManager.address, provider)
	: null;

export const validatorRewardManager = contracts.ValidatorRewardManager
	? IValidatorRewardManager__factory.connect(contracts.ValidatorRewardManager.address, provider)
	: null;

export function requireClaimSetupManager() {
	if (!claimSetupManager) {
		throw new Error("ClaimSetupManager is not configured for this network");
	}
	return claimSetupManager;
}

export function requireValidatorRewardManager() {
	if (!validatorRewardManager) {
		throw new Error("ValidatorRewardManager is not configured for this network");
	}
	return validatorRewardManager;
}
