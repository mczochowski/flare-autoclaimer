import { Command } from "commander";
import { z } from "zod";
import {
	ClaimCategory,
	claimCategories,
	claimConfiguredRewards,
	listConfiguredRewards,
} from "./autoclaimer";

const program = new Command();
const categorySchema = z.enum(claimCategories);
const epochSchema = z.coerce.number().int().nonnegative();

function categoriesFrom(value: string | undefined): ClaimCategory[] {
	if (!value) {
		return [...claimCategories];
	}
	const result = categorySchema.safeParse(value.toLowerCase());
	if (!result.success) {
		throw new Error(`Invalid type. Expected one of: ${claimCategories.join(", ")}`);
	}
	return [result.data];
}

function epochFrom(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const result = epochSchema.safeParse(value);
	if (!result.success) {
		throw new Error("Epoch must be a non-negative integer");
	}
	return result.data;
}

program.name("flare-autoclaimer").description("Claim Flare FSP and validator staking rewards").version("1.0.0");

program
	.command("list")
	.description("Read and list claimable rewards without signing transactions")
	.option("-t, --type <type>", `Reward type (${claimCategories.join(", ")})`)
	.action(async (options) => {
		const failures = await listConfiguredRewards(categoriesFrom(options.type));
		if (failures.length > 0) {
			process.exitCode = 1;
		}
	});

program
	.command("claim")
	.description("Claim configured rewards; all four types are claimed by default")
	.option("-t, --type <type>", `Reward type (${claimCategories.join(", ")})`)
	.option("-e, --epoch <number>", "Specific FSP epoch (DIRECT or FEE only)")
	.action(async (options) => {
		const categories = categoriesFrom(options.type);
		const epoch = epochFrom(options.epoch);
		if (epoch !== undefined && categories.some((category) => category === "ftso" || category === "validator")) {
			throw new Error("--epoch can only be used with --type direct or --type fee");
		}
		const failures = await claimConfiguredRewards(categories, epoch);
		if (failures.length > 0) {
			process.exitCode = 1;
		}
	});

program.parseAsync().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
