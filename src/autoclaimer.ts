import { Claimer } from "./claimer";
import { ensureClaimHistory } from "./claim-history";
import { getConfig } from "./config";
import { DelegationClaimer } from "./delegation-claimer";
import { ClaimType } from "./interfaces";
import { ValidatorClaimer } from "./validator-claimer";

export const claimCategories = ["direct", "fee", "ftso", "validator"] as const;
export type ClaimCategory = (typeof claimCategories)[number];

function includes(categories: ClaimCategory[], category: ClaimCategory) {
	return categories.includes(category);
}

async function captureFailure(label: string, operation: () => Promise<unknown>, failures: string[]) {
	try {
		await operation();
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${label} failed: ${message}`);
		failures.push(`${label}: ${message}`);
		return false;
	}
}

export async function listConfiguredRewards(categories: ClaimCategory[]) {
	const config = getConfig();
	const failures: string[] = [];
	if (includes(categories, "direct")) {
		for (const beneficiary of config.directBeneficiaries) {
			const claimer = new Claimer(ClaimType.DIRECT, beneficiary);
			await captureFailure(`DIRECT ${beneficiary}`, () => claimer.listClaimableRewards(), failures);
		}
	}
	if (includes(categories, "fee")) {
		for (const beneficiary of config.feeBeneficiaries) {
			const claimer = new Claimer(ClaimType.FEE, beneficiary);
			await captureFailure(`FEE ${beneficiary}`, () => claimer.listClaimableRewards(), failures);
		}
	}
	if (includes(categories, "ftso")) {
		const claimer = new DelegationClaimer(config.ftsoRewardOwners);
		await captureFailure("weight-based FSP rewards", () => claimer.listClaimableRewards(), failures);
	}
	if (includes(categories, "validator")) {
		const claimer = new ValidatorClaimer(config.validatorRewardOwners);
		await captureFailure("validator staking rewards", () => claimer.listClaimableRewards(), failures);
	}
	return failures;
}

export async function claimConfiguredRewards(categories: ClaimCategory[], epoch?: number) {
	await ensureClaimHistory();
	const config = getConfig();
	const failures: string[] = [];
	let ftsoSucceeded = true;
	if (includes(categories, "ftso")) {
		const claimer = new DelegationClaimer(config.ftsoRewardOwners);
		ftsoSucceeded = await captureFailure(
			"weight-based FSP rewards",
			() => claimer.claimAllUnclaimedRewards(),
			failures,
		);
	}
	if (includes(categories, "direct") && ftsoSucceeded) {
		for (const beneficiary of config.directBeneficiaries) {
			const claimer = new Claimer(ClaimType.DIRECT, beneficiary);
			await captureFailure(
				`DIRECT ${beneficiary}`,
				() => (epoch === undefined ? claimer.claimAllUnclaimedRewards() : claimer.claimRewards(epoch)),
				failures,
			);
		}
	}
	if (includes(categories, "fee") && ftsoSucceeded) {
		for (const beneficiary of config.feeBeneficiaries) {
			const claimer = new Claimer(ClaimType.FEE, beneficiary);
			await captureFailure(
				`FEE ${beneficiary}`,
				() => (epoch === undefined ? claimer.claimAllUnclaimedRewards() : claimer.claimRewards(epoch)),
				failures,
			);
		}
	}
	if (!ftsoSucceeded && (includes(categories, "direct") || includes(categories, "fee"))) {
		console.error("Skipping DIRECT and FEE claims because FTSO claiming failed; this prevents misrouting weight-based rewards");
	}
	if (includes(categories, "validator")) {
		const claimer = new ValidatorClaimer(config.validatorRewardOwners);
		await captureFailure("validator staking rewards", () => claimer.claimAllUnclaimedRewards(), failures);
	}
	return failures;
}
