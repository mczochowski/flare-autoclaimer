import { Wallet } from "ethers";
import { getConfig } from "./config";
import { provider } from "./contracts";

let executorSigner: Wallet | null = null;

export function getExecutorSigner(): Wallet {
	if (executorSigner) {
		return executorSigner;
	}
	const privateKey = process.env.CLAIM_EXECUTOR_PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("CLAIM_EXECUTOR_PRIVATE_KEY environment variable is not set");
	}
	const signer = new Wallet(privateKey, provider);
	const expectedAddress = getConfig().expectedExecutor;
	if (expectedAddress && signer.address.toLowerCase() !== expectedAddress.toLowerCase()) {
		throw new Error(
			`CLAIM_EXECUTOR_PRIVATE_KEY resolves to ${signer.address}, not configured CLAIM_EXECUTOR_ADDRESS ${expectedAddress}`,
		);
	}
	executorSigner = signer;
	return signer;
}
