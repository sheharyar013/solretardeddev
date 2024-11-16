import {
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  Market,
} from '@raydium-io/raydium-sdk';

import {
  Connection,
  PublicKey,
} from '@solana/web3.js';


import { MARKET_STATE_LAYOUT_V3 } from '@project-serum/serum';


export async function getPoolKeysByPoolId(connection: Connection, poolId: PublicKey): Promise<LiquidityPoolKeys | null> {
  const info = await connection.getAccountInfo(poolId);
  if (!info) {
    console.error('No Pool Info');
    return null;
  }

  let amAccountData = { id: poolId, programId: info.owner, ...LIQUIDITY_STATE_LAYOUT_V4.decode(info.data) }

  const marketProgramId = amAccountData.marketProgramId
  const allMarketInfo = await connection.getAccountInfo(marketProgramId)
  if (!allMarketInfo) {
    console.error('No Pool Info');
    return null;
  }

  const itemMarketInfo = MARKET_STATE_LAYOUT_V3.decode(allMarketInfo.data)

  // Fetch market information to extract fields like marketBids, marketAsks, etc.
  const marketPublicKey = amAccountData.marketId;
  const marketAccountInfo = await connection.getAccountInfo(marketPublicKey);
  if (!marketAccountInfo) {
    console.log('Market account not found');
    return null;
  }

  const marketAccountData = MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
  const marketInfo = {
    marketProgramId: allMarketInfo.owner,
    marketAuthority: Market.getAssociatedAuthority({ programId: allMarketInfo.owner, marketId: marketProgramId }).publicKey,
    marketBaseVault: marketAccountData.baseVault,
    marketQuoteVault: marketAccountData.quoteVault,
    marketBids: marketAccountData.bids,
    marketAsks: marketAccountData.asks,
    marketEventQueue: marketAccountData.eventQueue
  }

  const format: LiquidityPoolKeys = {
    id: amAccountData.id,
    baseMint: amAccountData.baseMint,
    quoteMint: amAccountData.quoteMint,
    lpMint: amAccountData.lpMint,
    baseDecimals: amAccountData.baseDecimal.toNumber(),
    quoteDecimals: amAccountData.quoteDecimal.toNumber(),
    lpDecimals: amAccountData.baseDecimal.toNumber(),
    version: 4,
    programId: amAccountData.programId,
    authority: Liquidity.getAssociatedAuthority({ programId: amAccountData.programId }).publicKey,
    openOrders: amAccountData.openOrders,
    targetOrders: amAccountData.targetOrders,
    baseVault: amAccountData.baseVault,
    quoteVault: amAccountData.quoteVault,
    withdrawQueue: amAccountData.withdrawQueue,
    lpVault: amAccountData.lpVault,
    marketVersion: 3,
    marketId: amAccountData.marketId,
    ...marketInfo,
    lookupTableAccount: PublicKey.default
  }

  return format
}