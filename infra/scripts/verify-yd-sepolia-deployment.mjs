#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const recordPath = resolve(projectRoot, "docs/deployments/ydtoken-sepolia.json");
const envPath = resolve(projectRoot, "packages/contracts/.env");
const defaultRpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
const expectedSupply = 80_000_000n * 10n ** 18n;
const expectedChainId = 11_155_111;

main().catch((error) => {
  console.error(`YDToken Sepolia 验收失败：${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  validateRecord(record);

  const localEnv = await readLocalEnv(envPath);
  const rpcUrl = process.env.VERIFY_RPC_URL || localEnv.SEPOLIA_RPC_URL || defaultRpcUrl;
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY || localEnv.ETHERSCAN_API_KEY;
  assert(etherscanApiKey, "缺少 ETHERSCAN_API_KEY，无法核验源码验证状态");

  const chainId = Number(BigInt(await rpc(rpcUrl, "eth_chainId")));
  assert(chainId === expectedChainId, `RPC 链 ID 错误：期望 ${expectedChainId}，实际 ${chainId}`);

  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [record.deploymentTransaction]);
  assert(receipt, "部署交易尚无回执");
  assert(BigInt(receipt.status) === 1n, "部署交易执行失败");
  assert(sameAddress(receipt.contractAddress, record.contractAddress), "回执合约地址与部署记录不一致");
  assert(Number(BigInt(receipt.blockNumber)) === record.deploymentBlockNumber, "回执区块与部署记录不一致");

  const code = await rpc(rpcUrl, "eth_getCode", [record.contractAddress, "latest"]);
  assert(typeof code === "string" && code !== "0x", "合约地址没有部署字节码");

  const [name, symbol, decimals, totalSupply, treasuryBalance] = await Promise.all([
    callString(rpcUrl, record.contractAddress, "0x06fdde03"),
    callString(rpcUrl, record.contractAddress, "0x95d89b41"),
    callUint(rpcUrl, record.contractAddress, "0x313ce567"),
    callUint(rpcUrl, record.contractAddress, "0x18160ddd"),
    callUint(rpcUrl, record.contractAddress, balanceOfData(record.treasury)),
  ]);

  assert(name === "YiDeng Token", `代币名称不一致：${name}`);
  assert(symbol === "YD", `代币符号不一致：${symbol}`);
  assert(decimals === 18n, `小数位不一致：${decimals}`);
  assert(totalSupply === expectedSupply, `总供应量不一致：${totalSupply}`);
  assert(treasuryBalance === expectedSupply, `Treasury 初始余额不一致：${treasuryBalance}`);

  const verification = await etherscanSource(record.contractAddress, etherscanApiKey);
  assert(verification.SourceCode?.trim(), "Etherscan 尚未返回已验证源码");
  assert(verification.ABI !== "Contract source code not verified", "Etherscan 源码尚未验证");
  assert(verification.ContractName === "YDToken", `Etherscan 合约名不一致：${verification.ContractName}`);
  assert(verification.CompilerVersion?.includes("0.8.26"), `Etherscan 编译器版本不一致：${verification.CompilerVersion}`);

  console.log(JSON.stringify({
    status: "PASS",
    chainId,
    contractAddress: record.contractAddress,
    deploymentTransaction: record.deploymentTransaction,
    deploymentBlockNumber: record.deploymentBlockNumber,
    token: { name, symbol, decimals: Number(decimals), totalSupply: totalSupply.toString() },
    treasury: record.treasury,
    sourceVerification: "etherscan-verified",
  }, null, 2));
}

function validateRecord(record) {
  assert(record?.schemaVersion === 1, "部署记录 schemaVersion 必须为 1");
  assert(record.network === "ethereum-sepolia", "部署记录网络必须为 ethereum-sepolia");
  assert(record.chainId === expectedChainId, `部署记录 chainId 必须为 ${expectedChainId}`);
  assert(record.contract === "YDToken", "部署记录 contract 必须为 YDToken");
  assertAddress(record.contractAddress, "contractAddress");
  assertAddress(record.deployer, "deployer");
  assertAddress(record.treasury, "treasury");
  assert(/^0x[0-9a-fA-F]{64}$/.test(record.deploymentTransaction), "deploymentTransaction 格式无效");
  assert(Number.isSafeInteger(record.deploymentBlockNumber) && record.deploymentBlockNumber > 0, "deploymentBlockNumber 格式无效");
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `RPC HTTP ${response.status}`);
  const body = await response.json();
  assert(!body.error, `RPC ${method} 错误：${body.error?.message ?? "unknown"}`);
  return body.result;
}

async function callString(rpcUrl, address, data) {
  return decodeString(await rpc(rpcUrl, "eth_call", [{ to: address, data }, "latest"]));
}

async function callUint(rpcUrl, address, data) {
  return BigInt(await rpc(rpcUrl, "eth_call", [{ to: address, data }, "latest"]));
}

function decodeString(encoded) {
  assert(/^0x[0-9a-fA-F]+$/.test(encoded), "字符串 ABI 返回值无效");
  const bytes = Buffer.from(encoded.slice(2), "hex");
  assert(bytes.length >= 64, "字符串 ABI 返回值过短");
  const offset = Number(BigInt(`0x${bytes.subarray(0, 32).toString("hex")}`));
  assert(Number.isSafeInteger(offset) && offset + 32 <= bytes.length, "字符串 ABI offset 无效");
  const length = Number(BigInt(`0x${bytes.subarray(offset, offset + 32).toString("hex")}`));
  assert(Number.isSafeInteger(length) && offset + 32 + length <= bytes.length, "字符串 ABI length 无效");
  return bytes.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

function balanceOfData(address) {
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

async function etherscanSource(address, apiKey) {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.search = new URLSearchParams({
    chainid: String(expectedChainId),
    module: "contract",
    action: "getsourcecode",
    address,
    apikey: apiKey,
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert(response.ok, `Etherscan HTTP ${response.status}`);
  const body = await response.json();
  assert(body.status === "1" && Array.isArray(body.result) && body.result.length === 1, `Etherscan 查询失败：${body.message ?? "unknown"}`);
  return body.result[0];
}

async function readLocalEnv(path) {
  try {
    const contents = await readFile(path, "utf8");
    return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return [];
      const separator = trimmed.indexOf("=");
      if (separator < 1) return [];
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      return [[key, value]];
    }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function assertAddress(value, label) {
  assert(/^0x[0-9a-fA-F]{40}$/.test(value), `${label} 格式无效`);
}

function sameAddress(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
