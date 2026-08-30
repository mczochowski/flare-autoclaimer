const sameAddress = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export function designatedRecipient(
	rewardOwner: string,
	allowedRecipients: readonly string[],
	rewardType: string,
): string {
	const recipientsByAddress = new Map<string, string>();
	for (const recipient of allowedRecipients) {
		if (!sameAddress(recipient, rewardOwner) && !recipientsByAddress.has(recipient.toLowerCase())) {
			recipientsByAddress.set(recipient.toLowerCase(), recipient);
		}
	}
	const designatedRecipients = [...recipientsByAddress.values()];
	if (designatedRecipients.length === 0) {
		return rewardOwner;
	}
	if (designatedRecipients.length === 1) {
		return designatedRecipients[0];
	}
	throw new Error(
		`${rewardOwner} has multiple designated ${rewardType} claim recipients; refusing to choose: ${designatedRecipients.join(", ")}`,
	);
}
