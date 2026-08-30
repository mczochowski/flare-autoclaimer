# Flare Autoclaimer

This service claims four Flare reward categories from one executor account:

- FSP `DIRECT` rewards (claim type 0)
- FSP `FEE` rewards (claim type 1)
- Weight-based FSP rewards, including WNAT delegation shares and any MIRROR/CCHAIN shares returned for a configured reward owner
- Validator staking rewards from the separate `ValidatorRewardManager`

It is based on [FlareOracle/ftso-fee-claimer](https://github.com/FlareOracle/ftso-fee-claimer), extended for multiple beneficiaries and the validator reward system.

## How the claims are separated

`DIRECT`, `FEE`, and weight-based FSP claims use Flare's current `RewardManager` and the official per-epoch Merkle distribution files. Direct and fee claims are sent with `RewardManager.claim`. Weight-based claims are initialized from the same verified distribution data and then claimed individually with `RewardManager.claim`, which allows independent FLR/WFLR selection. Owners with enabled delegation accounts use the protocol's `autoClaim` path, which always pays WFLR to the delegation account.

Validator staking rewards do not use the FSP distribution files. They are read and claimed independently through `ValidatorRewardManager` at `0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5`.

The Flare mainnet defaults are:

| Contract | Address |
| --- | --- |
| RewardManager | `0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B` |
| ClaimSetupManager | `0xD56c0Ea37B848939B59e6F5Cda119b3fA473b5eB` |
| ValidatorRewardManager | `0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5` |

## Executor prerequisites

The configured executor must be funded with enough FLR for gas.

For FSP rewards, each reward owner must authorize the executor in `ClaimSetupManager`. DIRECT must be authorized by the signing-policy address; FEE must be authorized by the identity address. Weight-based reward owners must also authorize the executor.

Validator staking rewards use a separate executor list. Each validator reward owner with a balance must authorize the executor using `ValidatorRewardManager.setClaimExecutors`.

`CLAIM_RECIPIENT_ADDRESS` applies only to `DIRECT` and `FEE` claims. If it is blank, those rewards return to their beneficiary. If it is set, the applicable beneficiary must allowlist it in `ClaimSetupManager`.

Weight-based FTSO delegation rewards ignore `CLAIM_RECIPIENT_ADDRESS`. For ordinary reward owners, the autoclaimer uses the sole recipient designated in `ClaimSetupManager`, falling back to the reward owner when none is configured. If a delegation account is enabled, the protocol requires `autoClaim`, pays WFLR to that delegation account, and therefore requires `FTSO_WRAP_REWARDS=true`.

Validator staking rewards also ignore `CLAIM_RECIPIENT_ADDRESS`. The autoclaimer reads each owner's designated recipients from `ValidatorRewardManager.allowedClaimRecipients`. It uses the sole designated recipient when exactly one is configured, falls back to the reward owner when none is configured, and refuses to choose when multiple designated recipients are present.

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

Each reward category pays native FLR by default. Override categories independently in `.env`:

```dotenv
DIRECT_WRAP_REWARDS=false
FEE_WRAP_REWARDS=false
FTSO_WRAP_REWARDS=false
VALIDATOR_WRAP_REWARDS=false
```

Set a category to `true` to receive WFLR. Values other than `true` or `false` are rejected. `FTSO_WRAP_REWARDS=false` is supported for ordinary reward owners; an owner with an enabled delegation account must use `true` because Flare's `autoClaim` path always wraps.

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

When claiming all categories, weight-based FSP rewards are processed before DIRECT and FEE. This is required because Flare's `RewardManager.claim` also sweeps any initialized weight-based rewards through the requested epoch. A DIRECT- or FEE-only run is blocked when it would sweep those rewards to the DIRECT/FEE recipient; run the FTSO claim first.

## Claim history CSV

Every confirmed claim transaction is appended to `data/claims.csv` by default. The file is initialized with these columns even when a claim run finds no rewards:

```text
Date,Reward Type,Reward Owner Address,Recipient Address,Reward Epoch,Reward Epoch start (if covering multiple),Reward Epoch end (if covering multiple),Amount,Transaction hash,Transaction link
```

Reward types are `DIRECT`, `FEE`, `FTSO_DELEGATION`, and `VALIDATOR_STAKING`. `Date` is the UTC time at which confirmation was observed. A transaction covering one epoch uses `Reward Epoch`; a transaction covering multiple epochs leaves that column blank and uses the start/end columns. Validator staking claims leave all epoch columns blank. Amounts are decimal FLR or WFLR amounts according to that reward type's wrap setting.

Change the local output path with `CLAIM_HISTORY_CSV`. Docker Compose always writes inside the container to `/data/claims.csv` and persists that file on the host as `./data/claims.csv`. CSV files under `data/` are ignored by Git.

## Continuous autoclaiming

```bash
yarn build
yarn auto-claimer
```

The default interval is 5 minutes and can be changed with `POLL_INTERVAL_MINUTES`. Each cycle checks all four configured reward categories and submits transactions only for rewards that are available.

With Docker:

```bash
docker compose build
docker compose up -d
docker compose logs -f auto-claimer
```

Compose runs a single, read-only service as a non-root user. Claim-cycle failures are logged and retried on the next cycle; if the process or container exits, `restart: unless-stopped` starts it again automatically.

Inspect rewards in a one-off container without starting the autoclaimer:

```bash
docker compose run --rm auto-claimer node dist/cli.js list
```

Stop the service explicitly with `docker compose down`. An explicit stop is not automatically restarted.

## References

- [Flare reward claiming guide](https://dev.flare.network/network/fsp/guides/claiming-rewards)
- [FTSO Scaling reward calculation and claim types](https://github.com/flare-foundation/FTSO-Scaling/blob/main/scripts/rewards/README.md)
- [Flare autoclaiming overview](https://flare.network/news/autoclaiming-available-on-flare)
- [Flare Stake Tool: validator reward claiming](https://dev.flare.network/network/guides/using-flare-stake-tool)

## License

MIT, matching the upstream project.
