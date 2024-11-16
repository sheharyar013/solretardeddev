import { Keypair } from "@solana/web3.js";
import bs58 from 'bs58';
import { BuyOnRaydium, SellOnRaydium } from "./raydium/swap";
import dotenv from 'dotenv';
dotenv.config();

let walletKeypair: Keypair | null = null;

export const initializeWalletKeypair = () => {
  if (process.env.PRIVATE_KEY) {
    //@ts-ignore
    const secretKey = bs58.decode(process.env.PRIVATE_KEY);
    walletKeypair = Keypair.fromSecretKey(secretKey);
  }
};

initializeWalletKeypair();

//CA
const tokenAddress = 'BjN2k1kRcDiw58qapPjz5TbUCZw9UGVSv3WJ51mMpump';
//solana amount
const solAmount = 0.001;
//token amount
const tokenAmount = 10000;

//buy tokens
// BuyOnRaydium(tokenAddress, solAmount);

//sell tokens
SellOnRaydium(tokenAddress, tokenAmount);
