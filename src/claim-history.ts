import { appendFile, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { getConfig } from "./config";

const TRANSACTION_EXPLORER_BASE_URL = "https://flare-explorer.flare.network/tx";

export const CLAIM_HISTORY_COLUMNS = [
	"Date",
	"Reward Type",
	"Reward Owner Address",
	"Recipient Address",
	"Reward Epoch",
	"Reward Epoch start (if covering multiple)",
	"Reward Epoch end (if covering multiple)",
	"Amount",
	"Transaction hash",
	"Transaction link",
] as const;

export type ClaimHistoryEntry = {
	rewardType: "DIRECT" | "FEE" | "FTSO_DELEGATION" | "VALIDATOR_STAKING";
	rewardOwnerAddress: string;
	recipientAddress: string;
	rewardEpoch?: string;
	rewardEpochStart?: string;
	rewardEpochEnd?: string;
	amount: string;
	transactionHash: string;
};

type RewardEpochColumns = Pick<ClaimHistoryEntry, "rewardEpoch" | "rewardEpochStart" | "rewardEpochEnd">;

function csvValue(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function rewardEpochColumns(epochIds: readonly (bigint | number | string)[]): RewardEpochColumns {
	const epochs = [...new Set(epochIds.map((epochId) => Number(epochId)))].sort((left, right) => left - right);
	if (epochs.length === 0) {
		return { rewardEpoch: "", rewardEpochStart: "", rewardEpochEnd: "" };
	}
	if (epochs.length === 1) {
		return { rewardEpoch: String(epochs[0]), rewardEpochStart: "", rewardEpochEnd: "" };
	}
	return {
		rewardEpoch: "",
		rewardEpochStart: String(epochs[0]),
		rewardEpochEnd: String(epochs[epochs.length - 1]),
	};
}

export function claimHistoryRow(entry: ClaimHistoryEntry, date = new Date()): string {
	const values = [
		date.toISOString(),
		entry.rewardType,
		entry.rewardOwnerAddress,
		entry.recipientAddress,
		entry.rewardEpoch || "",
		entry.rewardEpochStart || "",
		entry.rewardEpochEnd || "",
		entry.amount,
		entry.transactionHash,
		`${TRANSACTION_EXPLORER_BASE_URL}/${entry.transactionHash}`,
	];
	return values.map(csvValue).join(",");
}

export async function ensureClaimHistory(outputPath = getConfig().claimHistoryCsv): Promise<void> {
	await mkdir(dirname(outputPath), { recursive: true });
	const handle = await open(outputPath, "a+");
	try {
		if ((await handle.stat()).size === 0) {
			await handle.appendFile(`${CLAIM_HISTORY_COLUMNS.map(csvValue).join(",")}\n`, "utf8");
		}
	} finally {
		await handle.close();
	}
}

export async function appendClaimHistory(
	entry: ClaimHistoryEntry,
	outputPath = getConfig().claimHistoryCsv,
	date = new Date(),
): Promise<void> {
	await ensureClaimHistory(outputPath);
	await appendFile(outputPath, `${claimHistoryRow(entry, date)}\n`, "utf8");
}

export async function recordConfirmedClaim(entry: ClaimHistoryEntry): Promise<void> {
	const outputPath = getConfig().claimHistoryCsv;
	try {
		await appendClaimHistory(entry, outputPath);
		console.log(`  recorded claim in ${outputPath}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`  WARNING: transaction confirmed but claim history could not be written: ${message}`);
		console.error(`  CSV row: ${claimHistoryRow(entry)}`);
	}
}
