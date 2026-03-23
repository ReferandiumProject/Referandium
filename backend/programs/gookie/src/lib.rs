use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use mpl_token_metadata::types::{DataV2, Creator};

declare_id!("3VkzfA6GU6VhMdEnYRJywLLEQ454B9gmQoNh4ycVFFS5");

const ANTI_SNIPE_EXTENSION: i64 = 60;
const MIN_BID_INCREMENT_RFRM: u64 = 10_000_000_000;

#[program]
pub mod gookie {
    use super::*;

    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        treasury: Pubkey,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform_config;
        platform.authority = ctx.accounts.authority.key();
        platform.treasury = treasury;
        platform.auction_counter = 0;
        platform.bump = ctx.bumps.platform_config;
        Ok(())
    }

    pub fn create_gookie_auction(
        ctx: Context<CreateGookieAuction>,
        title: String,
        description: String,
        starting_bid_rfrm: u64,
        auction_end_time: i64,
    ) -> Result<()> {
        require!(title.len() <= 100, GookieError::InvalidInput);
        require!(description.len() <= 500, GookieError::InvalidInput);
        require!(starting_bid_rfrm > 0, GookieError::InvalidInput);
        
        let clock = Clock::get()?;
        require!(auction_end_time > clock.unix_timestamp, GookieError::InvalidInput);

        let platform = &mut ctx.accounts.platform_config;
        let auction = &mut ctx.accounts.gookie_auction;
        
        auction.auction_id = platform.auction_counter;
        auction.title = title;
        auction.description = description;
        auction.starting_bid_rfrm = starting_bid_rfrm;
        auction.current_highest_bid = 0;
        auction.highest_bidder = Pubkey::default();
        auction.auction_end_time = auction_end_time;
        auction.status = AuctionStatus::Active;
        auction.nft_mint = None;
        auction.market_id = String::new();
        auction.locked_rfrm = 0;
        auction.is_slashed = false;
        auction.slash_reason = String::new();
        auction.fee_approved = false;
        auction.bump = ctx.bumps.gookie_auction;

        platform.auction_counter += 1;

        Ok(())
    }

    pub fn place_bid(
        ctx: Context<PlaceBid>,
        bid_amount_rfrm: u64,
    ) -> Result<()> {
        let auction = &mut ctx.accounts.gookie_auction;
        let clock = Clock::get()?;

        require!(
            auction.status == AuctionStatus::Active,
            GookieError::AuctionNotActive
        );
        require!(
            clock.unix_timestamp < auction.auction_end_time,
            GookieError::AuctionNotActive
        );

        let min_bid = if auction.current_highest_bid == 0 {
            auction.starting_bid_rfrm
        } else {
            auction.current_highest_bid + MIN_BID_INCREMENT_RFRM
        };

        require!(bid_amount_rfrm >= min_bid, GookieError::BidTooLow);

        if auction.current_highest_bid > 0 {
            let auction_key = auction.key();
            
            let seeds = &[
                b"gookie_escrow",
                auction_key.as_ref(),
                &[ctx.bumps.escrow_token_account],
            ];
            let signer = &[&seeds[..]];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_token_account.to_account_info(),
                        to: ctx.accounts.previous_bidder_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_token_account.to_account_info(),
                    },
                    signer,
                ),
                auction.current_highest_bid,
            )?;
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bidder_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            bid_amount_rfrm,
        )?;

        auction.current_highest_bid = bid_amount_rfrm;
        auction.highest_bidder = ctx.accounts.bidder.key();

        if auction.auction_end_time - clock.unix_timestamp < ANTI_SNIPE_EXTENSION {
            auction.auction_end_time += ANTI_SNIPE_EXTENSION;
        }

        Ok(())
    }

    pub fn close_auction(ctx: Context<CloseAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.gookie_auction;
        let clock = Clock::get()?;

        require!(
            auction.status == AuctionStatus::Active,
            GookieError::AuctionNotActive
        );
        require!(
            clock.unix_timestamp >= auction.auction_end_time,
            GookieError::AuctionStillActive
        );
        require!(
            auction.current_highest_bid > 0,
            GookieError::InvalidInput
        );

        auction.status = AuctionStatus::Won;
        auction.locked_rfrm = auction.current_highest_bid;

        Ok(())
    }

    pub fn mint_gookie_nft(
        ctx: Context<MintGookieNft>,
        market_id: String,
    ) -> Result<()> {
        require!(market_id.len() <= 100, GookieError::InvalidInput);
        
        let auction = &mut ctx.accounts.gookie_auction;

        require!(
            auction.status == AuctionStatus::Won,
            GookieError::AuctionNotActive
        );
        require!(
            ctx.accounts.winner.key() == auction.highest_bidder,
            GookieError::NotWinner
        );
        require!(auction.nft_mint.is_none(), GookieError::AlreadyMinted);

        let nft_name = format!("Gookie: {}", auction.title);
        let nft_name = if nft_name.len() > 32 {
            nft_name[..32].to_string()
        } else {
            nft_name
        };

        let creators = vec![Creator {
            address: ctx.accounts.platform_config.authority,
            verified: false,
            share: 100,
        }];

        let metadata_data = DataV2 {
            name: nft_name,
            symbol: "GOOKIE".to_string(),
            uri: "".to_string(),
            seller_fee_basis_points: 0,
            creators: Some(creators),
            collection: None,
            uses: None,
        };

        let auction_id_bytes = auction.auction_id.to_le_bytes();
        let seeds = &[
            b"gookie",
            auction_id_bytes.as_ref(),
            &[auction.bump],
        ];
        let signer = &[&seeds[..]];

        let metadata_program = ctx.accounts.token_metadata_program.to_account_info();
        let metadata_account = ctx.accounts.metadata.to_account_info();
        let mint_account = ctx.accounts.nft_mint.to_account_info();
        let mint_authority = auction.to_account_info();
        let payer_account = ctx.accounts.winner.to_account_info();
        let update_authority_account = auction.to_account_info();
        let system_program_account = ctx.accounts.system_program.to_account_info();

        let create_metadata_accounts_cpi = mpl_token_metadata::instructions::CreateMetadataAccountV3Cpi::new(
            &metadata_program,
            mpl_token_metadata::instructions::CreateMetadataAccountV3CpiAccounts {
                metadata: &metadata_account,
                mint: &mint_account,
                mint_authority: &mint_authority,
                payer: &payer_account,
                update_authority: (&update_authority_account, true),
                system_program: &system_program_account,
                rent: None,
            },
            mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
                data: metadata_data,
                is_mutable: true,
                collection_details: None,
            },
        );

        create_metadata_accounts_cpi.invoke_signed(signer)?;

        auction.nft_mint = Some(ctx.accounts.nft_mint.key());
        auction.market_id = market_id;
        auction.status = AuctionStatus::NftMinted;

        Ok(())
    }

    pub fn admin_slash(
        ctx: Context<AdminSlash>,
        reason: String,
    ) -> Result<()> {
        require!(reason.len() <= 200, GookieError::InvalidInput);
        
        let auction = &mut ctx.accounts.gookie_auction;

        require!(
            auction.status == AuctionStatus::Won || auction.status == AuctionStatus::NftMinted,
            GookieError::NotSlashable
        );
        require!(!auction.is_slashed, GookieError::NotSlashable);
        require!(auction.locked_rfrm > 0, GookieError::InvalidInput);

        let auction_key = auction.key();
        let seeds = &[
            b"gookie_escrow",
            auction_key.as_ref(),
            &[ctx.bumps.escrow_token_account],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer,
            ),
            auction.locked_rfrm,
        )?;

        auction.is_slashed = true;
        auction.slash_reason = reason;
        auction.status = AuctionStatus::Penalized;
        auction.locked_rfrm = 0;

        Ok(())
    }

    pub fn release_gookie(ctx: Context<ReleaseGookie>) -> Result<()> {
        let auction = &mut ctx.accounts.gookie_auction;

        require!(
            auction.status == AuctionStatus::NftMinted,
            GookieError::InvalidInput
        );
        require!(!auction.is_slashed, GookieError::NotSlashable);
        require!(auction.locked_rfrm > 0, GookieError::InvalidInput);

        let auction_key = auction.key();
        let seeds = &[
            b"gookie_escrow",
            auction_key.as_ref(),
            &[ctx.bumps.escrow_token_account],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer,
            ),
            auction.locked_rfrm,
        )?;

        auction.status = AuctionStatus::Completed;
        auction.fee_approved = true;
        auction.locked_rfrm = 0;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = authority,
        space = PlatformConfig::SIZE,
        seeds = [b"gookie_platform"],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateGookieAuction<'info> {
    #[account(
        mut,
        seeds = [b"gookie_platform"],
        bump = platform_config.bump,
        has_one = authority @ GookieError::NotAdmin,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        init,
        payer = authority,
        space = GookieAuction::SIZE,
        seeds = [b"gookie", platform_config.auction_counter.to_le_bytes().as_ref()],
        bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    #[account(
        init,
        payer = authority,
        seeds = [b"gookie_escrow", gookie_auction.key().as_ref()],
        bump,
        token::mint = rfrm_mint,
        token::authority = escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub rfrm_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(
        mut,
        seeds = [b"gookie", gookie_auction.auction_id.to_le_bytes().as_ref()],
        bump = gookie_auction.bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    #[account(
        mut,
        seeds = [b"gookie_escrow", gookie_auction.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub bidder_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub previous_bidder_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub bidder: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseAuction<'info> {
    #[account(
        seeds = [b"gookie_platform"],
        bump = platform_config.bump,
        has_one = authority @ GookieError::NotAdmin,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"gookie", gookie_auction.auction_id.to_le_bytes().as_ref()],
        bump = gookie_auction.bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintGookieNft<'info> {
    #[account(
        seeds = [b"gookie_platform"],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"gookie", gookie_auction.auction_id.to_le_bytes().as_ref()],
        bump = gookie_auction.bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    #[account(
        init,
        payer = winner,
        mint::decimals = 0,
        mint::authority = gookie_auction,
        mint::freeze_authority = gookie_auction,
    )]
    pub nft_mint: Account<'info, Mint>,

    /// CHECK: Metadata account is created and validated by Metaplex Token Metadata program CPI
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(mut)]
    pub winner: Signer<'info>,

    /// CHECK: Metaplex Token Metadata program address is validated by CPI call
    pub token_metadata_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminSlash<'info> {
    #[account(
        seeds = [b"gookie_platform"],
        bump = platform_config.bump,
        has_one = authority @ GookieError::NotAdmin,
        has_one = treasury,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"gookie", gookie_auction.auction_id.to_le_bytes().as_ref()],
        bump = gookie_auction.bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    #[account(
        mut,
        seeds = [b"gookie_escrow", gookie_auction.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub treasury: SystemAccount<'info>,

    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseGookie<'info> {
    #[account(
        seeds = [b"gookie_platform"],
        bump = platform_config.bump,
        has_one = authority @ GookieError::NotAdmin,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [b"gookie", gookie_auction.auction_id.to_le_bytes().as_ref()],
        bump = gookie_auction.bump,
    )]
    pub gookie_auction: Account<'info, GookieAuction>,

    #[account(
        mut,
        seeds = [b"gookie_escrow", gookie_auction.key().as_ref()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub auction_counter: u64,
    pub bump: u8,
}

