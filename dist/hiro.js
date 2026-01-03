import fetch from "node-fetch";
const endpoint = "https://api.hiro.so";
const apiKey = process.env.HIRO_API_KEY;
async function fetchJSON(url) {
    const res = await fetch(url, {
        headers: { "x-api-key": apiKey }
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return res.json();
}
export async function getLatestBlockHeight() {
    const res = await fetchJSON(`${endpoint}/extended/v1/block?limit=1`);
    return res.results[0].height;
}
export async function getBlock(height) {
    return fetchJSON(`${endpoint}/extended/v1/block/by_height/${height}`);
}
export async function getBlockFees(height) {
    const txs = await fetchJSON(`${endpoint}/extended/v1/tx/block_height/${height}`);
    // fee = fee_rate * tx_size (microSTX)
    const totalMicroStx = txs.results.reduce((sum, tx) => sum + tx.fee_rate * tx.tx_size, 0);
    return totalMicroStx / 1e6; // STX
}
