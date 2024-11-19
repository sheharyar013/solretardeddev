import assert from 'assert';
import base58 from 'bs58';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { Market, MARKET_STATE_LAYOUT_V3 } from '@project-serum/serum';
import { Metaplex } from '@metaplex-foundation/js';
import {
  Liquidity,
  LiquidityPoolKeys,
  Token,
  TokenAmount,
  TOKEN_PROGRAM_ID,
  MAINNET_PROGRAM_ID,
  Percent,
  SPL_ACCOUNT_LAYOUT,
} from '@raydium-io/raydium-sdk';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

dotenv.config();

// File path for cached market IDs
const MARKET_ID_FILE_PATH = path.resolve(__dirname, 'marketIDs.json');

const testConnection = async () => {
  const version = await connection.getVersion();
  console.log("Solana RPC version:", version);
};

console.log("-------------------> testConnection", testConnection);


// Solana connection
export const connection = new Connection(String(process.env.HELIUS_API_URL), 'finalized');

// Initialize marketIDs file if it doesn't exist
if (!fs.existsSync(MARKET_ID_FILE_PATH)) {
  fs.writeFileSync(MARKET_ID_FILE_PATH, JSON.stringify([]));
}

// Utility functions to manage market ID cache
const readMarketIDsFromFile = (): string[] => JSON.parse(fs.readFileSync(MARKET_ID_FILE_PATH, 'utf-8'));

const writeMarketIDToFile = (marketId: string): void => {
  const existingMarketIDs = readMarketIDsFromFile();
  console.log("Existing Market IDs:", existingMarketIDs);
  if (!existingMarketIDs.includes(marketId)) {
      existingMarketIDs.push(marketId);
      console.log("Writing new Market ID:", marketId);
      fs.writeFileSync(MARKET_ID_FILE_PATH, JSON.stringify(existingMarketIDs, null, 2));
  }
};

// Fetch market IDs and update cache
const fetchAndStoreMarketIDs = async (): Promise<void> => {
  try {
      console.log("Fetching market accounts...");
      const marketData = await Market.findAccountsByMints(
          connection,
          new PublicKey('So11111111111111111111111111111111111111112'),
          new PublicKey('Es9vMFrzaCERzR1zFGsBi7K2CUZNCcUwd1GCUyRftRKS'),
          MAINNET_PROGRAM_ID.OPENBOOK_MARKET
      );

      console.log("Market data fetched:", marketData);

      if (marketData.length === 0) {
          console.warn("No market data found!");
          return;
      }

      marketData.forEach(({ publicKey }) => writeMarketIDToFile(publicKey.toString()));
      console.log('🏆 Market IDs updated successfully.');
  } catch (error) {
      console.error('❗ Error fetching market IDs:', error);
  }
};

// Schedule a cron job to update market IDs every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
  console.log('⏳ Running cron job to update market IDs...');
  const start = Date.now();
  await fetchAndStoreMarketIDs();
  console.log(`Cron job completed in ${Date.now() - start} ms.`);
});


// Load pool keys from cached market IDs
export const loadPoolKeys_from_market = async (
  base: string,
  baseDecimal: number,
  quote: string,
  quoteDecimal: number
): Promise<LiquidityPoolKeys | undefined> => {
  const cachedMarketIDs = readMarketIDsFromFile();

  if (cachedMarketIDs.length > 0) {
    console.log('📂 Using cached market IDs.');
    const marketId = cachedMarketIDs[0];
    const marketInfo = await connection.getAccountInfo(new PublicKey(marketId));
    if (marketInfo) {
      const decodedInfo = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);

      return {
        ...Liquidity.getAssociatedPoolKeys({
          version: 4,
          marketVersion: 3,
          baseMint: new PublicKey(base),
          quoteMint: new PublicKey(quote),
          baseDecimals: baseDecimal,
          quoteDecimals: quoteDecimal,
          marketId: new PublicKey(marketId),
          programId: MAINNET_PROGRAM_ID.AmmV4,
          marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
        }),
        marketBaseVault: decodedInfo.baseVault,
        marketQuoteVault: decodedInfo.quoteVault,
        marketBids: decodedInfo.bids,
        marketAsks: decodedInfo.asks,
        marketEventQueue: decodedInfo.eventQueue,
      };
    }
  }

  console.log('⏳ Fetching market ID as no cache is available.');
  await fetchAndStoreMarketIDs();
  return loadPoolKeys_from_market(base, baseDecimal, quote, quoteDecimal); // Retry with updated cache
};

// Function to calculate token amounts and price details
export const calcAmountOut = async (
  poolKeys: LiquidityPoolKeys,
  rawAmountIn: number,
  swapInDirection: boolean,
  slippage: number
) => {
  const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });

  const direction = swapInDirection
    ? { currencyInMint: poolKeys.baseMint, currencyInDecimals: poolInfo.baseDecimals, currencyOutMint: poolKeys.quoteMint, currencyOutDecimals: poolInfo.quoteDecimals }
    : { currencyInMint: poolKeys.quoteMint, currencyInDecimals: poolInfo.quoteDecimals, currencyOutMint: poolKeys.baseMint, currencyOutDecimals: poolInfo.baseDecimals };

  const currencyIn = new Token(TOKEN_PROGRAM_ID, direction.currencyInMint, direction.currencyInDecimals);
  const amountIn = new TokenAmount(currencyIn, rawAmountIn, false);
  const currencyOut = new Token(TOKEN_PROGRAM_ID, direction.currencyOutMint, direction.currencyOutDecimals);
  const _slippage = new Percent(slippage, 100);

  const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
    poolKeys,
    poolInfo,
    amountIn,
    currencyOut,
    slippage: _slippage,
  });

  return {
    amountIn,
    amountOut: amountOut.toFixed(direction.currencyOutDecimals),
    minAmountOut,
    currentPrice,
    executionPrice,
    priceImpact,
    fee,
  };
};

