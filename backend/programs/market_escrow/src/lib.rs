use anchor_lang::prelude::*;

declare_id!("Aby8pc1zLWbKUPgPzgh4ntbkTsbPaZWb6FyuxSwtkR8e");

#[program]
pub mod market_escrow {
    use super::*;

    pub fn initialize_platform(ctx: Context<InitializePlatform>, treasury: Pubkey) -> Result<()> {
        let platform_config = &mut ctx.accounts.platform_config;
        platform_config.authority = ctx.accounts.authority.key();
        platform_config.treasury = treasury;
        platform_config.bump = ctx.bumps.platform_config;
        Ok(())
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: String,
        gookie_wallet: Pubkey,
        end_time: i64,
    ) -> Result<()> {
        require!(market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        
        let market_escrow = &mut ctx.accounts.market_escrow;
        market_escrow.market_id = market_id;
        market_escrow.gookie_wallet = gookie_wallet;
        market_escrow.end_time = end_time;
        market_escrow.status = MarketStatus::Active;
        market_escrow.total_sol_locked = 0;
        market_escrow.signal_count = 0;
        market_escrow.total_yield_earned = 0;
        market_escrow.platform_fee = 0;
        market_escrow.gookie_fee = 0;
        market_escrow.user_share_pool = 0;
        market_escrow.buyback_amount = 0;
        market_escrow.fees_distributed = false;
        market_escrow.bump = ctx.bumps.market_escrow;
        Ok(())
    }

    pub fn deposit_signal(
        ctx: Context<DepositSignal>,
        market_id: String,
        sol_amount: u64,
        signal_direction: u8,
    ) -> Result<()> {
        require!(market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        require!(
            ctx.accounts.market_escrow.status == MarketStatus::Active,
            MarketEscrowError::MarketNotActive
        );
        require!(
            sol_amount >= 50_000_000,
            MarketEscrowError::InsufficientAmount
        );
        require!(
            signal_direction <= 1,
            MarketEscrowError::InvalidSignalDirection
        );

        let user_signal = &mut ctx.accounts.user_signal;
        user_signal.market_id = market_id;
        user_signal.user = ctx.accounts.user.key();
        user_signal.sol_amount = sol_amount;
        user_signal.signal_direction = signal_direction;
        user_signal.yield_claimed = false;
        user_signal.withdrawn = false;
        user_signal.bump = ctx.bumps.user_signal;

        let market_escrow = &mut ctx.accounts.market_escrow;
        market_escrow.total_sol_locked = market_escrow.total_sol_locked
            .checked_add(sol_amount)
            .ok_or(MarketEscrowError::InsufficientAmount)?;
        market_escrow.signal_count = market_escrow.signal_count
            .checked_add(1)
            .ok_or(MarketEscrowError::InsufficientAmount)?;

        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.market_escrow.key(),
            sol_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.market_escrow.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn set_yield(ctx: Context<SetYield>, _market_id: String, yield_amount: u64) -> Result<()> {
        require!(_market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        require!(
            ctx.accounts.market_escrow.status == MarketStatus::Active,
            MarketEscrowError::MarketNotActive
        );

        let market_escrow = &mut ctx.accounts.market_escrow;
        market_escrow.total_yield_earned = yield_amount;
        Ok(())
    }

    pub fn close_market(ctx: Context<CloseMarket>, _market_id: String) -> Result<()> {
        require!(_market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        let market_escrow = &mut ctx.accounts.market_escrow;
        
        require!(
            market_escrow.status == MarketStatus::Active,
            MarketEscrowError::MarketNotActive
        );

        let total_yield = market_escrow.total_yield_earned;
        
        let platform_fee = total_yield
            .checked_mul(20)
            .and_then(|x| x.checked_div(100))
            .ok_or(MarketEscrowError::InsufficientAmount)?;
        
        let gookie_fee = total_yield
            .checked_mul(30)
            .and_then(|x| x.checked_div(100))
            .ok_or(MarketEscrowError::InsufficientAmount)?;
        
        let user_share_pool = total_yield
            .checked_mul(45)
            .and_then(|x| x.checked_div(100))
            .ok_or(MarketEscrowError::InsufficientAmount)?;
        
        let buyback_amount = total_yield
            .checked_mul(5)
            .and_then(|x| x.checked_div(100))
            .ok_or(MarketEscrowError::InsufficientAmount)?;

        market_escrow.platform_fee = platform_fee;
        market_escrow.gookie_fee = gookie_fee;
        market_escrow.user_share_pool = user_share_pool;
        market_escrow.buyback_amount = buyback_amount;
        market_escrow.fees_distributed = true;
        market_escrow.status = MarketStatus::Closed;

        **ctx.accounts.market_escrow.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? += platform_fee;

        **ctx.accounts.market_escrow.to_account_info().try_borrow_mut_lamports()? -= gookie_fee;
        **ctx.accounts.gookie_wallet.try_borrow_mut_lamports()? += gookie_fee;
        
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, _market_id: String) -> Result<()> {
        require!(_market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        let market_escrow = &ctx.accounts.market_escrow;
        let user_signal = &mut ctx.accounts.user_signal;

        require!(
            market_escrow.status == MarketStatus::Closed,
            MarketEscrowError::MarketNotClosed
        );
        require!(
            !user_signal.withdrawn,
            MarketEscrowError::AlreadyWithdrawn
        );
        require!(
            market_escrow.fees_distributed,
            MarketEscrowError::FeesNotDistributed
        );

        let total_sol = market_escrow.total_sol_locked;
        let user_sol = user_signal.sol_amount;
        let user_share_pool = market_escrow.user_share_pool;

        let user_yield_share = (user_sol as u128)
            .checked_mul(user_share_pool as u128)
            .and_then(|x| x.checked_div(total_sol as u128))
            .ok_or(MarketEscrowError::InsufficientAmount)? as u64;

        let total_payout = user_sol
            .checked_add(user_yield_share)
            .ok_or(MarketEscrowError::InsufficientAmount)?;

        **ctx.accounts.market_escrow.to_account_info().try_borrow_mut_lamports()? -= total_payout;
        **ctx.accounts.user.try_borrow_mut_lamports()? += total_payout;

        user_signal.withdrawn = true;
        user_signal.yield_claimed = true;

        Ok(())
    }

    pub fn admin_withdraw_buyback(ctx: Context<AdminWithdrawBuyback>, _market_id: String) -> Result<()> {
        require!(_market_id.len() == 32, MarketEscrowError::InvalidMarketId);
        let market_escrow = &ctx.accounts.market_escrow;

        require!(
            market_escrow.status == MarketStatus::Closed,
            MarketEscrowError::MarketNotClosed
        );
        require!(
            market_escrow.fees_distributed,
            MarketEscrowError::FeesNotDistributed
        );

        let buyback_amount = market_escrow.buyback_amount;

        **ctx.accounts.market_escrow.to_account_info().try_borrow_mut_lamports()? -= buyback_amount;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? += buyback_amount;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [b"escrow_platform"],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CreateMarket<'info> {
    #[account(
        seeds = [b"escrow_platform"],
        bump = platform_config.bump,
        has_one = authority @ MarketEscrowError::NotAdmin
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + MarketEscrow::INIT_SPACE,
        seeds = [b"market", market_id.as_bytes()],
        bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct DepositSignal<'info> {
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump = market_escrow.bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    #[account(
        init,
        payer = user,
        space = 8 + UserSignal::INIT_SPACE,
        seeds = [b"signal", market_id.as_bytes(), user.key().as_ref()],
        bump
    )]
    pub user_signal: Account<'info, UserSignal>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct SetYield<'info> {
    #[account(
        seeds = [b"escrow_platform"],
        bump = platform_config.bump,
        has_one = authority @ MarketEscrowError::NotAdmin
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump = market_escrow.bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CloseMarket<'info> {
    #[account(
        seeds = [b"escrow_platform"],
        bump = platform_config.bump,
        has_one = authority @ MarketEscrowError::NotAdmin,
        has_one = treasury
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump = market_escrow.bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    
    #[account(mut)]
    pub gookie_wallet: SystemAccount<'info>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump = market_escrow.bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    #[account(
        mut,
        seeds = [b"signal", market_id.as_bytes(), user.key().as_ref()],
        bump = user_signal.bump,
        has_one = user
    )]
    pub user_signal: Account<'info, UserSignal>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct AdminWithdrawBuyback<'info> {
    #[account(
        seeds = [b"escrow_platform"],
        bump = platform_config.bump,
        has_one = authority @ MarketEscrowError::NotAdmin,
        has_one = treasury
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market_id.as_bytes()],
        bump = market_escrow.bump
    )]
    pub market_escrow: Account<'info, MarketEscrow>,
    
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MarketEscrow {
    #[max_len(100)]
    pub market_id: String,
    pub gookie_wallet: Pubkey,
    pub end_time: i64,
    pub status: MarketStatus,
    pub total_sol_locked: u64,
    pub signal_count: u32,
    pub total_yield_earned: u64,
    pub platform_fee: u64,
    pub gookie_fee: u64,
    pub user_share_pool: u64,
    pub buyback_amount: u64,
    pub fees_distributed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserSignal {
    #[max_len(100)]
    pub market_id: String,
    pub user: Pubkey,
    pub sol_amount: u64,
    pub signal_direction: u8,
    pub yield_claimed: bool,
    pub withdrawn: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Active,
    Closed,
}

#[error_code]
pub enum MarketEscrowError {
    #[msg("Only admin can perform this action.")]
    NotAdmin,
    
    #[msg("Market is not active.")]
    MarketNotActive,
    
    #[msg("Market is not closed.")]
    MarketNotClosed,
    
    #[msg("User has already signaled on this market.")]
    AlreadySignaled,
    
    #[msg("User has already withdrawn.")]
    AlreadyWithdrawn,
    
    #[msg("Insufficient amount or invalid parameters.")]
    InsufficientAmount,
    
    #[msg("Fees have not been distributed yet.")]
    FeesNotDistributed,
    
    #[msg("Invalid signal direction. Must be 0 (NO) or 1 (YES).")]
    InvalidSignalDirection,
    
    #[msg("Invalid market ID. Must be <= 100 characters.")]
    InvalidMarketId,
}
