import fetch from "node-fetch";

const endpoint = "https://api.hiro.so";
const apiKey = process.env.HIRO_API_KEY!;

export interface Block {
  height: number;
  block_time: number;
}

interface BlocksResponse {
  results: Block[];
}

interface Tx {
  fee_rate: number;
  tx_size: number;
}

interface TxsResponse {
  results: Tx[];
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function getLatestBlockHeight(): Promise<number> {
  const res = await fetchJSON<BlocksResponse>(
    `${endpoint}/extended/v1/block?limit=1`
  );
  return res.results[0].height;
}

export async function getBlock(height: number): Promise<Block> {
  return fetchJSON<Block>(
    `${endpoint}/extended/v1/block/by_height/${height}`
  );
}

export async function getBlockFees(height: number): Promise<number> {
  const txs = await fetchJSON<TxsResponse>(
    `${endpoint}/extended/v1/tx/block_height/${height}`
  );

  // fee = fee_rate * tx_size (microSTX)
  const totalMicroStx = txs.results.reduce(
    (sum, tx) => sum + tx.fee_rate * tx.tx_size,
    0
  );

  return totalMicroStx / 1e6; // STX
}
