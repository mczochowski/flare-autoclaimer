import * as dotenv from "dotenv";
import type { NetworkContractAddresses } from "./contracts";

dotenv.config();

const COSTON_CONFIG: NetworkContractAddresses = {
	FlareSystemsManager: { name: "FlareSystemsManager", address: "0x85680Dd93755Fe5d0789773fd0896cEE51F9e358" },
	RewardManager: { name: "RewardManager", address: "0xA17197b7Bdff7Be7c3Da39ec08981FB716B70d3A" },
};

const COSTON2_CONFIG: NetworkContractAddresses = {
	FlareSystemsManager: { name: "FlareSystemsManager", address: "0xbC1F76CEB521Eb5484b8943B5462D08ea96617A1" },
	RewardManager: { name: "RewardManager", address: "0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454" },
};

const SONGBIRD_CONFIG: NetworkContractAddresses = {
	FlareSystemsManager: { name: "FlareSystemsManager", address: "0x421c69E22f48e14Fc2d2Ee3812c59bfb81c38516" },
	RewardManager: { name: "RewardManager", address: "0xE26AD68b17224951b5740F33926Cc438764eB9a7" },
	ClaimSetupManager: { name: "ClaimSetupManager", address: "0xDD138B38d87b0F95F6c3e13e78FFDF2588F1732d" },
};

const FLARE_CONFIG: NetworkContractAddresses = {
	FlareSystemsManager: { name: "FlareSystemsManager", address: "0x89e50DC0380e597ecE79c8494bAAFD84537AD0D4" },
	RewardManager: { name: "RewardManager", address: "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B" },
	ClaimSetupManager: { name: "ClaimSetupManager", address: "0xD56c0Ea37B848939B59e6F5Cda119b3fA473b5eB" },
	ValidatorRewardManager: { name: "ValidatorRewardManager", address: "0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5" },
};

const COSTON_RPC = "https://coston-api.flare.network/ext/bc/C/rpc";
const COSTON2_RPC = "https://coston2-api.flare.network/ext/bc/C/rpc";
const SONGBIRD_RPC = "https://songbird-api.flare.network/ext/bc/C/rpc";
const FLARE_RPC = "https://flare-api.flare.network/ext/bc/C/rpc";

export type networks = "coston2" | "coston" | "songbird" | "flare";

const withOverrides = (config: NetworkContractAddresses): NetworkContractAddresses => ({
	...config,
	FlareSystemsManager: {
		...config.FlareSystemsManager,
		address: process.env.FLARE_SYSTEMS_MANAGER_ADDRESS || config.FlareSystemsManager.address,
	},
	RewardManager: {
		...config.RewardManager,
		address: process.env.REWARD_MANAGER_ADDRESS || config.RewardManager.address,
	},
	...(process.env.CLAIM_SETUP_MANAGER_ADDRESS || config.ClaimSetupManager
		? {
				ClaimSetupManager: {
					name: "ClaimSetupManager" as const,
					address: process.env.CLAIM_SETUP_MANAGER_ADDRESS || config.ClaimSetupManager!.address,
				},
			}
		: {}),
	...(process.env.VALIDATOR_REWARD_MANAGER_ADDRESS || config.ValidatorRewardManager
		? {
				ValidatorRewardManager: {
					name: "ValidatorRewardManager" as const,
					address: process.env.VALIDATOR_REWARD_MANAGER_ADDRESS || config.ValidatorRewardManager!.address,
				},
			}
		: {}),
});

const contracts = () => {
	const network = (process.env.NETWORK || "flare") as networks;
	switch (network) {
		case "coston2":
			return withOverrides(COSTON2_CONFIG);
		case "coston":
			return withOverrides(COSTON_CONFIG);
		case "songbird":
			return withOverrides(SONGBIRD_CONFIG);
		case "flare":
			return withOverrides(FLARE_CONFIG);
		default:
			((_: never): void => {})(network);
	}
};

const rpc = () => {
	const network = (process.env.NETWORK || "flare") as networks;
	switch (network) {
		case "coston2":
			return process.env.COSTON2_RPC || COSTON2_RPC;
		case "coston":
			return process.env.COSTON_RPC || COSTON_RPC;
		case "songbird":
			return process.env.SONGBIRD_RPC || SONGBIRD_RPC;
		case "flare":
			return process.env.FLARE_RPC || FLARE_RPC;
		default:
			((_: never): void => {})(network);
	}
};

export const CONTRACTS = () => contracts();
export const RPC = () => rpc();

export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
