import { NATIVE_MINT } from '@solana/spl-token';
import { Connection, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DefaultTransactionExecutor, JitoTransactionExecutor } from '../transactions';
import * as utils from './utils';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Helius WebSocket connection
const HELIUS_WS_URL = process.env.HELIUS_WS_URL; // Ensure this is set in your .env file
if (!HELIUS_WS_URL) {
  throw new Error("⚠️ Helius WebSocket URL is not set in .env");
}

// Use WebSocket connection
const connection = new Connection(HELIUS_WS_URL, "confirmed"); // "confirmed" ensures recent finalized blocks are used

export const BuyOnRaydium = async (tokenAddress: string, amount: number) => {
  console.log("⏳ *** Buy Token ***");

  //@ts-ignore
  const depositWallet: any = utils.getWalletFromPrivateKey(process.env.PRIVATE_KEY);
  const SOLBalance: number = await utils.getWalletSOLBalance(depositWallet);

  if (SOLBalance < amount) {
    console.log("⚠️ Insufficient SOL amount for token to buy");
    return;
  }

  const tokenInfo = await utils.getTokenInfo(tokenAddress);
  const poolKeys: any = await utils.loadPoolKeys_from_market(
    tokenAddress,
    //@ts-ignore
    tokenInfo.decimal,
    NATIVE_MINT.toString(),
    9
  );

  //@ts-ignore
  let priority: number = parseInt(process.env.JITO_MEV) !== 0 ? 0 : parseFloat(process.env.PRIORITY_RATE || "0");
  priority *= LAMPORTS_PER_SOL;

  const { instructions, amount: _amount }: any = await utils.getSwapTransaction(
    depositWallet,
    NATIVE_MINT.toString(),
    tokenAddress,
    amount,
    //@ts-ignore
    parseInt(process.env.SLIPPAGE || "0"),
    priority,
    poolKeys,
    'in'
  );

  const txExecutor = new JitoTransactionExecutor(String(process.env.JITO_TIP_AMOUNT), connection);

  try {
    const latestBlockhash = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({
      payerKey: depositWallet.wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message());

    //@ts-ignore
    transaction.sign([depositWallet.wallet]);

    console.log(`⏳ *** Buy Transaction start...`);
    console.log(`⏳ Executing buy transaction...  ${new Date()}`);

    //@ts-ignore
    const { confirmed, signature } = await txExecutor.executeAndConfirm(transaction, depositWallet.wallet, latestBlockhash);

    if (confirmed && typeof signature === 'string') {
      console.log("🏆 *** BuyOnRaydium Success ***");
    } else {
      console.log(`❗ *** Transaction failed to buy token: ${tokenAddress}, Token Amount: ${amount} ***`);
    }
  } catch (err) {
    console.error("❗ *** Solana Network is very busy. Restart... ***", err);
  }
};

export const SellOnRaydium = async (tokenAddress: string, amount: number) => {
  console.log("⏳ *** Sell Token ***");

  //@ts-ignore
  const depositWallet: any = utils.getWalletFromPrivateKey(process.env.PRIVATE_KEY);
  const tokenInfo = await utils.getTokenInfo(tokenAddress);
  const tokenBalance: number = await utils.getWalletTokenBalance(
    depositWallet,
    tokenAddress,
    //@ts-ignore
    tokenInfo.decimal
  );

  let sellTokenBalance: number = amount ? (tokenBalance * amount) / 100 : 0;

  if (sellTokenBalance <= 0) {
    console.log("❗ *** Token balance is 0 to sell ***");
    return;
  }

  const poolKeys: any = await utils.loadPoolKeys_from_market(
    tokenAddress,
    //@ts-ignore
    tokenInfo.decimal,
    NATIVE_MINT.toString(),
    9
  );

  //@ts-ignore
  let priority: number = parseInt(process.env.JITO_MEV) !== 0 ? 0 : parseFloat(process.env.PRIORITY_RATE || "0");
  priority *= LAMPORTS_PER_SOL;

  const { instructions, amount: _amount }: any = await utils.getSwapTransaction(
    depositWallet,
    tokenAddress,
    NATIVE_MINT.toString(),
    amount,
    //@ts-ignore
    parseInt(process.env.SLIPPAGE || "0"),
    priority,
    poolKeys,
    'out'
  );

  const txExecutor = new JitoTransactionExecutor(String(process.env.JITO_TIP_AMOUNT), connection);

  try {
    const latestBlockhash = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({
      payerKey: depositWallet.wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message());

    //@ts-ignore
    transaction.sign([depositWallet.wallet]);

    console.log(`⏳ *** Sell Transaction start...`);
    console.log(`⏳ *** Executing sell transaction...  ${new Date()} ***`);

    //@ts-ignore
    const { confirmed, signature } = await txExecutor.executeAndConfirm(transaction, depositWallet.wallet, latestBlockhash);

    if (confirmed && typeof signature === 'string') {
      console.log("🏆 *** Success sell tokens ***");
    } else {
      console.log(`❗ *** Transaction failed to sell token: ${tokenAddress}, Token Amount: ${amount} ***`);
    }
  } catch (err) {
    console.error("❗ *** Solana Network is very busy. Restart... ***", err);
  }
};
