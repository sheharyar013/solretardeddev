import { NATIVE_MINT } from '@solana/spl-token';
import { Connection, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DefaultTransactionExecutor, JitoTransactionExecutor } from '../transactions';
import * as utils from './utils'
import dotenv from 'dotenv';
dotenv.config();

//@ts-ignore
const connection = new Connection(process.env.QUICKNODE_URL);

export const BuyOnRaydium = async (tokenAddress: string, amount: number) => {
  console.log("⏳ *** Buy Token ***")
  //@ts-ignore
  const depositWallet: any = utils.getWalletFromPrivateKey(process.env.PRIVATE_KEY);
  const SOLBalance: number = await utils.getWalletSOLBalance(depositWallet)

  if (SOLBalance < amount) {
    console.log("⚠️ Insufficient SOL amount for token to buy")
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
  let priority: number = parseInt(process.env.JITO_MEV) !== 0 ? 0 : process.env.PRIORITY_RATE;
  priority = priority * LAMPORTS_PER_SOL;//token.priority*10**9;

  const { instructions: instructions, amount: _amount }: any = await utils.getSwapTransaction(
    depositWallet,
    NATIVE_MINT.toString(),
    tokenAddress,
    amount,
    //@ts-ignore
    parseInt(process.env.SLIPPAGE),
    priority,
    poolKeys,
    'in'
  );

  const instructionsList: any[] = [];
  instructionsList.push(...instructions);
  const txExecutor = new JitoTransactionExecutor(String(process.env.JITO_TIP_AMOUNT), connection)


  try {
    let latestBlockhash = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({
      payerKey: depositWallet.wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message());
    //@ts-ignore
    transaction.sign([depositWallet.wallet]);

    connection.simulateTransaction(transaction)
    console.log(`⏳ *** Buy Transaction start...`);
    console.log(`⏳ Executing buy transaction...  ${new Date()}`);
    //@ts-ignore
    const { confirmed, signature } = await txExecutor.executeAndConfirm(transaction, depositWallet.wallet, latestBlockhash);

    if (confirmed && typeof signature === 'string') {
      console.log("🏆 *** BuyOnRaydium Success ***")
    } else {
      console.log(`❗ *** Transaction failed to buy token: ${tokenAddress}, Token Amount: ${amount} ***`);
      return;
    }
  } catch (err) {
    console.log("❗ *** Solana Network is very busy. Restart... ***")
    return;
  }

}

export const SellOnRaydium = async (tokenAddress: string, amount: number) => {
  const depositWallet: any = utils.getWalletFromPrivateKey(String(process.env.PRIVATE_KEY));
  const tokenInfo = await utils.getTokenInfo(tokenAddress);
  let tokenBalance: number = await utils.getWalletTokenBalance(
    depositWallet,
    tokenAddress,
    //@ts-ignore
    tokenInfo.decimal
  );

  let sellTokenBalance: number = 0;
  if (amount) {
    sellTokenBalance = tokenBalance * amount / 100
  }

  if (sellTokenBalance <= 0) {
    console.log("❗ *** Token balance is 0 to sell ***");
    return
  }

  const poolKeys: any = await utils.loadPoolKeys_from_market(
    tokenAddress,
    //@ts-ignore
    tokenInfo.decimal,
    NATIVE_MINT.toString(),
    9
  );

  //@ts-ignore
  let priority: number = parseInt(process.env.JITO_MEV) !== 0 ? 0 : process.env.PRIORITY_RATE;
  priority = priority * LAMPORTS_PER_SOL;//token.priority*10**9;

  const { instructions: instructions, amount: _amount }: any = await utils.getSwapTransaction(
    depositWallet,
    tokenAddress,
    NATIVE_MINT.toString(),
    amount,
    //@ts-ignore
    parseInt(process.env.SLIPPAGE),
    priority,
    poolKeys,
    'out'
  );

  const instructionsList: any[] = [];
  instructionsList.push(...instructions);
  const txExecutor = new JitoTransactionExecutor(String(process.env.JITO_TIP_AMOUNT), connection)

  try {
    let latestBlockhash = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({
      payerKey: depositWallet.wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message());
    //@ts-ignore
    transaction.sign([depositWallet.wallet]);

    connection.simulateTransaction(transaction)

    console.log(`⏳ *** Sell Transaction start...`);
    console.log(`⏳ *** Executing sell transaction...  ${new Date()} ***`);
    //@ts-ignore
    const { confirmed, signature } = await txExecutor.executeAndConfirm(transaction, depositWallet.wallet, latestBlockhash);

    if (confirmed && typeof signature === 'string') {
      console.log("🏆 *** Success sell tokens *** ")
    } else {
      console.log(`❗ *** Transaction failed to sell token: ${tokenAddress}, Token Amount: ${amount} ***`);
      return;
    }
  } catch (err) {
    console.log("❗ *** Solana Network is very busy. Restart... ***")
    return;
  }

}