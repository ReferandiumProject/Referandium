import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { MARKET_ESCROW_IDL } from './marketEscrowIdl';

const MARKET_ESCROW_PROGRAM_ID = new PublicKey('Aby8pc1zLWbKUPgPzgh4ntbkTsbPaZWb6FyuxSwtkR8e');

export function getMarketEscrowProgram(wallet: any, publicKey: PublicKey, connection: Connection): Program {
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
  
  return new Program(MARKET_ESCROW_IDL as unknown as Idl, provider);
}

export function getEscrowPlatformPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow_platform')],
    MARKET_ESCROW_PROGRAM_ID
  );
}

export function getMarketEscrowPDA(marketId: string): [PublicKey, number] {
  const marketIdClean = marketId.replace(/-/g, '');
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), Buffer.from(marketIdClean)],
    MARKET_ESCROW_PROGRAM_ID
  );
}

export function getUserSignalPDA(marketId: string, userPubkey: PublicKey): [PublicKey, number] {
  const marketIdClean = marketId.replace(/-/g, '');
  return PublicKey.findProgramAddressSync(
    [Buffer.from('signal'), Buffer.from(marketIdClean), userPubkey.toBuffer()],
    MARKET_ESCROW_PROGRAM_ID
  );
}

export async function initializeEscrowPlatform(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  treasury: PublicKey
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [platformConfig] = getEscrowPlatformPDA();

    const tx = await program.methods
      .initializePlatform(treasury)
      .accounts({
        platformConfig,
        authority: publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error initializing escrow platform:', error);
    throw error;
  }
}

export async function createMarketEscrow(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  params: {
    marketId: string;
    gookieWallet: PublicKey;
    endTime: number;
  }
): Promise<{ tx: string; marketEscrowPDA: string }> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [platformConfig] = getEscrowPlatformPDA();
    const [marketEscrow] = getMarketEscrowPDA(params.marketId);
    const marketIdClean = params.marketId.replace(/-/g, '');

    const tx = await program.methods
      .createMarket(marketIdClean, params.gookieWallet, new BN(params.endTime))
      .accounts({
        platformConfig,
        marketEscrow,
        authority: publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return { tx, marketEscrowPDA: marketEscrow.toBase58() };
  } catch (error) {
    console.error('Error creating market escrow:', error);
    throw error;
  }
}

export async function depositSignal(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  marketId: string,
  solAmount: number,
  signalDirection: number
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [marketEscrow] = getMarketEscrowPDA(marketId);
    const [userSignal] = getUserSignalPDA(marketId, publicKey);
    const marketIdClean = marketId.replace(/-/g, '');

    const solAmountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .depositSignal(marketIdClean, new BN(solAmountLamports), signalDirection)
      .accounts({
        marketEscrow,
        userSignal,
        user: publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error depositing signal:', error);
    throw error;
  }
}

export async function setYield(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  marketId: string,
  yieldAmountSol: number
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [platformConfig] = getEscrowPlatformPDA();
    const [marketEscrow] = getMarketEscrowPDA(marketId);
    const marketIdClean = marketId.replace(/-/g, '');

    const yieldAmountLamports = Math.floor(yieldAmountSol * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .setYield(marketIdClean, yieldAmountLamports)
      .accounts({
        platformConfig,
        marketEscrow,
        authority: publicKey,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error setting yield:', error);
    throw error;
  }
}

export async function closeMarket(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  marketId: string,
  gookieWallet: PublicKey,
  treasury: PublicKey
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [platformConfig] = getEscrowPlatformPDA();
    const [marketEscrow] = getMarketEscrowPDA(marketId);
    const marketIdClean = marketId.replace(/-/g, '');

    const tx = await program.methods
      .closeMarket(marketIdClean)
      .accounts({
        platformConfig,
        marketEscrow,
        treasury,
        gookieWallet,
        authority: publicKey,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error closing market:', error);
    throw error;
  }
}

export async function withdraw(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  marketId: string
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [marketEscrow] = getMarketEscrowPDA(marketId);
    const [userSignal] = getUserSignalPDA(marketId, publicKey);
    const marketIdClean = marketId.replace(/-/g, '');

    const tx = await program.methods
      .withdraw(marketIdClean)
      .accounts({
        marketEscrow,
        userSignal,
        user: publicKey,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error withdrawing:', error);
    throw error;
  }
}

export async function adminWithdrawBuyback(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  marketId: string,
  treasury: PublicKey
): Promise<string> {
  try {
    const program = getMarketEscrowProgram(wallet, publicKey, connection);
    const [platformConfig] = getEscrowPlatformPDA();
    const [marketEscrow] = getMarketEscrowPDA(marketId);
    const marketIdClean = marketId.replace(/-/g, '');

    const tx = await program.methods
      .adminWithdrawBuyback(marketIdClean)
      .accounts({
        platformConfig,
        marketEscrow,
        treasury,
        authority: publicKey,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error withdrawing buyback:', error);
    throw error;
  }
}

export async function getMarketEscrow(connection: Connection, marketId: string): Promise<any | null> {
  try {
    const program = getMarketEscrowProgram(null, PublicKey.default, connection);
    const [marketEscrowPDA] = getMarketEscrowPDA(marketId);
    const marketEscrow = await (program.account as any).marketEscrow.fetch(marketEscrowPDA);
    return marketEscrow;
  } catch (error) {
    console.error('Error fetching market escrow:', error);
    return null;
  }
}

export async function getUserSignal(
  connection: Connection,
  marketId: string,
  userPubkey: PublicKey
): Promise<any | null> {
  try {
    const program = getMarketEscrowProgram(null, PublicKey.default, connection);
    const [userSignalPDA] = getUserSignalPDA(marketId, userPubkey);
    const userSignal = await (program.account as any).userSignal.fetch(userSignalPDA);
    return userSignal;
  } catch (error) {
    console.error('Error fetching user signal:', error);
    return null;
  }
}
