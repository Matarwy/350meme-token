# 350Meme Solana SPL Token Workspace

Devnet-first manual workspace for creating a Solana SPL token:

- `name`: `350Meme`
- `symbol`: `350M`
- `supply`: exactly `350`
- `decimals`: `0`
- `owner keypair`: `./keys/owner.json`
- `mint keypair`: `./keys/mint-350meme.json`

No script hardcodes private keys. Keypair files live under `./keys/`, which is ignored by git.

## Vanity Suffix Reality Check

Solana public keys are base58 strings. Base58 allows:

```text
123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
```

It excludes `0`, `O`, `I`, and `l`. Because of that:

- `350M` is impossible because it contains the digit `0`.
- `350` is impossible because it contains the digit `0`.
- `35M` is valid and is the recommended vanity suffix.
- `35` is valid and faster.
- `35oM` is valid if the client accepts lowercase letter `o` as a visual substitute for zero.

Keep vanity settings configurable in `.env`:

```bash
VANITY_SUFFIX=35M
MAX_VANITY_ATTEMPTS=5000000
```

Expected attempts are roughly `58^N` for an `N` character suffix.

## Metadata Model

Solana token metadata is usually represented by a Metaplex Token Metadata account. That account is a program-derived address linked to the mint. The on-chain metadata stores compact fields such as `name`, `symbol`, and a `uri`. The `uri` points to an off-chain JSON metadata file.

Required off-chain metadata fields for this project:

```json
{
  "name": "350Meme",
  "symbol": "350M",
  "description": "350Meme: a fixed-supply Solana meme token with exactly 350 whole tokens.",
  "image": "https://example.com/350meme-logo.png",
  "external_url": "https://example.com/350meme"
}
```

An example file is included at:

```bash
cat assets/metadata.json
```

Put the final logo at `assets/logo.png` while preparing the token. Before mainnet, upload the logo and metadata JSON to permanent public storage such as IPFS, Arweave, NFT.Storage, Pinata, Bundlr, or Irys. Then update:

```bash
TOKEN_LOGO_URI=https://your-permanent-logo-url
TOKEN_METADATA_URI=https://your-permanent-metadata-json-url
TOKEN_EXTERNAL_URL=https://your-project-url
```

During token creation, `TOKEN_METADATA_URI` is linked to the mint by the Metaplex metadata transaction. Metadata can be updated later only by the metadata update authority. For a trust-minimized launch, update authority should eventually be locked or transferred to a governance/multisig process after the final image and metadata are verified.

## Ubuntu Tooling Install

The official Solana/Agave install command for Linux is:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
```

Rust/Cargo is required to install `spl-token-cli` if it is missing:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
cargo --version
```

Common Ubuntu build dependencies:

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev
```

Install SPL Token CLI:

```bash
cargo install spl-token-cli
spl-token --version
```

Or use the safe interactive project installer:

```bash
bash scripts/install-solana-tools.sh --dry-run
bash scripts/install-solana-tools.sh
```

The installer does not create wallets, mint tokens, or run `solana config set`. It prints the current Solana CLI config only so you can inspect it.

## Local Config

Create `.env`:

```bash
cp .env.example .env
```

Recommended devnet values:

```bash
CLUSTER=devnet
OWNER_KEYPAIR=./keys/owner.json
MINT_KEYPAIR=./keys/mint-350meme.json
TOKEN_NAME=350Meme
TOKEN_SYMBOL=350M
TOKEN_SUPPLY=350
TOKEN_DECIMALS=0
VANITY_SUFFIX=35M
MAX_VANITY_ATTEMPTS=5000000
CONFIRM_MAINNET=false
```

Do not put private keys or seed phrases in `.env`.

## Project Setup

```bash
npm install
bash scripts/check-env.sh
```

`check-env.sh` should pass after `solana`, `spl-token`, Node, npm, and project dependencies are installed.

## Devnet Owner Wallet

This creates the local fee payer and token owner wallet. It uses `./keys/owner.json` explicitly:

```bash
mkdir -p keys
solana-keygen new --outfile ./keys/owner.json --no-bip39-passphrase
solana airdrop 2 "$(solana-keygen pubkey ./keys/owner.json)" --url devnet
solana balance "$(solana-keygen pubkey ./keys/owner.json)" --url devnet
```

Keep `./keys/owner.json` private.

## Devnet Vanity Mint Generation

Recommended valid suffix:

```bash
npm run generate:mint -- --suffix 35M --out ./keys/mint-350meme.json --max-attempts 5000000
```

Faster fallback:

```bash
npm run generate:mint -- --suffix 35 --out ./keys/mint-350meme.json --max-attempts 100000
```

Invalid examples that the script will reject:

```bash
npm run generate:mint -- --suffix 350M --out ./keys/mint-350meme.json
npm run generate:mint -- --suffix 350 --out ./keys/mint-350meme.json
```

## Dry Run

Print the exact project commands and effective config without sending transactions:

```bash
bash scripts/create-token.sh --dry-run
bash scripts/revoke-authorities.sh --dry-run
```

## Devnet Token Creation

This creates the mint, creates Metaplex metadata, creates the owner associated token account, and mints exactly `350` whole tokens:

```bash
bash scripts/create-token.sh
```

By default this also runs:

```bash
bash scripts/revoke-authorities.sh
```

That permanently disables mint authority and attempts to disable freeze authority.

## Devnet Metadata Creation Only

Use this only if you created a mint separately and need to add metadata afterward:

```bash
MINT_ADDRESS=<existing-devnet-mint-address> npx tsx scripts/create-metadata.ts
```

The normal `bash scripts/create-token.sh` flow already creates metadata.

## Authority Revocation Only

If revocation did not run automatically, run:

```bash
bash scripts/revoke-authorities.sh
```

This uses `OWNER_KEYPAIR=./keys/owner.json` explicitly.

## Final Verification

Set the mint address from your generated mint keypair:

```bash
MINT_ADDRESS="$(solana-keygen pubkey ./keys/mint-350meme.json)"
OWNER_ADDRESS="$(solana-keygen pubkey ./keys/owner.json)"
```

Inspect the mint:

```bash
spl-token --url devnet display "$MINT_ADDRESS"
spl-token --url devnet supply "$MINT_ADDRESS"
spl-token --url devnet accounts --owner "$OWNER_ADDRESS"
```

Inspect the Solana account and saved deployment files:

```bash
solana account "$MINT_ADDRESS" --url devnet
cat output/deployment-summary.md
cat output/deployment.json
```

Expected result:

- Supply is `350`.
- Decimals are `0`.
- Mint authority is disabled.
- Freeze authority is disabled or absent.
- Metadata URI points to your configured `TOKEN_METADATA_URI`.

## Mainnet Guard

Mainnet is refused unless all of the following are true:

```bash
CLUSTER=mainnet-beta
CONFIRM_MAINNET=true
TOKEN_METADATA_URI=https://your-real-permanent-metadata.json
TOKEN_LOGO_URI=https://your-real-permanent-logo.png
```

Do not use mainnet until devnet succeeds end-to-end. Mainnet spends real SOL, and authority revocation is irreversible.

