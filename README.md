# Stacks Fee Indexer

A high-performance blockchain indexer that continuously monitors the Stacks blockchain, indexes block fees, and provides a REST API for querying fee data. Built with TypeScript, MongoDB, and Express.

## Features

- 🔄 **Continuous Indexing**: Automatically indexes new blocks as they're mined
- ⚡ **Batch Processing**: Processes multiple blocks concurrently for faster indexing
- 🔁 **Auto-Resume**: Automatically resumes from the last indexed block on restart
- 🛡️ **Error Resilience**: Retry logic with exponential backoff for transient errors
- 🔍 **Gap Detection**: Automatically detects and fills missing blocks
- 📊 **REST API**: Query fee data by time range or block height range
- 🚀 **High Performance**: Optimized for querying millions of blocks efficiently
- 🔐 **Indexed Queries**: MongoDB indexes ensure fast queries regardless of data size

## Architecture

```
┌─────────────────┐
│  Stacks Chain   │
│  (Hiro API)     │
└────────┬────────┘
         │
         │ Fetch blocks & fees
         ▼
┌─────────────────┐
│   Indexer       │
│  - Batch fetch  │
│  - Retry logic  │
│  - Gap detection│
└────────┬────────┘
         │
         │ Store data
         ▼
┌─────────────────┐
│   MongoDB       │
│  - Block fees   │
│  - Timestamps   │
│  - Indexes      │
└────────┬────────┘
         │
         │ Query
         ▼
┌─────────────────┐
│   Express API   │
│  - /fees        │
│  - Aggregation  │
└─────────────────┘
```

### Components

1. **Indexer** (`src/indexer.ts`): Continuously fetches and indexes block fees
2. **API Server** (`src/api.ts`): REST API for querying fee data
3. **Hiro Client** (`src/hiro.ts`): Fetches block data from Hiro API
4. **Database** (`src/db.ts`): MongoDB connection management
5. **Models** (`src/models/blockFee.ts`): Mongoose schema for block fees

## Database Schema

### BlockFee Collection

```typescript
{
  block_height: Number,        // Unique block height (indexed)
  block_timestamp: Number,     // Unix timestamp in seconds (indexed)
  total_fees_stx: Number,      // Total fees in STX
  createdAt: Date,            // Auto-generated timestamp
  updatedAt: Date             // Auto-generated timestamp
}
```

**Indexes:**
- `block_height`: Unique index for fast lookups and duplicate prevention
- `block_timestamp`: Index for time-based queries
- Compound indexes created automatically for optimal query performance

**Collection Name**: Configurable via `Fees_COLLECTION` env variable (default: `stacks-fees`)

## Environment Variables

Create a `.env` file in the root directory:

```bash
# DATABASE DETAILS
MONGO_URI=mongodb://**************/db
MONGO_DB_NAME=db
MONGO_USERNAME=********************
MONGO_PASSWORD=********************
MONGO_AUTH_DB=********************
Fees_COLLECTION=stacks-fees

# API Configuration
HOST=127.0.0.1
PORT=3000

# Indexer Configuration
START_HEIGHT=1                    # Starting block height (default: 1)
BATCH_SIZE=10                     # Blocks processed concurrently (default: 10)
POLL_INTERVAL=120000              # Poll interval in ms when caught up (default: 120000 = 2 minutes)

# Hiro API (Optional but recommended)
HIRO_API_KEY=your_hiro_api_key_here
```

### Environment Variable Details

| Variable | Required | Default | Description |
|----------|----------|---------|------------|
| `MONGO_URI` | Yes | - | MongoDB connection string (can include auth) |
| `MONGO_DB_NAME` | No | `db` | Database name |
| `MONGO_USERNAME` | No | - | MongoDB username (if not in URI) |
| `MONGO_PASSWORD` | No | - | MongoDB password (if not in URI) |
| `MONGO_AUTH_DB` | No | `MONGO_DB_NAME` | Authentication database |
| `Fees_COLLECTION` | No | `stacks-fees` | Collection name for block fees |
| `PORT` | No | `3000` | API server port |
| `START_HEIGHT` | No | `1` | Starting block height for indexing |
| `BATCH_SIZE` | No | `5` | Number of blocks processed concurrently |
| `POLL_INTERVAL` | No | `60000` | Milliseconds to wait when caught up (1 minutes) |
| `HIRO_API_KEY` | No | - | Hiro API key for higher rate limits |

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd stacks-chain
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**
   ```bash
   pnpm run build
   ```

