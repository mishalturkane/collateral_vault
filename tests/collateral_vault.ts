import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CollateralVault } from "../target/types/collateral_vault";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { expect } from "chai";

describe("collateral_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CollateralVault as Program<CollateralVault>;
  
  let tokenMint: Keypair;
  let admin: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let authorizedProgram: Keypair;
  
  let vaultAuthorityPda: PublicKey;
  let user1VaultPda: PublicKey;
  let user2VaultPda: PublicKey;
  
  let user1TokenAccount: PublicKey;
  let user2TokenAccount: PublicKey;

  // Helper function to log account details
  const logAccountDetails = async (testName: string) => {
    console.log(`\n📊 ========== ${testName} ==========`);
    console.log("🔑 Accounts:");
    console.log(`   Admin: ${admin.publicKey.toString()}`);
    console.log(`   User1: ${user1.publicKey.toString()}`);
    console.log(`   User2: ${user2.publicKey.toString()}`);
    console.log(`   Authorized Program: ${authorizedProgram.publicKey.toString()}`);
    
    console.log("\n🏦 PDA Addresses:");
    console.log(`   Vault Authority PDA: ${vaultAuthorityPda.toString()}`);
    console.log(`   User1 Vault PDA: ${user1VaultPda.toString()}`);
    console.log(`   User2 Vault PDA: ${user2VaultPda.toString()}`);
    
    console.log("\n💰 Token Accounts:");
    console.log(`   Token Mint: ${tokenMint.publicKey.toString()}`);
    console.log(`   User1 ATA: ${user1TokenAccount.toString()}`);
    console.log(`   User2 ATA: ${user2TokenAccount.toString()}`);
    
    try {
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      console.log(`   User1 Vault Token Account: ${user1VaultTokenAccount.toString()}`);
    } catch (e) {}
    
    try {
      const user2VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user2VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      console.log(`   User2 Vault Token Account: ${user2VaultTokenAccount.toString()}`);
    } catch (e) {}

    // Get balances
    console.log("\n💵 Balances:");
    
    try {
      const mintInfo = await getMint(provider.connection, tokenMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log(`   Token Mint Supply: ${mintInfo.supply.toString()}`);
      console.log(`   Token Decimals: ${mintInfo.decimals}`);
    } catch (e) {}
    
    try {
      const user1Balance = await provider.connection.getBalance(user1.publicKey);
      console.log(`   User1 SOL Balance: ${user1Balance / LAMPORTS_PER_SOL} SOL`);
    } catch (e) {}
    
    try {
      const user2Balance = await provider.connection.getBalance(user2.publicKey);
      console.log(`   User2 SOL Balance: ${user2Balance / LAMPORTS_PER_SOL} SOL`);
    } catch (e) {}
    
    try {
      const user1TokenAcc = await getAccount(provider.connection, user1TokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log(`   User1 Token Balance: ${user1TokenAcc.amount.toString()}`);
    } catch (e) {
      console.log(`   User1 Token Balance: Account not found`);
    }
    
    try {
      const user2TokenAcc = await getAccount(provider.connection, user2TokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log(`   User2 Token Balance: ${user2TokenAcc.amount.toString()}`);
    } catch (e) {
      console.log(`   User2 Token Balance: Account not found`);
    }

    // Get vault states
    console.log("\n🏦 Vault States:");
    
    try {
      const vaultAuthority = await program.account.vaultAuthority.fetch(vaultAuthorityPda);
      console.log(`   Vault Authority Admin: ${vaultAuthority.admin.toString()}`);
      console.log(`   Authorized Programs: ${vaultAuthority.authorizedPrograms.map(p => p.toString()).join(', ')}`);
    } catch (e) {
      console.log(`   Vault Authority: Not initialized`);
    }
    
    try {
      const user1Vault = await program.account.collateralVault.fetch(user1VaultPda);
      console.log(`   User1 Vault - Owner: ${user1Vault.owner.toString()}`);
      console.log(`   User1 Vault - Total: ${user1Vault.totalBalance.toString()}`);
      console.log(`   User1 Vault - Locked: ${user1Vault.lockedBalance.toString()}`);
      console.log(`   User1 Vault - Available: ${user1Vault.availableBalance.toString()}`);
      console.log(`   User1 Vault - Total Deposited: ${user1Vault.totalDeposited.toString()}`);
      console.log(`   User1 Vault - Total Withdrawn: ${user1Vault.totalWithdrawn.toString()}`);
    } catch (e) {
      console.log(`   User1 Vault: Not initialized or closed`);
    }
    
    try {
      const user2Vault = await program.account.collateralVault.fetch(user2VaultPda);
      console.log(`   User2 Vault - Owner: ${user2Vault.owner.toString()}`);
      console.log(`   User2 Vault - Total: ${user2Vault.totalBalance.toString()}`);
      console.log(`   User2 Vault - Locked: ${user2Vault.lockedBalance.toString()}`);
      console.log(`   User2 Vault - Available: ${user2Vault.availableBalance.toString()}`);
      console.log(`   User2 Vault - Total Deposited: ${user2Vault.totalDeposited.toString()}`);
      console.log(`   User2 Vault - Total Withdrawn: ${user2Vault.totalWithdrawn.toString()}`);
    } catch (e) {
      console.log(`   User2 Vault: Not initialized or closed`);
    }
    
    console.log("📊 ================================\n");
  };

  before(async () => {
    console.log("🚀 Starting setup...");
    
    // Generate keypairs
    admin = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();
    authorizedProgram = Keypair.generate();
    tokenMint = Keypair.generate();

    console.log("🔑 Generated Keypairs");
    console.log(`   Admin: ${admin.publicKey.toString()}`);
    console.log(`   User1: ${user1.publicKey.toString()}`);
    console.log(`   User2: ${user2.publicKey.toString()}`);
    console.log(`   Authorized Program: ${authorizedProgram.publicKey.toString()}`);
    console.log(`   Token Mint: ${tokenMint.publicKey.toString()}`);

    // Airdrop SOL to test accounts
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    
    console.log("💰 Airdropping SOL...");
    
    const adminAirdrop = await provider.connection.requestAirdrop(admin.publicKey, airdropAmount);
    await provider.connection.confirmTransaction(adminAirdrop);
    console.log(`   Admin airdropped: ${airdropAmount / LAMPORTS_PER_SOL} SOL`);
    
    const user1Airdrop = await provider.connection.requestAirdrop(user1.publicKey, airdropAmount);
    await provider.connection.confirmTransaction(user1Airdrop);
    console.log(`   User1 airdropped: ${airdropAmount / LAMPORTS_PER_SOL} SOL`);
    
    const user2Airdrop = await provider.connection.requestAirdrop(user2.publicKey, airdropAmount);
    await provider.connection.confirmTransaction(user2Airdrop);
    console.log(`   User2 airdropped: ${airdropAmount / LAMPORTS_PER_SOL} SOL`);

    // Create token mint using Anchor
    console.log("🏗️  Creating Token Mint...");
    const decimals = 6;
    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(82);
    console.log(`   Mint rent: ${mintRent} lamports`);
    
    const createMintIx = SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: tokenMint.publicKey,
      space: 82,
      lamports: mintRent,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initMintIx = {
      keys: [
        { pubkey: tokenMint.publicKey, isSigner: false, isWritable: true },
        { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data: Buffer.from([
        0, // InitializeMint instruction
        decimals,
        ...admin.publicKey.toBytes(),
        1, // Option: Some
        ...admin.publicKey.toBytes(),
      ]),
    };

    const tx = new anchor.web3.Transaction().add(createMintIx, initMintIx);
    await provider.sendAndConfirm(tx, [admin, tokenMint]);
    console.log(`   Token mint created with decimals: ${decimals}`);

    // Create token accounts
    console.log("🏦 Creating Associated Token Accounts...");
    
    user1TokenAccount = getAssociatedTokenAddressSync(
      tokenMint.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`   User1 ATA: ${user1TokenAccount.toString()}`);

    user2TokenAccount = getAssociatedTokenAddressSync(
      tokenMint.publicKey,
      user2.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`   User2 ATA: ${user2TokenAccount.toString()}`);

    // Create ATAs
    const createUser1AtaIx = {
      keys: [
        { pubkey: user1.publicKey, isSigner: true, isWritable: true },
        { pubkey: user1TokenAccount, isSigner: false, isWritable: true },
        { pubkey: user1.publicKey, isSigner: false, isWritable: false },
        { pubkey: tokenMint.publicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([]),
    };

    const createUser2AtaIx = {
      keys: [
        { pubkey: user2.publicKey, isSigner: true, isWritable: true },
        { pubkey: user2TokenAccount, isSigner: false, isWritable: true },
        { pubkey: user2.publicKey, isSigner: false, isWritable: false },
        { pubkey: tokenMint.publicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([]),
    };

    const createAtaTx1 = new anchor.web3.Transaction().add(createUser1AtaIx);
    await provider.sendAndConfirm(createAtaTx1, [user1]);
    console.log("   User1 ATA created");

    const createAtaTx2 = new anchor.web3.Transaction().add(createUser2AtaIx);
    await provider.sendAndConfirm(createAtaTx2, [user2]);
    console.log("   User2 ATA created");

    // Mint tokens to users
    console.log("🪙 Minting tokens to users...");
    const mintAmount = BigInt(1000000 * 1e6);
    
    const mintToUser1Ix = {
      keys: [
        { pubkey: tokenMint.publicKey, isSigner: false, isWritable: true },
        { pubkey: user1TokenAccount, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data: Buffer.from([
        7, // MintTo instruction
        ...new anchor.BN(mintAmount.toString()).toArrayLike(Buffer, "le", 8),
      ]),
    };

    const mintToUser2Ix = {
      keys: [
        { pubkey: tokenMint.publicKey, isSigner: false, isWritable: true },
        { pubkey: user2TokenAccount, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data: Buffer.from([
        7, // MintTo instruction
        ...new anchor.BN(mintAmount.toString()).toArrayLike(Buffer, "le", 8),
      ]),
    };

    const mintTx1 = new anchor.web3.Transaction().add(mintToUser1Ix);
    await provider.sendAndConfirm(mintTx1, [admin]);
    console.log(`   Minted ${mintAmount.toString()} tokens to User1`);

    const mintTx2 = new anchor.web3.Transaction().add(mintToUser2Ix);
    await provider.sendAndConfirm(mintTx2, [admin]);
    console.log(`   Minted ${mintAmount.toString()} tokens to User2`);

    // Derive PDAs
    console.log("🔍 Deriving PDA addresses...");
    
    [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority")],
      program.programId
    );
    console.log(`   Vault Authority PDA: ${vaultAuthorityPda.toString()}`);

    [user1VaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user1.publicKey.toBuffer()],
      program.programId
    );
    console.log(`   User1 Vault PDA: ${user1VaultPda.toString()}`);

    [user2VaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user2.publicKey.toBuffer()],
      program.programId
    );
    console.log(`   User2 Vault PDA: ${user2VaultPda.toString()}`);
    
    console.log("✅ Setup completed!");
    await logAccountDetails("Initial Setup");
  });

  // Test 1: Initialize Authority
  describe("1. initialize_authority", () => {
    it("should initialize vault authority with authorized programs", async () => {
      console.log("🧪 Starting Test 1: Initialize Authority");
      
      await program.methods
        .initializeAuthority([authorizedProgram.publicKey])
        .accounts({
          admin: admin.publicKey,
          vaultAuthority: vaultAuthorityPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const authority = await program.account.vaultAuthority.fetch(vaultAuthorityPda);
      expect(authority.admin.toString()).to.equal(admin.publicKey.toString());
      expect(authority.authorizedPrograms.length).to.equal(1);
      expect(authority.authorizedPrograms[0].toString()).to.equal(authorizedProgram.publicKey.toString());
      
      console.log("✅ Vault Authority initialized successfully!");
      await logAccountDetails("After Initialize Authority");
    });
  });

  // Test 2: Initialize Vault
  describe("2. initialize_vault", () => {
    it("should initialize user vault", async () => {
      console.log("🧪 Starting Test 2: Initialize Vault");
      
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      console.log(`   User1 Vault Token Account: ${user1VaultTokenAccount.toString()}`);

      await program.methods
        .initializeVault()
        .accounts({
          user: user1.publicKey,
          tokenMint: tokenMint.publicKey,
          vault: user1VaultPda,
          userTokenAccount: user1TokenAccount,
          vaultTokenAccount: user1VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const vault = await program.account.collateralVault.fetch(user1VaultPda);
      expect(vault.owner.toString()).to.equal(user1.publicKey.toString());
      expect(vault.totalBalance.toNumber()).to.equal(0);
      expect(vault.lockedBalance.toNumber()).to.equal(0);
      expect(vault.availableBalance.toNumber()).to.equal(0);
      
      console.log("✅ User1 vault initialized successfully!");
      await logAccountDetails("After Initialize Vault");
    });
  });

  // Test 3: Deposit
  describe("3. deposit", () => {
    it("should deposit collateral into vault", async () => {
      console.log("🧪 Starting Test 3: Deposit");
      
      const depositAmount = new anchor.BN(1000 * 1e6);
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      
      console.log(`   Deposit Amount: ${depositAmount.toString()}`);

      await program.methods
        .deposit(depositAmount)
        .accounts({
          user: user1.publicKey,
          vault: user1VaultPda,
          tokenMint: tokenMint.publicKey,
          userTokenAccount: user1TokenAccount,
          vaultTokenAccount: user1VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      const vault = await program.account.collateralVault.fetch(user1VaultPda);
      expect(vault.totalBalance.toString()).to.equal(depositAmount.toString());
      expect(vault.availableBalance.toString()).to.equal(depositAmount.toString());
      expect(vault.totalDeposited.toString()).to.equal(depositAmount.toString());
      
      console.log("✅ Deposit successful!");
      await logAccountDetails("After Deposit");
    });
  });

  // Test 4: Lock Collateral
  describe("4. lock_collateral", () => {
    it("should lock collateral when called by authorized program", async () => {
      console.log("🧪 Starting Test 4: Lock Collateral");
      
      const lockAmount = new anchor.BN(500 * 1e6);
      console.log(`   Lock Amount: ${lockAmount.toString()}`);

      await program.methods
        .lockCollateral(lockAmount)
        .accounts({
          signer: authorizedProgram.publicKey,
          vault: user1VaultPda,
          vaultAuthority: vaultAuthorityPda,
        })
        .signers([authorizedProgram])
        .rpc();

      const vault = await program.account.collateralVault.fetch(user1VaultPda);
      expect(vault.lockedBalance.toString()).to.equal(lockAmount.toString());
      expect(vault.availableBalance.toString()).to.equal(new anchor.BN(500 * 1e6).toString());
      
      console.log("✅ Collateral locked successfully!");
      await logAccountDetails("After Lock Collateral");
    });

    it("should fail if caller is not authorized", async () => {
      console.log("🧪 Testing unauthorized lock attempt");
      
      const lockAmount = new anchor.BN(100 * 1e6);
      const unauthorizedSigner = Keypair.generate();
      console.log(`   Unauthorized Signer: ${unauthorizedSigner.publicKey.toString()}`);

      try {
        await program.methods
          .lockCollateral(lockAmount)
          .accounts({
            signer: unauthorizedSigner.publicKey,
            vault: user1VaultPda,
            vaultAuthority: vaultAuthorityPda,
          })
          .signers([unauthorizedSigner])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("UnauthorizedProgram");
        console.log("✅ Correctly rejected unauthorized lock attempt");
      }
      
      await logAccountDetails("After Unauthorized Lock Attempt");
    });
  });

  // Test 5: Unlock Collateral
  describe("5. unlock_collateral", () => {
    it("should unlock collateral when called by authorized program", async () => {
      console.log("🧪 Starting Test 5: Unlock Collateral");
      
      const unlockAmount = new anchor.BN(200 * 1e6);
      console.log(`   Unlock Amount: ${unlockAmount.toString()}`);

      await program.methods
        .unlockCollateral(unlockAmount)
        .accounts({
          signer: authorizedProgram.publicKey,
          vault: user1VaultPda,
          vaultAuthority: vaultAuthorityPda,
        })
        .signers([authorizedProgram])
        .rpc();

      const vault = await program.account.collateralVault.fetch(user1VaultPda);
      expect(vault.lockedBalance.toString()).to.equal(new anchor.BN(300 * 1e6).toString());
      expect(vault.availableBalance.toString()).to.equal(new anchor.BN(700 * 1e6).toString());
      
      console.log("✅ Collateral unlocked successfully!");
      await logAccountDetails("After Unlock Collateral");
    });
  });

  // Test 6: Withdraw
  describe("6. withdraw", () => {
    it("should withdraw available collateral from vault", async () => {
      console.log("🧪 Starting Test 6: Withdraw");
      
      const withdrawAmount = new anchor.BN(200 * 1e6);
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      
      console.log(`   Withdraw Amount: ${withdrawAmount.toString()}`);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          user: user1.publicKey,
          vault: user1VaultPda,
          tokenMint: tokenMint.publicKey,
          userTokenAccount: user1TokenAccount,
          vaultTokenAccount: user1VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      const vault = await program.account.collateralVault.fetch(user1VaultPda);
      expect(vault.totalBalance.toString()).to.equal(new anchor.BN(800 * 1e6).toString());
      expect(vault.availableBalance.toString()).to.equal(new anchor.BN(500 * 1e6).toString());
      expect(vault.totalWithdrawn.toString()).to.equal(withdrawAmount.toString());
      
      console.log("✅ Withdrawal successful!");
      await logAccountDetails("After Withdraw");
    });
  });

  // Test 7: Transfer Collateral
  describe("7. transfer_collateral", () => {
    before(async () => {
      console.log("🔧 Setting up for Test 7: Transfer Collateral");
      
      const user2VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user2VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      console.log(`   User2 Vault Token Account: ${user2VaultTokenAccount.toString()}`);

      await program.methods
        .initializeVault()
        .accounts({
          user: user2.publicKey,
          tokenMint: tokenMint.publicKey,
          vault: user2VaultPda,
          userTokenAccount: user2TokenAccount,
          vaultTokenAccount: user2VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
        
      console.log("✅ User2 vault initialized");
      await logAccountDetails("Before Transfer Collateral");
    });

    it("should transfer collateral between vaults", async () => {
      console.log("🧪 Starting Test 7: Transfer Collateral");
      
      const transferAmount = new anchor.BN(100 * 1e6);
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      const user2VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user2VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );
      
      console.log(`   Transfer Amount: ${transferAmount.toString()}`);
      console.log(`   From Vault: ${user1VaultPda.toString()}`);
      console.log(`   To Vault: ${user2VaultPda.toString()}`);

      await program.methods
        .transferCollateral(transferAmount)
        .accounts({
          signer: authorizedProgram.publicKey,
          fromVault: user1VaultPda,
          toVault: user2VaultPda,
          vaultAuthority: vaultAuthorityPda,
          tokenMint: tokenMint.publicKey,
          fromVaultTokenAccount: user1VaultTokenAccount,
          toVaultTokenAccount: user2VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authorizedProgram])
        .rpc();

      const fromVault = await program.account.collateralVault.fetch(user1VaultPda);
      const toVault = await program.account.collateralVault.fetch(user2VaultPda);
      
      expect(fromVault.totalBalance.toString()).to.equal(new anchor.BN(700 * 1e6).toString());
      expect(toVault.totalBalance.toString()).to.equal(transferAmount.toString());
      
      console.log("✅ Transfer successful!");
      await logAccountDetails("After Transfer Collateral");
    });
  });

  // Test 8: Close Vault
  describe("8. close_vault", () => {
    it("should close vault when balance is zero and no locked collateral", async () => {
      console.log("🧪 Starting Test 8: Close Vault");
      
      // First unlock remaining collateral
      console.log("   Step 1: Unlocking remaining collateral...");
      await program.methods
        .unlockCollateral(new anchor.BN(300 * 1e6))
        .accounts({
          signer: authorizedProgram.publicKey,
          vault: user1VaultPda,
          vaultAuthority: vaultAuthorityPda,
        })
        .signers([authorizedProgram])
        .rpc();
      console.log("   ✅ All collateral unlocked");
      
      await logAccountDetails("After Unlocking All Collateral");

      // Withdraw all funds
      console.log("   Step 2: Withdrawing all funds...");
      const user1VaultTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        user1VaultPda,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .withdraw(new anchor.BN(700 * 1e6))
        .accounts({
          user: user1.publicKey,
          vault: user1VaultPda,
          tokenMint: tokenMint.publicKey,
          userTokenAccount: user1TokenAccount,
          vaultTokenAccount: user1VaultTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();
      console.log("   ✅ All funds withdrawn");
      
      await logAccountDetails("After Withdrawing All Funds");

      // Close vault
      console.log("   Step 3: Closing vault...");
      await program.methods
        .closeVault()
        .accounts({
          user: user1.publicKey,
          vault: user1VaultPda,
          vaultTokenAccount: user1VaultTokenAccount,
        })
        .signers([user1])
        .rpc();
      console.log("   ✅ Vault closed");

      try {
        await program.account.collateralVault.fetch(user1VaultPda);
        expect.fail("Vault should be closed");
      } catch (err: any) {
        expect(err.message).to.include("Account does not exist");
        console.log("   ✅ Vault account successfully closed");
      }
      
      await logAccountDetails("After Close Vault");
    });
  });

  // Test 9: Add Authorized Program
  describe("9. add_authorized_program", () => {
    it("should add a new authorized program", async () => {
      console.log("🧪 Starting Test 9: Add Authorized Program");
      
      const newProgram = Keypair.generate();
      console.log(`   New Program: ${newProgram.publicKey.toString()}`);

      await program.methods
        .addAuthorizedProgram(newProgram.publicKey)
        .accounts({
          admin: admin.publicKey,
          vaultAuthority: vaultAuthorityPda,
        })
        .signers([admin])
        .rpc();

      const authority = await program.account.vaultAuthority.fetch(vaultAuthorityPda);
      expect(authority.authorizedPrograms.length).to.equal(2);
      expect(authority.authorizedPrograms[1].toString()).to.equal(newProgram.publicKey.toString());
      
      console.log("✅ New program added successfully!");
      await logAccountDetails("After Add Authorized Program");
    });

    it("should fail if not admin", async () => {
      console.log("🧪 Testing non-admin add attempt");
      
      const newProgram = Keypair.generate();
      console.log(`   Attempting to add: ${newProgram.publicKey.toString()}`);
      console.log(`   Using non-admin: ${user2.publicKey.toString()}`);

      try {
        await program.methods
          .addAuthorizedProgram(newProgram.publicKey)
          .accounts({
            admin: user2.publicKey,
            vaultAuthority: vaultAuthorityPda,
          })
          .signers([user2])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
        console.log("✅ Correctly rejected non-admin attempt");
      }
      
      await logAccountDetails("After Failed Add Attempt");
    });
  });

  // Test 10: Remove Authorized Program
  describe("10. remove_authorized_program", () => {
    it("should remove an authorized program", async () => {
      console.log("🧪 Starting Test 10: Remove Authorized Program");
      
      console.log(`   Removing program: ${authorizedProgram.publicKey.toString()}`);

      await program.methods
        .removeAuthorizedProgram(authorizedProgram.publicKey)
        .accounts({
          admin: admin.publicKey,
          vaultAuthority: vaultAuthorityPda,
        })
        .signers([admin])
        .rpc();

      const authority = await program.account.vaultAuthority.fetch(vaultAuthorityPda);
      expect(authority.authorizedPrograms.length).to.equal(1);
      expect(authority.authorizedPrograms.find(p => p.toString() === authorizedProgram.publicKey.toString())).to.be.undefined;
      
      console.log("✅ Program removed successfully!");
      await logAccountDetails("After Remove Authorized Program");
    });
  });

  // Final summary
  after(async () => {
    console.log("🎉 ========== ALL TESTS COMPLETED ==========");
    console.log("📋 Final State Summary:");
    
    const finalAdminBalance = await provider.connection.getBalance(admin.publicKey);
    const finalUser1Balance = await provider.connection.getBalance(user1.publicKey);
    const finalUser2Balance = await provider.connection.getBalance(user2.publicKey);
    
    console.log(`   Admin SOL Balance: ${finalAdminBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`   User1 SOL Balance: ${finalUser1Balance / LAMPORTS_PER_SOL} SOL`);
    console.log(`   User2 SOL Balance: ${finalUser2Balance / LAMPORTS_PER_SOL} SOL`);
    
    try {
      const mintInfo = await getMint(provider.connection, tokenMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log(`   Token Mint Supply: ${mintInfo.supply.toString()}`);
    } catch (e) {}
    
    console.log("🎉 =========================================");
  });
});