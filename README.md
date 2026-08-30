# Flare Autoclaimer

This service claims four Flare reward categories from one executor account:

- FSP `DIRECT` rewards (claim type 0)
- FSP `FEE` rewards (claim type 1)
- Weight-based FSP rewards, including WNAT delegation shares and any MIRROR/CCHAIN shares returned for a configured reward owner
- Validator staking rewards from the separate `ValidatorRewardManager`

It is based on [FlareOracle/ftso-fee-claimer](https://github.com/FlareOracle/ftso-fee-claimer), extended for multiple beneficiaries and the validator reward system.

## How the claims are separated

`DIRECT`, `FEE`, and weight-based FSP claims use Flare's current `RewardManager` and the official per-epoch Merkle distribution files. Direct and fee claims are sent with `RewardManager.claim`. Weight-based claims are initialized from the same verified distribution data and then sent with `RewardManager.autoClaim`.

Validator staking rewards do not use the FSP distribution files. They are read and claimed independently through `ValidatorRewardManager` at `0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5`.

The Flare mainnet defaults are:

| Contract | Address |
| --- | --- |
| RewardManager | `0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B` |
| ClaimSetupManager | `0xD56c0Ea37B848939B59e6F5Cda119b3fA473b5eB` |
| ValidatorRewardManager | `0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5` |

## Executor prerequisites

The configured executor must be funded with enough FLR for gas.

For FSP rewards, each reward owner must authorize the executor in `ClaimSetupManager`. DIRECT must be authorized by the signing-policy address; FEE must be authorized by the identity address. Weight-based reward owners must also authorize the executor for `autoClaim`.

Validator staking rewards use a separate executor list. Each validator reward owner with a balance must authorize the executor using `ValidatorRewardManager.setClaimExecutors`.

By default, each claim is paid back to its reward owner. This is always an allowed recipient and avoids adding a central recipient to every allowlist. If `CLAIM_RECIPIENT_ADDRESS` is configured, that address must be allowlisted by each applicable owner in the corresponding reward manager. Weight-based `autoClaim` rewards always follow the ClaimSetupManager destination and are wrapped by the protocol.

## Setup

Requirements: Node.js 18 or newer and Yarn 1.x.

```bash
cp .env.template .env
```

Add `CLAIM_EXECUTOR_PRIVATE_KEY` to `.env`. Do not commit `.env` or put the private key in the command line. The application derives the signing address from the key and refuses to send if it does not match `CLAIM_EXECUTOR_ADDRESS`.

Set `REWARD_OWNER_ADDRESSES` in `.env` as the fallback for all categories. Use the category-specific variables when an address has only one role:

```dotenv
DIRECT_BENEFICIARY_ADDRESSES=0x...
FEE_BENEFICIARY_ADDRESSES=0x...
FTSO_REWARD_OWNER_ADDRESSES=0x...
VALIDATOR_REWARD_OWNER_ADDRESSES=0x...
```

Values may be comma or whitespace separated.

Install and build:

```bash
yarn install --frozen-lockfile
yarn build
```

## Read-only inspection

No private key is required to list rewards:

```bash
yarn cli list
yarn cli list --type direct
yarn cli list --type fee
yarn cli list --type ftso
yarn cli list --type validator
```

## Claiming

Claim all configured reward categories:

```bash
yarn cli claim
```

Claim one category:

```bash
yarn cli claim --type direct
yarn cli claim --type fee
yarn cli claim --type ftso
yarn cli claim --type validator
```

A specific epoch can be selected for DIRECT or FEE:

```bash
yarn cli claim --type direct --epoch 427
yarn cli claim --type fee --epoch 427
```

Every transaction is simulated before submission and all transactions are sent sequentially from the executor, avoiding nonce collisions. A distribution fetch or proof-validation failure stops that affected claim before the owner's on-chain claim cursor can advance.

## Continuous autoclaiming

```bash
yarn build
yarn auto-claimer
```

The default interval is 12 minutes and can be changed with `POLL_INTERVAL_MINUTES`.

With Docker:

```bash
docker build -t flare-autoclaimer .
docker compose up -d auto-claimer
docker compose logs -f auto-claimer
```

## References

- [Flare reward claiming guide](https://dev.flare.network/network/fsp/guides/claiming-rewards)
- [FTSO Scaling reward calculation and claim types](https://github.com/flare-foundation/FTSO-Scaling/blob/main/scripts/rewards/README.md)
- [Flare autoclaiming overview](https://flare.network/news/autoclaiming-available-on-flare)
- [Flare Stake Tool: validator reward claiming](https://dev.flare.network/network/guides/using-flare-stake-tool)

## License

MIT, matching the upstream project.
