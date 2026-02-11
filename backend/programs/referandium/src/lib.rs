use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("C3kp55sPwskwHygfFSqYZhqUEvEb3JDmjt2GhDXu31gV");

#[program]
pub mod referandium {
    use super::*;

    /// Initialize the platform vault (one-time setup by admin).
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.total_markets = 0;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Create a new policy prescription market.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: String,
        question: String,
        description: String,
        end_timestamp: i64,
    ) -> Result<()> {
        require!(question.len() <= 200, ReferandiumError::QuestionTooLong);
        require!(description.len() <= 500, ReferandiumError::DescriptionTooLong);
        require!(market_id.len() <= 64, ReferandiumError::MarketIdTooLong);

        let clock = Clock::get()?;
        require!(end_timestamp > clock.unix_timestamp, ReferandiumError::EndDateInPast);

        let market = &mut ctx.accounts.market;
        market.market_id = market_id;
        market.authority = ctx.accounts.authority.key();
        market.question = question;
        market.description = description;
        market.yes_count = 0;
        market.no_count = 0;
        market.total_pool = 0;
        market.end_timestamp = end_timestamp;
        market.outcome = MarketOutcome::Pending;
        market.created_at = clock.unix_timestamp;
        market.bump = ctx.bumps.market;

        let vault = &mut ctx.accounts.vault;
        vault.total_markets = vault.total_markets.checked_add(1).unwrap();

        Ok(())
    }

    /// Cast a vote (YES or NO) and deposit SOL into the market escrow.
    pub fn vote(ctx: Context<CastVote>, vote_direction: VoteDirection, amount: u64) -> Result<()> {
        let market = &ctx.accounts.market;

        // Validations
        require!(amount > 0, ReferandiumError::ZeroAmount);
        require!(
            market.outcome == MarketOutcome::Pending,
            ReferandiumError::MarketAlreadyResolved
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < market.end_timestamp,
            ReferandiumError::MarketExpired
        );

        // Transfer SOL from voter to market escrow PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.voter.to_account_info(),
                    to: ctx.accounts.market_escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        // Record the vote
        let vote_account = &mut ctx.accounts.vote_account;
        vote_account.voter = ctx.accounts.voter.key();
        vote_account.market = ctx.accounts.market.key();
        vote_account.direction = vote_direction;
        vote_account.amount = amount;
        vote_account.timestamp = clock.unix_timestamp;
        vote_account.bump = ctx.bumps.vote_account;

        // Update market counters
        let market = &mut ctx.accounts.market;
        match vote_direction {
            VoteDirection::Yes => {
                market.yes_count = market.yes_count.checked_add(1).unwrap();
            }
            VoteDirection::No => {
                market.no_count = market.no_count.checked_add(1).unwrap();
            }
        }
        market.total_pool = market.total_pool.checked_add(amount).unwrap();

        Ok(())
    }

    /// Settle (resolve) a market — only the vault authority can do this.
    pub fn settle_market(ctx: Context<SettleMarket>, outcome: MarketOutcome) -> Result<()> {
        require!(
            outcome == MarketOutcome::Yes || outcome == MarketOutcome::No,
            ReferandiumError::InvalidOutcome
        );

        let market = &mut ctx.accounts.market;
        require!(
            market.outcome == MarketOutcome::Pending,
            ReferandiumError::MarketAlreadyResolved
        );

        market.outcome = outcome;

        Ok(())
    }
}

// ============================================================
// ACCOUNTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = VaultAccount::SIZE,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        init,
        payer = authority,
        space = MarketAccount::SIZE,
        seeds = [b"market", market_id.as_bytes()],
        bump,
    )]
    pub market: Account<'info, MarketAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(
        mut,
        seeds = [b"market", market.market_id.as_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, MarketAccount>,

    /// The escrow PDA that holds SOL for this market.
    /// CHECK: This is a PDA used only as a SOL escrow, validated by seeds.
    #[account(
        mut,
        seeds = [b"escrow", market.key().as_ref()],
        bump,
    )]
    pub market_escrow: SystemAccount<'info>,

    #[account(
        init,
        payer = voter,
        space = VoteAccount::SIZE,
        seeds = [b"vote", market.key().as_ref(), voter.key().as_ref()],
        bump,
    )]
    pub vote_account: Account<'info, VoteAccount>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        seeds = [b"vault"],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.as_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, MarketAccount>,

    pub authority: Signer<'info>,
}

// ============================================================
// STATE
// ============================================================

#[account]
pub struct VaultAccount {
    pub authority: Pubkey,    // 32
    pub total_markets: u64,   // 8
    pub bump: u8,             // 1
}

impl VaultAccount {
    pub const SIZE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct MarketAccount {
    pub market_id: String,        // 4 + 64
    pub authority: Pubkey,        // 32
    pub question: String,         // 4 + 200
    pub description: String,      // 4 + 500
    pub yes_count: u64,           // 8
    pub no_count: u64,            // 8
    pub total_pool: u64,          // 8
    pub end_timestamp: i64,       // 8
    pub outcome: MarketOutcome,   // 1
    pub created_at: i64,          // 8
    pub bump: u8,                 // 1
}

impl MarketAccount {
    pub const SIZE: usize = 8   // discriminator
        + (4 + 64)              // market_id
        + 32                    // authority
        + (4 + 200)             // question
        + (4 + 500)             // description
        + 8                     // yes_count
        + 8                     // no_count
        + 8                     // total_pool
        + 8                     // end_timestamp
        + 1                     // outcome
        + 8                     // created_at
        + 1;                    // bump
}

#[account]
pub struct VoteAccount {
    pub voter: Pubkey,              // 32
    pub market: Pubkey,             // 32
    pub direction: VoteDirection,   // 1
    pub amount: u64,                // 8
    pub timestamp: i64,             // 8
    pub bump: u8,                   // 1
}

impl VoteAccount {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1;
}

// ============================================================
// ENUMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VoteDirection {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MarketOutcome {
    Pending,
    Yes,
    No,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum ReferandiumError {
    #[msg("Question exceeds 200 characters.")]
    QuestionTooLong,
    #[msg("Description exceeds 500 characters.")]
    DescriptionTooLong,
    #[msg("Market ID exceeds 64 characters.")]
    MarketIdTooLong,
    #[msg("End date must be in the future.")]
    EndDateInPast,
    #[msg("Deposit amount must be greater than zero.")]
    ZeroAmount,
    #[msg("This market has already been resolved.")]
    MarketAlreadyResolved,
    #[msg("This market has expired.")]
    MarketExpired,
    #[msg("Invalid outcome. Must be Yes or No.")]
    InvalidOutcome,
}
