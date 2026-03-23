import { PublicKey, Connection, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { GOOKIE_IDL } from './gookieIdl';

export const GOOKIE_PROGRAM_ID = new PublicKey('3VkzfA6GU6VhMdEnYRJywLLEQ454B9gmQoNh4ycVFFS5');
export const RFRM_MINT = new PublicKey('B5KduNd3Y54Bi91rJirh3L3tzFLE3dWd7YCPdfJGNAMi');
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export interface GookieAuctionData {
  auctionId: BN;
  title: string;
  description: string;
  startingBidRfrm: BN;
  currentHighestBid: BN;
  highestBidder: PublicKey;
  auctionEndTime: BN;
  status: any;
  nftMint: PublicKey | null;
  marketId: string;
  lockedRfrm: BN;
  isSlashed: boolean;
  slashReason: string;
  feeApproved: boolean;
  bump: number;
}

export interface PlatformConfigData {
  authority: PublicKey;
  treasury: PublicKey;
  auctionCounter: BN;
  bump: number;
}

function getGookieProgram(wallet: any, publicKey: PublicKey, connection: Connection): Program {
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
  
  return new Program(GOOKIE_IDL as unknown as Idl, provider);
}

export function getPlatformConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gookie_platform')],
    GOOKIE_PROGRAM_ID
  );
}

export function getGookieAuctionPDA(auctionId: number): [PublicKey, number] {
  const auctionIdBuffer = Buffer.alloc(8);
  auctionIdBuffer.writeBigUInt64LE(BigInt(auctionId));
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gookie'), auctionIdBuffer],
    GOOKIE_PROGRAM_ID
  );
}

export function getGookieEscrowPDA(auctionPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gookie_escrow'), auctionPubkey.toBuffer()],
    GOOKIE_PROGRAM_ID
  );
}

export async function initializeGookiePlatform(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  treasury: PublicKey
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();

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
    console.error('Error initializing Gookie platform:', error);
    throw error;
  }
}

export async function createGookieAuction(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  params: {
    title: string;
    description: string;
    startingBidRfrm: number;
    auctionEndTime: number;
  }
): Promise<{ tx: string; auctionPDA: string; auctionId: number }> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();
    
    const platformConfigAccount = await (program.account as any).platformConfig.fetch(platformConfig);
    const auctionId = platformConfigAccount.auctionCounter.toNumber();
    
    const [gookieAuction] = getGookieAuctionPDA(auctionId);
    const [escrowTokenAccount] = getGookieEscrowPDA(gookieAuction);

    const tx = await program.methods
      .createGookieAuction(
        params.title,
        params.description,
        new BN(params.startingBidRfrm),
        new BN(params.auctionEndTime)
      )
      .accounts({
        platformConfig,
        gookieAuction,
        escrowTokenAccount,
        rfrmMint: RFRM_MINT,
        authority: publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return { tx, auctionPDA: gookieAuction.toBase58(), auctionId };
  } catch (error) {
    console.error('Error creating Gookie auction:', error);
    throw error;
  }
}

export async function placeBid(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  auctionPubkey: PublicKey,
  bidAmountRfrm: number
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    
    const auctionData = await (program.account as any).gookieAuction.fetch(auctionPubkey);
    const [escrowTokenAccount] = getGookieEscrowPDA(auctionPubkey);
    
    const bidderTokenAccount = await getAssociatedTokenAddress(
      RFRM_MINT,
      publicKey
    );
    
    const previousBidderTokenAccount = auctionData.currentHighestBid.toNumber() > 0
      ? await getAssociatedTokenAddress(RFRM_MINT, auctionData.highestBidder)
      : bidderTokenAccount;

    const tx = await program.methods
      .placeBid(new BN(bidAmountRfrm))
      .accounts({
        gookieAuction: auctionPubkey,
        escrowTokenAccount,
        bidderTokenAccount,
        previousBidderTokenAccount,
        bidder: publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error placing bid:', error);
    throw error;
  }
}

export async function closeAuction(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  auctionId: number
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();
    const [gookieAuction] = getGookieAuctionPDA(auctionId);

    const tx = await program.methods
      .closeAuction()
      .accounts({
        platformConfig,
        gookieAuction,
        authority: publicKey,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error closing auction:', error);
    throw error;
  }
}

export async function mintGookieNFT(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  auctionId: number,
  marketId: string
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();
    const [gookieAuction] = getGookieAuctionPDA(auctionId);
    const nftMintKeypair = Keypair.generate();
    
    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        nftMintKeypair.publicKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const tx = await program.methods
      .mintGookieNft(marketId)
      .accounts({
        platformConfig,
        gookieAuction,
        nftMint: nftMintKeypair.publicKey,
        metadata,
        winner: publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([nftMintKeypair])
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error minting Gookie NFT:', error);
    throw error;
  }
}

export async function adminSlash(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  auctionId: number,
  reason: string
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();
    const [gookieAuction] = getGookieAuctionPDA(auctionId);
    const [escrowTokenAccount] = getGookieEscrowPDA(gookieAuction);
    
    const platformConfigData = await (program.account as any).platformConfig.fetch(platformConfig);
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      RFRM_MINT,
      platformConfigData.treasury
    );

    const tx = await program.methods
      .adminSlash(reason)
      .accounts({
        platformConfig,
        gookieAuction,
        escrowTokenAccount,
        treasuryTokenAccount,
        treasury: platformConfigData.treasury,
        authority: publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error slashing auction:', error);
    throw error;
  }
}

export async function releaseGookie(
  wallet: any,
  publicKey: PublicKey,
  connection: Connection,
  auctionId: number
): Promise<string> {
  try {
    const program = getGookieProgram(wallet, publicKey, connection);
    const [platformConfig] = getPlatformConfigPDA();
    const [gookieAuction] = getGookieAuctionPDA(auctionId);
    const [escrowTokenAccount] = getGookieEscrowPDA(gookieAuction);
    
    const auctionAccount = await (program.account as any).gookieAuction.fetch(gookieAuction);
    const winnerPubkey = new PublicKey(auctionAccount.highestBidder);

    const winnerTokenAccount = await getAssociatedTokenAddress(
      RFRM_MINT,
      winnerPubkey
    );

    const tx = await program.methods
      .releaseGookie()
      .accounts({
        platformConfig,
        gookieAuction,
        escrowTokenAccount,
        winnerTokenAccount,
        authority: publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await connection.confirmTransaction(tx, 'confirmed');
    return tx;
  } catch (error) {
    console.error('Error releasing Gookie:', error);
    throw error;
  }
}

export async function getGookieAuction(
  connection: Connection,
  auctionPubkey: PublicKey
): Promise<GookieAuctionData | null> {
  try {
    const program = getGookieProgram(null, PublicKey.default, connection);
    const auctionData = await (program.account as any).gookieAuction.fetch(auctionPubkey);
    return auctionData as any;
  } catch (error) {
    console.error('Error fetching auction:', error);
    return null;
  }
}

export async function getAllGookieAuctions(connection: Connection): Promise<Array<{ pubkey: PublicKey; account: GookieAuctionData }>> {
  try {
    const program = getGookieProgram(null, PublicKey.default, connection);
    const auctions = await (program.account as any).gookieAuction.all();
    return auctions as any;
  } catch (error) {
    console.error('Error fetching all auctions:', error);
    return [];
  }
}
