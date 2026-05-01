import {
  createFungible,
  findMetadataPda,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  mintTokensTo,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  keypairIdentity,
  percentAmount,
  some,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

loadEnv();

type DeploymentSummary = {
  cluster: string;
  rpcUrl: string;
  owner: string;
  mint: string;
  associatedTokenAccount: string;
  metadataPda: string;
  tokenName: string;
  tokenSymbol: string;
  tokenSupply: number;
  tokenDecimals: number;
  metadataUri: string;
  localMetadataFile: string;
  createFungibleSignature: string;
  mintSignature: string;
  explorerMintUrl: string;
};

function env(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.trim() !== '' ? process.env[name]!.trim() : fallback;
}

function envAny(names: string[], fallback: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== '') return value.trim();
  }
  return fallback;
}

function clusterUrl(cluster: string): string {
  if (process.env.RPC_URL && process.env.RPC_URL.trim() !== '') return process.env.RPC_URL.trim();
  switch (cluster) {
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    case 'devnet':
    default:
      return 'https://api.devnet.solana.com';
  }
}

function loadSecretKey(filePath: string): Uint8Array {
  if (!existsSync(filePath)) {
    throw new Error(`Missing keypair file: ${filePath}`);
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Keypair file must be a JSON array: ${filePath}`);
  }

  return new Uint8Array(parsed as number[]);
}

function signatureToBase58(result: { signature?: Uint8Array | string } | Uint8Array | string): string {
  const signature = typeof result === 'object' && !(result instanceof Uint8Array) && 'signature' in result
    ? result.signature
    : result;

  if (typeof signature === 'string') return signature;
  if (signature instanceof Uint8Array) return bs58.encode(signature);
  return 'unknown';
}

function explorerUrl(kind: 'address' | 'tx', value: string, cluster: string): string {
  const clusterQuery = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/${kind}/${value}${clusterQuery}`;
}

function writeLocalMetadata(filePath: string, metadata: Record<string, string>): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function writeSummary(summary: DeploymentSummary): void {
  mkdirSync('output', { recursive: true });
  writeFileSync('output/deployment.json', `${JSON.stringify(summary, null, 2)}\n`);

  const lines = [
    '# 350Meme Deployment Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Network',
    '',
    `- Cluster: ${summary.cluster}`,
    `- RPC URL: ${summary.rpcUrl}`,
    '',
    '## Token',
    '',
    `- Name: ${summary.tokenName}`,
    `- Symbol: ${summary.tokenSymbol}`,
    `- Supply minted: ${summary.tokenSupply}`,
    `- Decimals: ${summary.tokenDecimals}`,
    `- Mint address: ${summary.mint}`,
    `- Owner wallet: ${summary.owner}`,
    `- Owner associated token account: ${summary.associatedTokenAccount}`,
    `- Metadata PDA: ${summary.metadataPda}`,
    `- Metadata URI: ${summary.metadataUri}`,
    `- Local metadata file: ${summary.localMetadataFile}`,
    '',
    '## Transaction Signatures',
    '',
    `- Create fungible token + metadata: ${summary.createFungibleSignature}`,
    `- Mint initial supply: ${summary.mintSignature}`,
    '',
    '## Explorer',
    '',
    `- Mint: ${summary.explorerMintUrl}`,
    `- Create transaction: ${explorerUrl('tx', summary.createFungibleSignature, summary.cluster)}`,
    `- Mint transaction: ${explorerUrl('tx', summary.mintSignature, summary.cluster)}`,
    '',
    '## Authority Status',
    '',
    '- Mint authority: pending revoke script',
    '- Freeze authority: created without an intended freeze authority; revoke script will still attempt a disable/no-op',
    '',
  ];

  writeFileSync('output/deployment-summary.md', `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const cluster = envAny(['CLUSTER', 'SOLANA_CLUSTER'], 'devnet');
  if (cluster === 'mainnet-beta' && envAny(['CONFIRM_MAINNET', 'ALLOW_MAINNET'], 'false') !== 'true') {
    throw new Error('Refusing mainnet-beta because CONFIRM_MAINNET is not true. Prove this flow on devnet first.');
  }

  const rpcUrl = clusterUrl(cluster);
  const ownerKeypairPath = path.resolve(env('OWNER_KEYPAIR', './keys/owner.json'));
  const mintKeypairPath = path.resolve(env('MINT_KEYPAIR', './keys/mint-350meme.json'));
  const tokenName = env('TOKEN_NAME', '350Meme');
  const tokenSymbol = env('TOKEN_SYMBOL', '350M');
  const tokenSupply = Number.parseInt(env('TOKEN_SUPPLY', '350'), 10);
  const tokenDecimals = Number.parseInt(env('TOKEN_DECIMALS', '0'), 10);
  const tokenDescription = env(
    'TOKEN_DESCRIPTION',
    '350Meme: a fixed-supply Solana meme token with exactly 350 whole tokens.'
  );
  const tokenLogoUri = env('TOKEN_LOGO_URI', 'https://example.com/350meme-logo.png');
  const tokenExternalUrl = env('TOKEN_EXTERNAL_URL', 'https://example.com/350meme');
  const metadataUri = env('TOKEN_METADATA_URI', 'https://example.com/350meme.json');
  const localMetadataFile = path.resolve('assets/metadata.json');

  if (tokenSupply !== 350) throw new Error(`TOKEN_SUPPLY must be exactly 350, got ${tokenSupply}`);
  if (tokenDecimals !== 0) throw new Error(`TOKEN_DECIMALS must be exactly 0, got ${tokenDecimals}`);
  if (cluster === 'mainnet-beta' && metadataUri.includes('example.com')) {
    throw new Error('Refusing mainnet-beta with example.com metadata URI. Upload metadata/logo first.');
  }

  writeLocalMetadata(localMetadataFile, {
    name: tokenName,
    symbol: tokenSymbol,
    description: tokenDescription,
    image: tokenLogoUri,
    external_url: tokenExternalUrl,
  });

  const connection = new Connection(rpcUrl, 'confirmed');
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplToolbox());

  const ownerKeypair = umi.eddsa.createKeypairFromSecretKey(loadSecretKey(ownerKeypairPath));
  const mintKeypair = umi.eddsa.createKeypairFromSecretKey(loadSecretKey(mintKeypairPath));
  const mintSigner = createSignerFromKeypair(umi, mintKeypair);
  umi.use(keypairIdentity(ownerKeypair));

  const mintAddress = mintSigner.publicKey.toString();
  const ownerAddress = umi.identity.publicKey.toString();
  const existingMint = await connection.getAccountInfo(new PublicKey(mintAddress), 'confirmed');
  if (existingMint) {
    throw new Error(`Mint account already exists on ${cluster}: ${mintAddress}. Refusing to rerun creation.`);
  }

  console.log(`Creating ${tokenName} (${tokenSymbol}) on ${cluster}`);
  console.log(`Mint: ${mintAddress}`);
  console.log(`Owner: ${ownerAddress}`);
  console.log(`Metadata URI: ${metadataUri}`);

  const createResult = await createFungible(umi, {
    mint: mintSigner,
    name: tokenName,
    symbol: tokenSymbol,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: some(tokenDecimals),
  }).sendAndConfirm(umi);

  const associatedTokenAccount = findAssociatedTokenPda(umi, {
    mint: mintSigner.publicKey,
    owner: umi.identity.publicKey,
  })[0].toString();

  const mintResult = await createTokenIfMissing(umi, {
    mint: mintSigner.publicKey,
    owner: umi.identity.publicKey,
  })
    .add(
      mintTokensTo(umi, {
        mint: mintSigner.publicKey,
        token: findAssociatedTokenPda(umi, {
          mint: mintSigner.publicKey,
          owner: umi.identity.publicKey,
        }),
        amount: tokenSupply,
      })
    )
    .sendAndConfirm(umi);

  const metadataPda = findMetadataPda(umi, { mint: mintSigner.publicKey })[0].toString();
  const createFungibleSignature = signatureToBase58(createResult);
  const mintSignature = signatureToBase58(mintResult);

  const summary: DeploymentSummary = {
    cluster,
    rpcUrl,
    owner: ownerAddress,
    mint: mintAddress,
    associatedTokenAccount,
    metadataPda,
    tokenName,
    tokenSymbol,
    tokenSupply,
    tokenDecimals,
    metadataUri,
    localMetadataFile,
    createFungibleSignature,
    mintSignature,
    explorerMintUrl: explorerUrl('address', mintAddress, cluster),
  };

  writeSummary(summary);

  console.log(`Created token and minted ${tokenSupply} ${tokenSymbol}.`);
  console.log(`Summary written to output/deployment-summary.md`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