export const getSwapTransaction = async (
  payer: any,
  from: string,
  to: string,
  amount: number,
  slippage: number,
  //@ts-ignore
  maxLamports: number = parseFloat(process.env.PRIORITY_RATE),
  poolKeys: LiquidityPoolKeys,
  fixedSide: 'in' | 'out' = 'in'
) => {
  console.log("⏳ *** Get SwapTransaction ***")
  const directionIn = to == poolKeys.quoteMint.toString()
  const { amountOut, minAmountOut, amountIn } = await calcAmountOut(poolKeys, amount, directionIn, slippage)
  const userTokenAccounts = await getWalletTokenAccount(payer.wallet.publicKey, false)
  const swapTransaction = await Liquidity.makeSwapInstructionSimple({
    connection,
    makeTxVersion: 0,
    poolKeys: {
      ...poolKeys,
    },
    userKeys: {
      tokenAccounts: userTokenAccounts,
      owner: payer.wallet.publicKey,
    },
    amountIn: amountIn,
    amountOut: minAmountOut,
    fixedSide: fixedSide,
    config: {
      bypassAssociatedCheck: false,
    },
    computeBudgetConfig: {
      microLamports: maxLamports,
    },
  })

  const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)
  console.log("🏆 *** End SwapTransaction ***")
  return { instructions, amount: amountOut }
}

export const getWalletTokenAccount = async (wallet: PublicKey, isToken2022: boolean = true) => {

  assert(connection)

  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
  });

  return walletTokenAccount.value.map((i) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }))
};

export function isValidPrivateKey(privateKey: string) {

  try {
    const key = base58.decode(privateKey)
    // const keypair = Keypair.fromSecretKey(key);
    return true;
  } catch (error) {
    return false;
  }
}

export function getWalletFromPrivateKey(privateKey: string): any | null {
  try {
    const key: Uint8Array = base58.decode(privateKey)
    const keypair: Keypair = Keypair.fromSecretKey(key);

    const publicKey = keypair.publicKey.toBase58()
    const secretKey = base58.encode(keypair.secretKey)

    return { publicKey, secretKey, wallet: keypair }
  } catch (error) {
    return null;
  }
}

export const generateNewWallet = () => {
  try {
    const keypair: Keypair = Keypair.generate()
    const publicKey = keypair.publicKey.toBase58()
    const secretKey = base58.encode(keypair.secretKey)

    return { publicKey, secretKey }

  } catch (error) {

    console.log(error)
    return null
  }
}

export const getTokenInfo = async (addr: string) => {
  const metaplex = Metaplex.make(connection);

  const mintAddress = new PublicKey(addr);

  const metadataAccount = metaplex
    .nfts()
    .pdas()
    .metadata({ mint: mintAddress });

  console.log("connect:***********", process.env.HELIUS_API_URL)

  const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);

  if (metadataAccountInfo) {
    const token = await metaplex
      .nfts()
      .findByMint({ mintAddress: mintAddress });
    if (token) {
      return { exist: true, symbol: token.mint.currency.symbol, decimal: token.mint.currency.decimals }
    } else {
      return { exist: false, symbol: "", decimal: 0 }
    }
  } else {
    // const provider = await new TokenListProvider().resolve();
    // const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
    // console.log(tokenList);
    // const tokenMap = tokenList.reduce((map, item) => {
    //   map.set(item.address, item);
    //   return map;
    // }, new Map());

    // const token = tokenMap.get(mintAddress.toBase58());

    // if (token) {
    //   return { exist: true, symbol: token.mint.currency.symbol, decimal: token.mint.currency.decimals }
    // } else {
    //   return { exist: false, symbol: "", decimal: 0 }
    // }
  }
}

export const getWalletSOLBalance = async (wallet: any): Promise<number> => {
  // assert(afx.web3Conn)
  try {
    let balance: number = await connection.getBalance(new PublicKey(wallet.publicKey)) / LAMPORTS_PER_SOL
    return balance
  } catch (error) {
    console.log(error)
  }

  return 0
}

export const getWalletTokenBalance = async (wallet: any, addr: any, decimal: number): Promise<number> => {
  const walletTokenAccounts = await getWalletTokenAccount(new PublicKey(wallet.publicKey), false);
  let tokenBalance = 0;
  if (walletTokenAccounts && walletTokenAccounts.length > 0) {
    for (const acc of walletTokenAccounts) {
      if (acc.accountInfo.mint.toBase58() === addr) {
        tokenBalance = Number(acc.accountInfo.amount) / (10 ** decimal);
        break
      }
    }
  }

  return tokenBalance
}