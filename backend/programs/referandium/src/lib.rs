use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("FUTVzQF86UckN9KhyuRajM4xRsYS62f24hTbJqGkZxed");

const SECONDS_PER_MONTH: i64 = 30 * 24 * 60 * 60;

#[program]
pub mod referandium {
    use super::*;

    /// Initialize the platform (one-time setup by admin)
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        required_usd_per_month: u64,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform_state;
        platform.authority = ctx.accounts.authority.key();
        platform.required_usd_per_month = required_usd_per_month;
        platform.bump = ctx.bumps.platform_state;
        Ok(())
    }

    /// Update platform settings (admin only)
    pub fn update_platform(
        ctx: Context<UpdatePlatform>,
        required_usd_per_month: u64,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform_state;
        platform.required_usd_per_month = required_usd_per_month;
        Ok(())
    }

    /// Lock RFRM tokens for N months of subscription
    pub fn lock_rfrm(
        ctx: Context<LockRFRM>,
        rfrm_amount: u64,
        months: u8,
    ) -> Result<()> {
        require!(rfrm_amount > 0, SubscriptionError::InsufficientAmount);
        require!(months > 0, SubscriptionError::InsufficientAmount);

        let clock = Clock::get()?;
        let subscription = &mut ctx.accounts.user_subscription;

        // Check if user already has an active subscription
        require!(!subscription.is_active, SubscriptionError::AlreadySubscribed);

        // Transfer RFRM from user to escrow PDA
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            rfrm_amount,
        )?;

        // Initialize subscription
        subscription.wallet = ctx.accounts.user.key();
        subscription.locked_rfrm = rfrm_amount;
        subscription.months_paid = months;
        subscription.subscription_start = clock.unix_timestamp;
        subscription.subscription_expiry = clock.unix_timestamp + (months as i64 * SECONDS_PER_MONTH);
        subscription.is_active = true;
        subscription.bump = ctx.bumps.user_subscription;

        Ok(())
    }

    /// Extend existing subscription by adding more months
    pub fn extend_subscription(
        ctx: Context<ExtendSubscription>,
        rfrm_amount: u64,
        months: u8,
    ) -> Result<()> {
        require!(rfrm_amount > 0, SubscriptionError::InsufficientAmount);
        require!(months > 0, SubscriptionError::InsufficientAmount);

        let subscription = &mut ctx.accounts.user_subscription;
        require!(subscription.is_active, SubscriptionError::InsufficientAmount);

        // Transfer additional RFRM to escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            rfrm_amount,
        )?;

        // Update subscription
        subscription.locked_rfrm = subscription.locked_rfrm.checked_add(rfrm_amount).unwrap();
        subscription.months_paid = subscription.months_paid.checked_add(months).unwrap();
        subscription.subscription_expiry = subscription.subscription_expiry
            .checked_add(months as i64 * SECONDS_PER_MONTH)
            .unwrap();

        Ok(())
    }

    /// Unlock RFRM after subscription expiry
    pub fn unlock_rfrm(ctx: Context<UnlockRFRM>) -> Result<()> {
        let subscription = &ctx.accounts.user_subscription;
        let clock = Clock::get()?;

        // Require subscription to have expired
        require!(
            clock.unix_timestamp >= subscription.subscription_expiry,
            SubscriptionError::SubscriptionStillActive
        );

        let locked_amount = subscription.locked_rfrm;
        require!(locked_amount > 0, SubscriptionError::InsufficientAmount);

        // Transfer RFRM back to user
        let seeds = &[
            b"escrow",
            subscription.wallet.as_ref(),
            &[subscription.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer,
            ),
            locked_amount,
        )?;

        // Deactivate subscription
        let subscription = &mut ctx.accounts.user_subscription;
        subscription.is_active = false;
        subscription.locked_rfrm = 0;

        Ok(())
    }

    /// Admin force unlock for refunds/disputes
    pub fn admin_unlock(ctx: Context<AdminUnlock>) -> Result<()> {
        let subscription = &ctx.accounts.user_subscription;
        let locked_amount = subscription.locked_rfrm;

        require!(locked_amount > 0, SubscriptionError::InsufficientAmount);

        // Transfer RFRM back to user
        let user_key = subscription.wallet;
        let seeds = &[
            b"escrow",
            user_key.as_ref(),
            &[subscription.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer,
            ),
            locked_amount,
        )?;

        // Deactivate subscription
        let subscription = &mut ctx.accounts.user_subscription;
        subscription.is_active = false;
        subscription.locked_rfrm = 0;

        Ok(())
    }
}

// ============================================================
// ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = authority,
        space = PlatformState::SIZE,
        seeds = [b"platform"],
        bump,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlatform<'info> {
    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform_state.bump,
        has_one = authority @ SubscriptionError::NotAdmin,
    )]
    pub platform_state: Account<'info, PlatformState>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct LockRFRM<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform_state.bump,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        init,
        payer = user,
        space = UserSubscription::SIZE,
        seeds = [b"subscription", user.key().as_ref()],
        bump,
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    #[account(
        init,
        payer = user,
        seeds = [b"escrow", user.key().as_ref()],
        bump,
        token::mint = rfrm_mint,
        token::authority = escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: RFRM token mint
    pub rfrm_mint: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExtendSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription", user.key().as_ref()],
        bump = user_subscription.bump,
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    #[account(
        mut,
        seeds = [b"escrow", user.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockRFRM<'info> {
    #[account(
        mut,
        seeds = [b"subscription", user.key().as_ref()],
        bump = user_subscription.bump,
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    #[account(
        mut,
        seeds = [b"escrow", user.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminUnlock<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform_state.bump,
        has_one = authority @ SubscriptionError::NotAdmin,
    )]
    pub platform_state: Account<'info, PlatformState>,

    #[account(
        mut,
        seeds = [b"subscription", user_subscription.wallet.as_ref()],
        bump = user_subscription.bump,
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    #[account(
        mut,
        seeds = [b"escrow", user_subscription.wallet.as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ============================================================
// STATE
// ============================================================

#[account]
pub struct PlatformState {
    pub authority: Pubkey,             // 32
    pub required_usd_per_month: u64,   // 8 (in cents, e.g. 2500 = $25)
    pub bump: u8,                      // 1
}

impl PlatformState {
    pub const SIZE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct UserSubscription {
    pub wallet: Pubkey,               // 32
    pub locked_rfrm: u64,             // 8
    pub months_paid: u8,              // 1
    pub subscription_start: i64,      // 8
    pub subscription_expiry: i64,     // 8
    pub is_active: bool,              // 1
    pub bump: u8,                     // 1
}

impl UserSubscription {
    pub const SIZE: usize = 8 + 32 + 8 + 1 + 8 + 8 + 1 + 1;
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum SubscriptionError {
    #[msg("Only admin can perform this action.")]
    NotAdmin,
    #[msg("Subscription is still active. Cannot unlock yet.")]
    SubscriptionStillActive,
    #[msg("Insufficient amount or invalid parameters.")]
    InsufficientAmount,
    #[msg("User already has an active subscription.")]
    AlreadySubscribed,
}
