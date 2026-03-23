import { PublicKey, Connection, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { SUBSCRIPTION_IDL } from './subscriptionIdl';

export const PROGRAM_ID = new PublicKey('FUTVzQF86UckN9KhyuRajM4xRsYS62f24hTbJqGkZxed');

// Test RFRM token on devnet
export const RFRM_MINT = new PublicKey('B5KduNd3Y54Bi91rJirh3L3tzFLE3dWd7YCPdfJGNAMi');

export interface UserSubscriptionData {
  wallet: PublicKey;
  lockedRfrm: BN;
  monthsPaid: number;
  subscriptionStart: BN;
  subscriptionExpiry: BN;
  isActive: boolean;
  bump: number;
}

function getProgram(wallet: any, publicKey: PublicKey, connection: Connection): Program {
  const anchorWallet = {
    publicKey: publicKey,
    signTransaction: async (tx: any) => {
      if (wallet.signTransaction) return await wallet.signTransaction(tx);
      if (wallet.adapter?.signTransaction) return await wallet.adapter.signTransaction(tx);
      throw new Error('Wallet does not support signTransaction');
    },
    signAllTransactions: async (txs: any[]) => {
      if (wallet.signAllTransactions) return await wallet.signAllTransactions(txs);
      if (wallet.adapter?.signAllTransactions) return await wallet.adapter.signAllTransactions(txs);
      throw new Error('Wallet does not support signAllTransactions');
    },
  };
  
  const provider = new AnchorProvider(connection, anchorWallet, {
    commitment: 'confirmed',
  });
  
  return new Program(SUBSCRIPTION_IDL as unknown as Idl, provider);
}

export function getSubscriptionPDA(userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), userPubkey.toBuffer()],
    PROGRAM_ID
  );
}

export function getEscrowPDA(userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), userPubkey.toBuffer()],
    PROGRAM_ID
  );
}

export function getPlatformPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('platform')],
    PROGRAM_ID
  );
}

export async function getUserSubscription(
  wallet: PublicKey,
  connection: Connection
): Promise<UserSubscriptionData | null> {
  try {
    const [subscriptionPDA] = getSubscriptionPDA(wallet);
    const accountInfo = await connection.getAccountInfo(subscriptionPDA);
    if (!accountInfo) return null;

    // Decode account data manually (8 byte discriminator + fields)
    const data = accountInfo.data;
    if (data.length < 8 + 32 + 8 + 1 + 8 + 8 + 1 + 1) return null;

    let offset = 8; // skip discriminator

    const walletBytes = data.slice(offset, offset + 32);
    const walletPubkey = new PublicKey(walletBytes);
    offset += 32;

    const lockedRfrm = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const monthsPaid = data[offset];
    offset += 1;

    const subscriptionStart = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const subscriptionExpiry = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const isActive = data[offset] === 1;
    offset += 1;

    const bump = data[offset];

    return {
      wallet: walletPubkey,
      lockedRfrm,
      monthsPaid,
      subscriptionStart,
      subscriptionExpiry,
      isActive,
      bump,
    };
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return null;
  }
}

export async function lockRFRM(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  rfrmAmount: number,
  months: number
): Promise<string> {
  if (!publicKey) throw new Error('Wallet not connected');
  
  const program = getProgram(wallet, publicKey, connection);
  const userPubkey = publicKey;

  const [platformPDA] = getPlatformPDA();
  const [subscriptionPDA] = getSubscriptionPDA(userPubkey);
  const [escrowPDA] = getEscrowPDA(userPubkey);

  const userTokenAccount = await getAssociatedTokenAddress(RFRM_MINT, userPubkey);

  const tx = await program.methods
    .lockRfrm(new BN(rfrmAmount), months)
    .accounts({
      platformState: platformPDA,
      userSubscription: subscriptionPDA,
      escrowTokenAccount: escrowPDA,
      userTokenAccount: userTokenAccount,
      rfrmMint: RFRM_MINT,
      user: userPubkey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return tx;
}

export async function extendSubscription(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  rfrmAmount: number,
  months: number
): Promise<string> {
  if (!publicKey) throw new Error('Wallet not connected');
  
  const program = getProgram(wallet, publicKey, connection);
  const userPubkey = publicKey;

  const [subscriptionPDA] = getSubscriptionPDA(userPubkey);
  const [escrowPDA] = getEscrowPDA(userPubkey);

  const userTokenAccount = await getAssociatedTokenAddress(RFRM_MINT, userPubkey);

  const tx = await program.methods
    .extendSubscription(new BN(rfrmAmount), months)
    .accounts({
      userSubscription: subscriptionPDA,
      escrowTokenAccount: escrowPDA,
      userTokenAccount: userTokenAccount,
      user: userPubkey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

export async function unlockRFRM(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection
): Promise<string> {
  if (!publicKey) throw new Error('Wallet not connected');
  
  const program = getProgram(wallet, publicKey, connection);
  const userPubkey = publicKey;

  const [subscriptionPDA] = getSubscriptionPDA(userPubkey);
  const [escrowPDA] = getEscrowPDA(userPubkey);

  const userTokenAccount = await getAssociatedTokenAddress(RFRM_MINT, userPubkey);

  const tx = await program.methods
    .unlockRfrm()
    .accounts({
      userSubscription: subscriptionPDA,
      escrowTokenAccount: escrowPDA,
      userTokenAccount: userTokenAccount,
      user: userPubkey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

export async function initializePlatform(wallet: any, publicKey: PublicKey, connection: Connection): Promise<string> {
  const [platformPDA] = getPlatformPDA();
  
  const accountInfo = await connection.getAccountInfo(platformPDA);
  if (accountInfo) {
    throw new Error('Platform already initialized');
  }

  const program = getProgram(wallet, publicKey, connection);
  
  const tx = await program.methods
    .initializePlatform(new BN(2500))
    .accounts({
      platformState: platformPDA,
      authority: publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  return tx;
}
