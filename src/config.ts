import { configDotenv } from "dotenv";
import { getAddress } from "ethers";

configDotenv();

export type AddressListName =
	| "REWARD_OWNER_ADDRESSES"
	| "DIRECT_BENEFICIARY_ADDRESSES"
	| "FEE_BENEFICIARY_ADDRESSES"
	| "FTSO_REWARD_OWNER_ADDRESSES"
	| "VALIDATOR_REWARD_OWNER_ADDRESSES";

function parseAddress(value: string, name: string): string {
	try {
		return getAddress(value.trim());
	} catch {
		throw new Error(`${name} contains an invalid address: ${value}`);
	}
}

export function parseAddressList(value: string | undefined, name: AddressListName): string[] {
	if (!value?.trim()) {
		return [];
	}
	const addresses = value
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((address) => parseAddress(address, name));
	return [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()];
}

function categoryAddresses(name: Exclude<AddressListName, "REWARD_OWNER_ADDRESSES">, fallback: string[]): string[] {
	const configured = parseAddressList(process.env[name], name);
	return configured.length > 0 ? configured : fallback;
}

function positiveInteger(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

export function getConfig() {
	const rewardOwners = parseAddressList(process.env.REWARD_OWNER_ADDRESSES, "REWARD_OWNER_ADDRESSES");
	const recipient = process.env.CLAIM_RECIPIENT_ADDRESS?.trim();
	const expectedExecutor = process.env.CLAIM_EXECUTOR_ADDRESS?.trim();

	return {
		rewardOwners,
		directBeneficiaries: categoryAddresses("DIRECT_BENEFICIARY_ADDRESSES", rewardOwners),
		feeBeneficiaries: categoryAddresses("FEE_BENEFICIARY_ADDRESSES", rewardOwners),
		ftsoRewardOwners: categoryAddresses("FTSO_REWARD_OWNER_ADDRESSES", rewardOwners),
		validatorRewardOwners: categoryAddresses("VALIDATOR_REWARD_OWNER_ADDRESSES", rewardOwners),
		directAndFeeClaimRecipient: recipient ? parseAddress(recipient, "CLAIM_RECIPIENT_ADDRESS") : null,
		expectedExecutor: expectedExecutor ? parseAddress(expectedExecutor, "CLAIM_EXECUTOR_ADDRESS") : null,
		wrapRewards: process.env.WRAP_REWARDS?.toLowerCase() !== "false",
		pollIntervalMs: positiveInteger("POLL_INTERVAL_MINUTES", 12) * 60 * 1000,
		maxProofsPerTransaction: positiveInteger("MAX_PROOFS_PER_TRANSACTION", 40),
	};
}

export function directOrFeeRecipientFor(rewardOwner: string): string {
	return getConfig().directAndFeeClaimRecipient || rewardOwner;
}
