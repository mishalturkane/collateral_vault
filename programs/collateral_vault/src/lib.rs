use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked},
    associated_token::AssociatedToken,
};

declare_id!("G6TF8EdpP7gKwfPmNEhMLU7E34X5Fr3ujpAMdCzwHz8R");

#[program]
pub mod collateral_vault {
    use super::*;

    /// 1. Initialize vault authority (must be called first by admin)
    pub fn initialize_authority(
        ctx: Context<InitializeAuthority>,
        authorized_programs: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            authorized_programs.len() <= 10,
            VaultError::TooManyPrograms
        );
        
        let vault_authority = &mut ctx.accounts.vault_authority;
        vault_authority.authorized_programs = authorized_programs.clone();
        vault_authority.bump = ctx.bumps.vault_authority;
        vault_authority.admin = ctx.accounts.admin.key();
        
        emit!(AuthorityInitialized {
            admin: ctx.accounts.admin.key(),
            authority: vault_authority.key(),
            authorized_programs,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 2. Initialize user vault
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;
        
        vault.owner = ctx.accounts.user.key();
        vault.token_account = ctx.accounts.vault_token_account.key();
        vault.total_balance = 0;
        vault.locked_balance = 0;
        vault.available_balance = 0;
        vault.total_deposited = 0;
        vault.total_withdrawn = 0;
        vault.created_at = clock.unix_timestamp;
        vault.bump = ctx.bumps.vault;
        vault.token_mint = ctx.accounts.token_mint.key();
        
        emit!(VaultInitialized {
            user: ctx.accounts.user.key(),
            vault: vault.key(),
            token_mint: vault.token_mint,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }

    /// 3. Deposit collateral into vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Store vault key before mutable borrow
        let vault_key = ctx.accounts.vault.key();
        
        // Update vault state BEFORE transfer (CEI pattern)
        let vault = &mut ctx.accounts.vault;
        vault.total_balance = vault.total_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        vault.available_balance = vault.available_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        vault.total_deposited = vault.total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        let new_balance = vault.total_balance;
        
        // Transfer tokens from user to vault using Token-2022
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;
        
        emit!(DepositEvent {
            user: ctx.accounts.user.key(),
            vault: vault_key,
            amount,
            new_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 4. Lock collateral (called by authorized programs via CPI)
    pub fn lock_collateral(ctx: Context<LockCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        let vault = &ctx.accounts.vault;
        
        require!(
            vault.available_balance >= amount,
            VaultError::InsufficientAvailableBalance
        );
        
        // Update vault state
        let vault = &mut ctx.accounts.vault;
        vault.available_balance = vault.available_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        vault.locked_balance = vault.locked_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        emit!(LockEvent {
            vault: vault.key(),
            amount,
            locked_balance: vault.locked_balance,
            available_balance: vault.available_balance,
            caller: ctx.accounts.signer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 5. Unlock collateral (called by authorized programs via CPI)
    pub fn unlock_collateral(ctx: Context<UnlockCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        require!(
            ctx.accounts.vault.locked_balance >= amount,
            VaultError::InsufficientLockedBalance
        );
        
        // Update vault state
        let vault = &mut ctx.accounts.vault;
        vault.locked_balance = vault.locked_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        vault.available_balance = vault.available_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        emit!(UnlockEvent {
            vault: vault.key(),
            amount,
            locked_balance: vault.locked_balance,
            available_balance: vault.available_balance,
            caller: ctx.accounts.signer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 6. Withdraw collateral from vault
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        require!(
            ctx.accounts.vault.available_balance >= amount,
            VaultError::InsufficientAvailableBalance
        );
        
        // Store values needed for transfer before mutable borrow
        let vault_owner = ctx.accounts.vault.owner;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_key = ctx.accounts.vault.key();
        
        // Update vault state BEFORE transfer (CEI pattern)
        let vault = &mut ctx.accounts.vault;
        vault.total_balance = vault.total_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        vault.available_balance = vault.available_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        vault.total_withdrawn = vault.total_withdrawn
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        let new_balance = vault.total_balance;
        
        // PDA seeds for signing
        let seeds = &[
            b"vault",
            vault_owner.as_ref(),
            &[vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Transfer with PDA signer using Token-2022
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;
        
        emit!(WithdrawEvent {
            user: ctx.accounts.user.key(),
            vault: vault_key,
            amount,
            new_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 7. Transfer collateral between vaults (for settlements/liquidations)
    pub fn transfer_collateral(
        ctx: Context<TransferCollateral>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Check source vault has sufficient available balance
        require!(
            ctx.accounts.from_vault.available_balance >= amount,
            VaultError::InsufficientAvailableBalance
        );
        
        // Store values before mutable borrows
        let from_vault_owner = ctx.accounts.from_vault.owner;
        let from_vault_bump = ctx.accounts.from_vault.bump;
        let from_vault_key = ctx.accounts.from_vault.key();
        let to_vault_key = ctx.accounts.to_vault.key();
        
        // Update source vault
        let from_vault = &mut ctx.accounts.from_vault;
        from_vault.total_balance = from_vault.total_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        from_vault.available_balance = from_vault.available_balance
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        
        // Update destination vault
        let to_vault = &mut ctx.accounts.to_vault;
        to_vault.total_balance = to_vault.total_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        to_vault.available_balance = to_vault.available_balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        // PDA seeds for signing
        let seeds = &[
            b"vault",
            from_vault_owner.as_ref(),
            &[from_vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Transfer tokens between vault token accounts
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.from_vault_token_account.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.to_vault_token_account.to_account_info(),
            authority: ctx.accounts.from_vault.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;
        
        emit!(TransferEvent {
            from_vault: from_vault_key,
            to_vault: to_vault_key,
            amount,
            caller: ctx.accounts.signer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 8. Close vault (only when balance is zero and no locked collateral)
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        require!(
            vault.total_balance == 0,
            VaultError::VaultNotEmpty
        );
        
        require!(
            vault.locked_balance == 0,
            VaultError::HasLockedCollateral
        );
        
        emit!(VaultClosed {
            user: ctx.accounts.user.key(),
            vault: vault.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        // Vault account will be closed and rent returned to user
        Ok(())
    }

    /// 9. Add authorized program (admin only)
    pub fn add_authorized_program(
        ctx: Context<UpdateAuthority>,
        program: Pubkey,
    ) -> Result<()> {
        let vault_authority = &mut ctx.accounts.vault_authority;
        
        require!(
            vault_authority.authorized_programs.len() < 10,
            VaultError::TooManyPrograms
        );
        
        require!(
            !vault_authority.authorized_programs.contains(&program),
            VaultError::ProgramAlreadyAuthorized
        );
        
        vault_authority.authorized_programs.push(program);
        
        emit!(ProgramAuthorized {
            admin: ctx.accounts.admin.key(),
            program,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    /// 10. Remove authorized program (admin only)
    pub fn remove_authorized_program(
        ctx: Context<UpdateAuthority>,
        program: Pubkey,
    ) -> Result<()> {
        let vault_authority = &mut ctx.accounts.vault_authority;
        
        vault_authority.authorized_programs.retain(|&p| p != program);
        
        emit!(ProgramDeauthorized {
            admin: ctx.accounts.admin.key(),
            program,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

// ============ ACCOUNT STRUCTURES ============

#[account]
#[derive(InitSpace)]
pub struct CollateralVault {
    pub owner: Pubkey,              // 32 - Vault owner
    pub token_account: Pubkey,      // 32 - Associated token account
    pub total_balance: u64,         // 8 - Total balance in vault
    pub locked_balance: u64,        // 8 - Collateral locked for positions
    pub available_balance: u64,     // 8 - Available for withdrawal (total - locked)
    pub total_deposited: u64,       // 8 - Lifetime deposits
    pub total_withdrawn: u64,       // 8 - Lifetime withdrawals
    pub created_at: i64,            // 8 - Unix timestamp of creation
    pub bump: u8,                   // 1 - PDA bump seed
    pub token_mint: Pubkey,         // 32 - Token mint address (USDT)
}

#[account]
#[derive(InitSpace)]
pub struct VaultAuthority {
    pub admin: Pubkey,              // 32 - Authority admin
    #[max_len(10)]
    pub authorized_programs: Vec<Pubkey>, // 4 + (10 * 32) - Programs allowed to lock/unlock
    pub bump: u8,                   // 1 - PDA bump seed
}

// ============ CONTEXTS ============

#[derive(Accounts)]
pub struct InitializeAuthority<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + VaultAuthority::INIT_SPACE,
        seeds = [b"vault_authority"],
        bump
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mint::token_program = token_program,
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        init,
        payer = user,
        space = 8 + CollateralVault::INIT_SPACE,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        init,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        mint::token_program = token_program,
        constraint = token_mint.key() == vault.token_mint @ VaultError::InvalidTokenMint,
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        token::mint = vault.token_mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = vault.token_mint,
        token::authority = vault,
        token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct LockCollateral<'info> {
    pub signer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        seeds = [b"vault_authority"],
        bump = vault_authority.bump,
        constraint = vault_authority.authorized_programs.contains(&signer.key()) 
            @ VaultError::UnauthorizedProgram,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
}

#[derive(Accounts)]
pub struct UnlockCollateral<'info> {
    pub signer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        seeds = [b"vault_authority"],
        bump = vault_authority.bump,
        constraint = vault_authority.authorized_programs.contains(&signer.key()) 
            @ VaultError::UnauthorizedProgram,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == user.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        mint::token_program = token_program,
        constraint = token_mint.key() == vault.token_mint @ VaultError::InvalidTokenMint,
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        token::mint = vault.token_mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = vault.token_mint,
        token::authority = vault,
        token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct TransferCollateral<'info> {
    pub signer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", from_vault.owner.as_ref()],
        bump = from_vault.bump,
    )]
    pub from_vault: Account<'info, CollateralVault>,
    
    #[account(
        mut,
        seeds = [b"vault", to_vault.owner.as_ref()],
        bump = to_vault.bump,
    )]
    pub to_vault: Account<'info, CollateralVault>,
    
    #[account(
        seeds = [b"vault_authority"],
        bump = vault_authority.bump,
        constraint = vault_authority.authorized_programs.contains(&signer.key()) 
            @ VaultError::UnauthorizedProgram,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    #[account(
        mint::token_program = token_program,
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = from_vault,
        token::token_program = token_program,
    )]
    pub from_vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = to_vault,
        token::token_program = token_program,
    )]
    pub to_vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == user.key() @ VaultError::Unauthorized,
        close = user
    )]
    pub vault: Account<'info, CollateralVault>,
    
    #[account(
        mut,
        token::mint = vault.token_mint,
        token::authority = vault,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"vault_authority"],
        bump = vault_authority.bump,
        constraint = vault_authority.admin == admin.key() @ VaultError::Unauthorized,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
}

// ============ EVENTS ============

#[event]
pub struct VaultInitialized {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub token_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct LockEvent {
    pub vault: Pubkey,
    pub amount: u64,
    pub locked_balance: u64,
    pub available_balance: u64,
    pub caller: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UnlockEvent {
    pub vault: Pubkey,
    pub amount: u64,
    pub locked_balance: u64,
    pub available_balance: u64,
    pub caller: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TransferEvent {
    pub from_vault: Pubkey,
    pub to_vault: Pubkey,
    pub amount: u64,
    pub caller: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosed {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityInitialized {
    pub admin: Pubkey,
    pub authority: Pubkey,
    pub authorized_programs: Vec<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct ProgramAuthorized {
    pub admin: Pubkey,
    pub program: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProgramDeauthorized {
    pub admin: Pubkey,
    pub program: Pubkey,
    pub timestamp: i64,
}

// ============ ERROR CODES ============

#[error_code]
pub enum VaultError {
    #[msg("Invalid amount - must be greater than zero")]
    InvalidAmount,
    
    #[msg("Insufficient available balance")]
    InsufficientAvailableBalance,
    
    #[msg("Insufficient locked balance")]
    InsufficientLockedBalance,
    
    #[msg("Unauthorized - you do not have permission")]
    Unauthorized,
    
    #[msg("Unauthorized program - caller is not in authorized list")]
    UnauthorizedProgram,
    
    #[msg("Integer overflow occurred")]
    Overflow,
    
    #[msg("Integer underflow occurred")]
    Underflow,
    
    #[msg("Invalid token mint - does not match vault token")]
    InvalidTokenMint,
    
    #[msg("Too many programs - maximum 10 allowed")]
    TooManyPrograms,
    
    #[msg("Program already authorized")]
    ProgramAlreadyAuthorized,
    
    #[msg("Vault is not empty - cannot close")]
    VaultNotEmpty,
    
    #[msg("Vault has locked collateral - unlock before closing")]
    HasLockedCollateral,
}