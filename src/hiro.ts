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
  fee_rate: string | number;
  fee?: string | number;
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

  // Handle empty results or missing transactions
  if (!txs.results || txs.results.length === 0) {
    return 0;
  }

  // fee_rate is in microSTX (e.g., "180" = 0.00018 STX)
  // Sum all fee_rate values and convert from microSTX to STX
  const totalMicroStx = txs.results.reduce(
    (sum, tx) => {
      // Use fee field if available, otherwise use fee_rate
      const feeValue = tx.fee ?? tx.fee_rate ?? 0;
      const feeMicroStx = typeof feeValue === "string" 
        ? parseFloat(feeValue) 
        : feeValue;
      
      return sum + (isNaN(feeMicroStx) ? 0 : feeMicroStx);
    },
    0
  );

  const totalStx = totalMicroStx / 1e6;
  return isNaN(totalStx) ? 0 : totalStx;
}
