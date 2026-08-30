import { requireClaimSetupManager } from "./contracts";

const sameAddress = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export async function assertFspAuthorization(executor: string, rewardOwner: string, recipient: string) {
	if (sameAddress(executor, rewardOwner)) {
		return;
	}
	const manager = requireClaimSetupManager();
	if (!(await manager.isClaimExecutor(rewardOwner, executor))) {
		throw new Error(`${executor} is not an authorized FSP claim executor for ${rewardOwner}`);
	}
	if (sameAddress(recipient, rewardOwner)) {
		return;
	}
	const recipients = await manager.allowedClaimRecipients(rewardOwner);
	if (!recipients.some((allowed) => sameAddress(allowed, recipient))) {
		throw new Error(`${recipient} is not an allowed FSP claim recipient for ${rewardOwner}`);
	}
}

export async function assertValidatorAuthorization(
	executor: string,
	rewardOwner: string,
	recipient: string,
	claimExecutors: string[],
	allowedRecipients: string[],
) {
	if (sameAddress(executor, rewardOwner)) {
		return;
	}
	if (!claimExecutors.some((allowed) => sameAddress(allowed, executor))) {
		throw new Error(`${executor} is not an authorized validator reward executor for ${rewardOwner}`);
	}
	if (sameAddress(recipient, rewardOwner)) {
		return;
	}
	if (!allowedRecipients.some((allowed) => sameAddress(allowed, recipient))) {
		throw new Error(`${recipient} is not an allowed validator reward recipient for ${rewardOwner}`);
	}
}
