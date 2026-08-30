export type ContractAddress = string;

type CoreContractNames = "FlareSystemsManager" | "RewardManager";
type OptionalContractNames = "ClaimSetupManager" | "ValidatorRewardManager";
type ContractNames = CoreContractNames | OptionalContractNames;

export type ContractDefinitions = {
  [K in ContractNames]: {
    name: K;
    address: ContractAddress;
  }
}[ContractNames];

export type NetworkContractAddresses = {
  [K in CoreContractNames]: Extract<ContractDefinitions, { name: K }>;
} & {
  [K in OptionalContractNames]?: Extract<ContractDefinitions, { name: K }>;
};
