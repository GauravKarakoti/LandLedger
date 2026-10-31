import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatGwei,
  formatEther,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia, hardhat } from "viem/chains";
import { LANDLEDGER_ABI, LANDLEDGER_CONTRACT } from "../src/lib/web3";
import { db } from "../src/server/db";
import { properties } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// CONFIGURATION & CLI FLAGS
// Usage:
//   bun run scripts/benchmark-grep.ts --env=local --runs=30
//   bun run scripts/benchmark-grep.ts --env=baseSepolia --runs=9
// ============================================================================
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const ENV_TARGET = (args.env || "local") as "local" | "baseSepolia";
const WARMUP_RUNS = Number(args.warmup ?? 2);
const MEASURED_RUNS = Number(args.runs ?? 30);
const TOTAL_RUNS = WARMUP_RUNS + MEASURED_RUNS;

const outDir = path.resolve(process.cwd(), "benchmarks");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const txCsvPath = path.join(outDir, `grep_transactions_${ENV_TARGET}.csv`);
const readCsvPath = path.join(outDir, `grep_retrievals_${ENV_TARGET}.csv`);
const summaryCsvPath = path.join(outDir, `grep_summary_${ENV_TARGET}.csv`);

// ============================================================================
// TYPES
// ============================================================================
interface TxMetricRow {
  runId: number;
  isWarmup: boolean;
  functionName: string;
  role: string;
  environment: string;
  txHash: string;
  inputSizeBytes: number;
  startTimestampMs: number;
  endTimestampMs: number;
  wallDurationMs: number;
  blockTimestampSec: number;
  blockDeltaSec: number;
  elapsedSincePrevTxMs: number;
  gasUsed: bigint;
  effectiveGasPriceWei: bigint;
  effectiveGasPriceGwei: number;
  costEth: number;
  status: string;
}

interface ReadMetricRow {
  runId: number;
  isWarmup: boolean;
  queryType: "Basic_OnChain" | "Detailed_OnChain" | "Basic_DB" | "Detailed_DB";
  environment: string;
  propertyId: string;
  startTimestampMs: number;
  endTimestampMs: number;
  latencyMs: number;
  payloadSizeBytes: number;
}

// ============================================================================
// STATISTICAL HELPERS (Median, IQR, Min, Max, Mean)
// ============================================================================
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!);
  }
  return sorted[base]!;
}

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, iqr: 0, min: 0, max: 0, q25: 0, q75: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const median = quantile(sorted, 0.5);
  const q25 = quantile(sorted, 0.25);
  const q75 = quantile(sorted, 0.75);
  const iqr = q75 - q25;
  return {
    count: sorted.length,
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    iqr: Number(iqr.toFixed(4)),
    q25: Number(q25.toFixed(4)),
    q75: Number(q75.toFixed(4)),
    min: Number(sorted[0]!.toFixed(4)),
    max: Number(sorted[sorted.length - 1]!.toFixed(4)),
  };
}

