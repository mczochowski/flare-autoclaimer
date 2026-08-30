export function flattenRewardStates<T>(groups: readonly (readonly T[])[]): T[] {
	const states: T[] = [];
	for (const group of groups) {
		states.push(...group);
	}
	return states;
}