impl PlatformConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct GookieAuction {
    pub auction_id: u64,
    pub title: String,
    pub description: String,
    pub starting_bid_rfrm: u64,
    pub current_highest_bid: u64,
    pub highest_bidder: Pubkey,
    pub auction_end_time: i64,
    pub status: AuctionStatus,
    pub nft_mint: Option<Pubkey>,
    pub market_id: String,
    pub locked_rfrm: u64,
    pub is_slashed: bool,
    pub slash_reason: String,
    pub fee_approved: bool,
    pub bump: u8,
}

impl GookieAuction {
    pub const SIZE: usize = 8 + 8 + (4 + 100) + (4 + 500) + 8 + 8 + 32 + 8 + 1 + (1 + 32) + (4 + 100) + 8 + 1 + (4 + 200) + 1 + 1;
}

#[account]
pub struct BidRecord {
    pub gookie_auction: Pubkey,
    pub bidder: Pubkey,
    pub bid_amount_rfrm: u64,
    pub is_current_highest: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl BidRecord {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AuctionStatus {
    Active,
    Won,
    NftMinted,
    Penalized,
    Completed,
}

#[error_code]
pub enum GookieError {
    #[msg("Only admin can perform this action.")]
    NotAdmin,
    #[msg("Auction is not active.")]
    AuctionNotActive,
    #[msg("Auction has not ended yet.")]
    AuctionStillActive,
    #[msg("Bid amount is too low.")]
    BidTooLow,
    #[msg("Only the auction winner can perform this action.")]
    NotWinner,
    #[msg("NFT has already been minted.")]
    AlreadyMinted,
    #[msg("Cannot slash this auction.")]
    NotSlashable,
    #[msg("Invalid input parameters.")]
    InvalidInput,
}