## Usage

### Development

```bash
pnpm dev
```

This will:
- Start the MongoDB connection
- Start the API server on port 3000 (or configured PORT)
- Begin indexing blocks from START_HEIGHT (or resume from last indexed)
- Automatically check for new blocks every 2 minutes when caught up

### Production

```bash
pnpm run build
pnpm start
```

## API Endpoints

### GET /fees

Query total fees within a time range or block height range.

#### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `startTime` | number | Unix timestamp (seconds or milliseconds) | `1704326400` or `1704326400000` |
| `endTime` | number | Unix timestamp (seconds or milliseconds) | `1704412799` or `1704412799000` |
| `startHeight` | number | Starting block height | `5673000` |
| `endHeight` | number | Ending block height | `5674000` |


#### Response Format

```json
{
  "token": "stx",
  "totalFees": 123.456789,
  "blockCount": 1000,
  "query": {
    "startTime": "1704326400",
    "startHeight": null,
    "endTime": "1704412799",
    "endHeight": null
  }
}
```

#### Example Queries

**Query by time range (Unix timestamp in seconds):**
```bash
curl "http://localhost:3000/fees?startTime=1704326400&endTime=1704412799"
```

**Query by time range (Unix timestamp in milliseconds):**
```bash
curl "http://localhost:3000/fees?startTime=1704326400000&endTime=1704412799000"
```

**Query by block height range:**
```bash
curl "http://localhost:3000/fees?startHeight=5673000&endHeight=5674000"
```

#### Response Examples

**Success Response:**
```json
{
  "token": "stx",
  "totalFees": 45.678901,
  "blockCount": 500,
  "query": {
    "startTime": "1704326400",
    "startHeight": null,
    "endTime": "1704412799",
    "endHeight": null
  }
}
```

**Error Response:**
```json
{
  "error": "Invalid startTime format",
  "message": "startTime must be a valid Unix timestamp (seconds or milliseconds)"
}
```

## How It Works

### Indexing Process

1. **Initialization**: Connects to MongoDB and checks for the last indexed block
2. **Resume Logic**: Automatically resumes from the last indexed block + 1
3. **Batch Processing**: Fetches blocks in batches (configurable via `BATCH_SIZE`)
4. **Concurrent Fetching**: Fetches block data and fees concurrently for each block
5. **Error Handling**: Retries failed blocks with exponential backoff
6. **Gap Detection**: After processing, scans for missing blocks and fills gaps
7. **Continuous Monitoring**: When caught up, polls every 1 minutes for new blocks

### Error Resilience

- **Transient Errors**: SSL errors, connection timeouts are automatically retried
- **Exponential Backoff**: Retry delays increase exponentially (1s, 2s, 4s...)
- **Sequential Retry**: Failed blocks are retried sequentially to ensure no gaps
- **Gap Filling**: Missing blocks are detected and filled automatically

## Development

### Project Structure

```
stacks-chain/
├── src/
│   ├── index.ts          # Main entry point
│   ├── indexer.ts         # Block indexing logic
│   ├── api.ts            # REST API server
│   ├── hiro.ts           # Hiro API client
│   ├── db.ts             # MongoDB connection
│   └── models/
│       └── blockFee.ts    # Mongoose schema
├── dist/                 # Compiled JavaScript
├── .env                  # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

- `pnpm dev`: Run in development mode with hot reload
- `pnpm build`: Compile TypeScript to JavaScript
- `pnpm start`: Run compiled production build