// ============================================================================
// CLIENT & CONTRACT INITIALIZATION
// ============================================================================
async function setupEnvironment() {
  if (ENV_TARGET === "local") {
    const rpcUrl = "http://127.0.0.1:8545";
    // Standard Hardhat Account #0 and #1 private keys
    const authorityAccount = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const citizenAccount = privateKeyToAccount(generatePrivateKey());

    const publicClient = createPublicClient({ chain: hardhat, transport: http(rpcUrl) });
    const authorityWallet = createWalletClient({
      account: authorityAccount,
      chain: hardhat,
      transport: http(rpcUrl),
    });
    const citizenWallet = createWalletClient({
      account: citizenAccount,
      chain: hardhat,
      transport: http(rpcUrl),
    });

    // Load compiled bytecode from Hardhat artifacts for clean local deployment
    const artifactPath = path.resolve(
      process.cwd(),
      "artifacts/contracts/LandLedger.sol/LandLedger.json"
    );
    if (!fs.existsSync(artifactPath)) {
      throw new Error(
        `Artifact not found at ${artifactPath}. Run "bun x hardhat compile" first.`
      );
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const deployHash = await authorityWallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as Hex,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

    console.log(`[Setup] Deployed fresh LandLedger on local Hardhat at ${receipt.contractAddress}`);
    return {
      publicClient,
      authorityWallet,
      citizenWallet,
      authorityAccount,
      citizenAccount,
      contractAddress: receipt.contractAddress!,
      abi: artifact.abi,
    };
  } else {
    const rpcUrl = process.env["BASE_SEPOLIA_RPC_URL"];
    const pk = process.env["PRIVATE_KEY"] as Hex | undefined;
    if (!rpcUrl || !pk) {
      throw new Error("Missing BASE_SEPOLIA_RPC_URL or PRIVATE_KEY in .env");
    }

    const authorityAccount = privateKeyToAccount(pk.startsWith("0x") ? pk : (`0x${pk}` as Hex));
    const citizenAccount = privateKeyToAccount(generatePrivateKey()); // 👈 Generate a unique recipient address for testnet

    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    const authorityWallet = createWalletClient({
      account: authorityAccount,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
    const citizenWallet = createWalletClient({
      account: citizenAccount,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    // Load compiled artifact bytecode to deploy a fresh test instance on Base Sepolia
    const artifactPath = path.resolve(
      process.cwd(),
      "artifacts/contracts/LandLedger.sol/LandLedger.json"
    );
    if (!fs.existsSync(artifactPath)) {
      throw new Error(
        `Artifact not found at ${artifactPath}. Run "bun x hardhat compile" first.`
      );
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    console.log("[Setup] Deploying fresh benchmark instance of LandLedger on Base Sepolia...");
    const deployHash = await authorityWallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as Hex,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

    console.log(`[Setup] Deployed test contract at ${receipt.contractAddress}`);

    return {
      publicClient,
      authorityWallet,
      citizenWallet,
      authorityAccount,
      citizenAccount,
      contractAddress: receipt.contractAddress!,
      abi: artifact.abi,
    };
  }
}

// ============================================================================
// CORE MEASUREMENT HELPER
// ============================================================================
async function main() {
  console.log(
    `\nStarting GREP Benchmark Suite | Environment: ${ENV_TARGET} | Warmup: ${WARMUP_RUNS} | Measured: ${MEASURED_RUNS}`
  );

  const {
    publicClient,
    authorityWallet,
    authorityAccount,
    citizenAccount,
    contractAddress,
    abi,
  } = await setupEnvironment();

  const txRows: TxMetricRow[] = [];
  const readRows: ReadMetricRow[] = [];
  let lastTxEndMs: number | null = null;

  async function measureTransaction(params: {
    runId: number;
    isWarmup: boolean;
    functionName: string;
    args: any[];
    role: "Authority" | "Owner" | "Citizen" | "Adjudicator";
  }) {
    const calldata = encodeFunctionData({
      abi,
      functionName: params.functionName,
      args: params.args,
    });
    const inputSizeBytes = (calldata.length - 2) / 2;

    const prevBlock = await publicClient.getBlock();
    const startTimestampMs = Date.now();
    const t0 = performance.now();

    const hash = await authorityWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: params.functionName,
      args: params.args,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const t1 = performance.now();
    const endTimestampMs = Date.now();

    const txBlock = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const wallDurationMs = Number((t1 - t0).toFixed(3));
    const blockTimestampSec = Number(txBlock.timestamp);
    const blockDeltaSec = Math.max(0, Number(txBlock.timestamp - prevBlock.timestamp));
    const elapsedSincePrevTxMs = lastTxEndMs ? startTimestampMs - lastTxEndMs : 0;
    lastTxEndMs = endTimestampMs;

    const gasUsed = receipt.gasUsed;
    const effectiveGasPriceWei = receipt.effectiveGasPrice ?? 0n;
    const effectiveGasPriceGwei = Number(formatGwei(effectiveGasPriceWei));
    const costEth = Number(formatEther(gasUsed * effectiveGasPriceWei));

    const row: TxMetricRow = {
      runId: params.runId,
      isWarmup: params.isWarmup,
      functionName: params.functionName,
      role: params.role,
      environment: ENV_TARGET,
      txHash: hash,
      inputSizeBytes,
      startTimestampMs,
      endTimestampMs,
      wallDurationMs,
      blockTimestampSec,
      blockDeltaSec,
      elapsedSincePrevTxMs,
      gasUsed,
      effectiveGasPriceWei,
      effectiveGasPriceGwei,
      costEth,
      status: receipt.status === "success" ? "SUCCESS" : "REVERTED",
    };

    txRows.push(row);
    return { receipt, row };
  }

  // Helper to check if optional functions exist in the deployed ABI
  const hasFunction = (name: string) =>
    abi.some((item: any) => item.type === "function" && item.name === name);

  const runPrefix = Math.random().toString(16).slice(2, 6).toUpperCase();
  const registeredPropertyIds: string[] = [];

  let disputeIdCounter = 1n; // 👈 Track sequential dispute IDs locally for the fresh deployment

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    const isWarmup = i <= WARMUP_RUNS;
    const propId = `PROP-${runPrefix}-${String(i).padStart(3, "0")}`;
    const legalId = `DL/NEW/${runPrefix}/${i}`;
    const metadataUri = JSON.stringify({
      ownerName: `Benchmark Owner ${i}`,
      location: "Sector 62, Noida, UP",
      areaSqm: 250 + i,
      valuationInr: 15_000_000 + i * 100_000,
      documentHash: `0x${i.toString(16).padStart(64, "a")}`,
    });

    process.stdout.write(
      `\r[Tx Loop] Iteration ${i}/${TOTAL_RUNS} (${isWarmup ? "Warm-up" : `Measured #${i - WARMUP_RUNS}`})...`
    );

    // A. Register Property (Fig. 6)
    await measureTransaction({
      runId: i,
      isWarmup,
      functionName: "registerProperty",
      args: [propId, authorityAccount.address, legalId, metadataUri],
      role: "Authority",
    });
    registeredPropertyIds.push(propId);

    // B. Raise Dispute
    await measureTransaction({
      runId: i,
      isWarmup,
      functionName: "raiseDispute",
      args: [propId, `Boundary survey overlap claim #${i} on parcel ${propId}`],
      role: "Citizen",
    });

    // C. Resolve Dispute using the exact sequential ID that was just minted
    const currentIdToResolve = disputeIdCounter++;
    await measureTransaction({
      runId: i,
      isWarmup,
      functionName: "resolveDispute",
      args: [currentIdToResolve, 1], // 1 = Resolved
      role: "Adjudicator",
    });

    const recipient = citizenAccount.address; 
    
    await measureTransaction({
      runId: i,
      isWarmup,
      functionName: "transferProperty",
      args: [propId, recipient],
      role: "Owner",
    });

    // E. Role Change Timestamps (Fig. 12) - setAdjudicator (if present in ABI)
    if (hasFunction("setAdjudicator")) {
      const randomAdjudicator = privateKeyToAccount(generatePrivateKey()).address;
      await measureTransaction({
        runId: i,
        isWarmup,
        functionName: "setAdjudicator",
        args: [randomAdjudicator, i % 2 === 1],
        role: "Authority",
      });
    }
  }

  console.log("\n[Tx Loop] Completed.");

  // ==========================================================================
  // 2. BASIC VS DETAILED RETRIEVAL LATENCY (Fig. 11)
  // ==========================================================================
  console.log(`[Retrieval Loop] Running ${TOTAL_RUNS} Basic vs Detailed Read Queries...`);

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    const isWarmup = i <= WARMUP_RUNS;
    const targetPropId = registeredPropertyIds[i - 1]!;

    // 1. Basic On-Chain Read: properties(id)
    const bStartMs = Date.now();
    const bt0 = performance.now();
    const basicData = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "properties",
      args: [targetPropId],
    });
    const bt1 = performance.now();
    readRows.push({
      runId: i,
      isWarmup,
      queryType: "Basic_OnChain",
      environment: ENV_TARGET,
      propertyId: targetPropId,
      startTimestampMs: bStartMs,
      endTimestampMs: Date.now(),
      latencyMs: Number((bt1 - bt0).toFixed(3)),
      payloadSizeBytes: Buffer.byteLength(
        JSON.stringify(basicData, (_, v) => (typeof v === "bigint" ? v.toString() : v))
      ),
    });

    // 2. Detailed On-Chain Read: getOwnershipHistory(id) or properties + propertyDisputes
    const dStartMs = Date.now();
    const dt0 = performance.now();
    let detailedData: unknown;
    if (hasFunction("getOwnershipHistory")) {
      detailedData = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "properties",
          args: [targetPropId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "getOwnershipHistory",
          args: [targetPropId],
        }),
      ]);
    } else {
      detailedData = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "properties",
          args: [targetPropId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi,
          functionName: "disputes",
          args: [BigInt(i)],
        }),
      ]);
    }
    const dt1 = performance.now();
    readRows.push({
      runId: i,
      isWarmup,
      queryType: "Detailed_OnChain",
      environment: ENV_TARGET,
      propertyId: targetPropId,
      startTimestampMs: dStartMs,
      endTimestampMs: Date.now(),
      latencyMs: Number((dt1 - dt0).toFixed(3)),
      payloadSizeBytes: Buffer.byteLength(
        JSON.stringify(detailedData, (_, v) => (typeof v === "bigint" ? v.toString() : v))
      ),
    });

    // 3. Optional PostgreSQL Basic vs Detailed Read (if DATABASE_URL is configured)
    if (process.env["DATABASE_URL"]) {
      try {
        const dbBasicStart = Date.now();
        const dbt0 = performance.now();
        const dbBasicRow = await db.select().from(properties).limit(1);
        const dbt1 = performance.now();
        readRows.push({
          runId: i,
          isWarmup,
          queryType: "Basic_DB",
          environment: ENV_TARGET,
          propertyId: dbBasicRow[0]?.id ?? targetPropId,
          startTimestampMs: dbBasicStart,
          endTimestampMs: Date.now(),
          latencyMs: Number((dbt1 - dbt0).toFixed(3)),
          payloadSizeBytes: Buffer.byteLength(JSON.stringify(dbBasicRow)),
        });

        const dbDetStart = Date.now();
        const dbdt0 = performance.now();
        const dbDetRow = await db.query.properties.findFirst({
          with: { transfers: true, disputes: true, events: true },
        });
        const dbdt1 = performance.now();
        readRows.push({
          runId: i,
          isWarmup,
          queryType: "Detailed_DB",
          environment: ENV_TARGET,
          propertyId: dbDetRow?.id ?? targetPropId,
          startTimestampMs: dbDetStart,
          endTimestampMs: Date.now(),
          latencyMs: Number((dbdt1 - dbdt0).toFixed(3)),
          payloadSizeBytes: Buffer.byteLength(JSON.stringify(dbDetRow ?? {})),
        });
      } catch {
        // Skip DB metrics if Postgres connection is unavailable
      }
    }
  }

  // ==========================================================================
  // 3. EXPORT RAW CSV LOGS
  // ==========================================================================
  const txHeader = [
    "run_id",
    "is_warmup",
    "function_name",
    "role",
    "environment",
    "tx_hash",
    "input_size_bytes",
    "start_timestamp_ms",
    "end_timestamp_ms",
    "wall_duration_ms",
    "block_timestamp_sec",
    "block_delta_sec",
    "elapsed_since_prev_tx_ms",
    "gas_used",
    "effective_gas_price_wei",
    "effective_gas_price_gwei",
    "cost_eth",
    "status",
  ].join(",");

  const txCsvLines = txRows.map((r) =>
    [
      r.runId,
      r.isWarmup,
      r.functionName,
      r.role,
      r.environment,
      r.txHash,
      r.inputSizeBytes,
      r.startTimestampMs,
      r.endTimestampMs,
      r.wallDurationMs,
      r.blockTimestampSec,
      r.blockDeltaSec,
      r.elapsedSincePrevTxMs,
      r.gasUsed.toString(),
      r.effectiveGasPriceWei.toString(),
      r.effectiveGasPriceGwei,
      r.costEth,
      r.status,
    ].join(",")
  );
  fs.writeFileSync(txCsvPath, [txHeader, ...txCsvLines].join("\n"));

  const readHeader = [
    "run_id",
    "is_warmup",
    "query_type",
    "environment",
    "property_id",
    "start_timestamp_ms",
    "end_timestamp_ms",
    "latency_ms",
    "payload_size_bytes",
  ].join(",");

  const readCsvLines = readRows.map((r) =>
    [
      r.runId,
      r.isWarmup,
      r.queryType,
      r.environment,
      r.propertyId,
      r.startTimestampMs,
      r.endTimestampMs,
      r.latencyMs,
      r.payloadSizeBytes,
    ].join(",")
  );
  fs.writeFileSync(readCsvPath, [readHeader, ...readCsvLines].join("\n"));

  // ==========================================================================
  // 4. GENERATE SUMMARY TABLE (First-9 vs All-Measured, Median, IQR, Min, Max)
  // ==========================================================================
  const measuredTxs = txRows.filter((r) => !r.isWarmup);
  const functions = [...new Set(measuredTxs.map((r) => r.functionName))];

  const summaryLines: string[] = [
    "category,metric,sample_window,count,median,iqr,q25,q75,mean,min,max",
  ];

  console.log("\n================================================================================");
  console.log(`GREP BENCHMARK SUMMARY (${ENV_TARGET}) — Warm-up discarded: ${WARMUP_RUNS} runs`);
  console.log("================================================================================");

  for (const fn of functions) {
    const fnRowsAll = measuredTxs.filter((r) => r.functionName === fn);
    const fnRowsFirst9 = fnRowsAll.slice(0, 9);

    for (const [windowLabel, subset] of [
      ["First_9 (GREP)", fnRowsFirst9],
      [`Full_${fnRowsAll.length}`, fnRowsAll],
    ] as const) {
      const durStats = computeStats(subset.map((r) => r.wallDurationMs));
      const gasStats = computeStats(subset.map((r) => Number(r.gasUsed)));
      const gweiStats = computeStats(subset.map((r) => r.effectiveGasPriceGwei));
      const costStats = computeStats(subset.map((r) => r.costEth));

      summaryLines.push(
        `${fn},wall_duration_ms,${windowLabel},${durStats.count},${durStats.median},${durStats.iqr},${durStats.q25},${durStats.q75},${durStats.mean},${durStats.min},${durStats.max}`,
        `${fn},gas_used,${windowLabel},${gasStats.count},${gasStats.median},${gasStats.iqr},${gasStats.q25},${gasStats.q75},${gasStats.mean},${gasStats.min},${gasStats.max}`,
        `${fn},gas_price_gwei,${windowLabel},${gweiStats.count},${gweiStats.median},${gweiStats.iqr},${gweiStats.q25},${gweiStats.q75},${gweiStats.mean},${gweiStats.min},${gweiStats.max}`,
        `${fn},tx_cost_eth,${windowLabel},${costStats.count},${costStats.median},${costStats.iqr},${costStats.q25},${costStats.q75},${costStats.mean},${costStats.min},${costStats.max}`
      );

      console.log(
        `\n[${fn}] (${windowLabel} | n=${durStats.count})` +
          `\n  Duration (ms) : Median=${durStats.median} | IQR=${durStats.iqr} | Min=${durStats.min} | Max=${durStats.max}` +
          `\n  Gas Used      : Median=${gasStats.median} | IQR=${gasStats.iqr} | Min=${gasStats.min} | Max=${gasStats.max}` +
          `\n  Cost (ETH)    : Median=${costStats.median} | Mean=${costStats.mean}`
      );
    }
  }

  const measuredReads = readRows.filter((r) => !r.isWarmup);
  const queryTypes = [...new Set(measuredReads.map((r) => r.queryType))];

  for (const qt of queryTypes) {
    const qtAll = measuredReads.filter((r) => r.queryType === qt);
    const qtFirst9 = qtAll.slice(0, 9);

    for (const [windowLabel, subset] of [
      ["First_9 (GREP)", qtFirst9],
      [`Full_${qtAll.length}`, qtAll],
    ] as const) {
      const latStats = computeStats(subset.map((r) => r.latencyMs));
      summaryLines.push(
        `${qt},retrieval_latency_ms,${windowLabel},${latStats.count},${latStats.median},${latStats.iqr},${latStats.q25},${latStats.q75},${latStats.mean},${latStats.min},${latStats.max}`
      );
      console.log(
        `\n[Read: ${qt}] (${windowLabel} | n=${latStats.count})` +
          `\n  Latency (ms)  : Median=${latStats.median} | IQR=${latStats.iqr} | Min=${latStats.min} | Max=${latStats.max}`
      );
    }
  }

  fs.writeFileSync(summaryCsvPath, summaryLines.join("\n"));
  console.log("\n================================================================================");
  console.log(`Saved Raw Tx Logs       -> ${txCsvPath}`);
  console.log(`Saved Raw Read Logs     -> ${readCsvPath}`);
  console.log(`Saved Summary Statistics -> ${summaryCsvPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});