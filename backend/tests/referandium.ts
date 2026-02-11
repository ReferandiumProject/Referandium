import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Referandium } from "../target/types/referandium";
import { assert } from "chai";

describe("referandium", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Referandium as Program<Referandium>;
  const authority = provider.wallet;

  // PDAs
  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;

  const marketId = "test-market-001";
  let marketPda: anchor.web3.PublicKey;
  let marketBump: number;

  before(async () => {
    [vaultPda, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [marketPda, marketBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(marketId)],
      program.programId
    );
  });

  it("Initializes the vault", async () => {
    const tx = await program.methods
      .initializeVault()
      .accounts({
        vault: vaultPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Initialize vault tx:", tx);

    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    assert.ok(vaultAccount.authority.equals(authority.publicKey));
    assert.equal(vaultAccount.totalMarkets.toNumber(), 0);
  });

  it("Creates a market", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // +1 day

    const tx = await program.methods
      .createMarket(
        marketId,
        "Should Solana implement fee markets?",
        "A policy prescription about Solana fee structure.",
        endTimestamp
      )
      .accounts({
        vault: vaultPda,
        market: marketPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Create market tx:", tx);

    const marketAccount = await program.account.marketAccount.fetch(marketPda);
    assert.equal(marketAccount.marketId, marketId);
    assert.equal(marketAccount.question, "Should Solana implement fee markets?");
    assert.equal(marketAccount.yesCount.toNumber(), 0);
    assert.equal(marketAccount.noCount.toNumber(), 0);
    assert.equal(marketAccount.totalPool.toNumber(), 0);

    const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
    assert.equal(vaultAccount.totalMarkets.toNumber(), 1);
  });

  it("Casts a YES vote", async () => {
    const voter = anchor.web3.Keypair.generate();

    // Airdrop SOL to voter
    const airdropSig = await provider.connection.requestAirdrop(
      voter.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const [votePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote"), marketPda.toBuffer(), voter.publicKey.toBuffer()],
      program.programId
    );

    const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), marketPda.toBuffer()],
      program.programId
    );

    const voteAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

    const tx = await program.methods
      .vote({ yes: {} }, voteAmount)
      .accounts({
        market: marketPda,
        marketEscrow: escrowPda,
        voteAccount: votePda,
        voter: voter.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([voter])
      .rpc();

    console.log("Vote tx:", tx);

    const marketAccount = await program.account.marketAccount.fetch(marketPda);
    assert.equal(marketAccount.yesCount.toNumber(), 1);
    assert.equal(marketAccount.totalPool.toNumber(), voteAmount.toNumber());

    const voteAccount = await program.account.voteAccount.fetch(votePda);
    assert.ok(voteAccount.voter.equals(voter.publicKey));
    assert.deepEqual(voteAccount.direction, { yes: {} });
  });

  it("Settles the market", async () => {
    const tx = await program.methods
      .settleMarket({ yes: {} })
      .accounts({
        vault: vaultPda,
        market: marketPda,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("Settle market tx:", tx);

    const marketAccount = await program.account.marketAccount.fetch(marketPda);
    assert.deepEqual(marketAccount.outcome, { yes: {} });
  });
});
