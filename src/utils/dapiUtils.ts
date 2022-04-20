import { StackItemJson } from '@cityofzion/neon-core/lib/sc';
import {
  sc, rpc, tx, wallet, u, CONST,
} from '@cityofzion/neon-core';
import { config } from '../config';
import { logger } from './loggingUtils';

const properties = config.getProperties();

export type SwapComputation = {
  ask: number,
  spread: number
};

// Network node
const RPC_NODE_URL: string = properties.rpcNodeUrl;
const RPC_CLIENT = new rpc.RPCClient(RPC_NODE_URL);
const NETWORK_MAGIC = properties.networkMagic;

// Script hashes
export const FLM_SCRIPT_HASH: string = properties.flmScriptHash;
export const LRB_SCRIPT_HASH: string = properties.lrbScriptHash;
export const USDL_SCRIPT_HASH: string = properties.usdlScriptHash;
export const AVIARY_SCRIPT_HASH: string = properties.aviaryScriptHash;
export const ROUTER_SCRIPT_HASH: string = properties.flamingoRouterScriptHash;
export const SWAP_FACTORY_SCRIPT_HASH: string = properties.flamingoSwapFactoryScriptHash;

export const FLM_FUSDT_SCRIPT_HASH: string = properties.flmFusdtScriptHash;
export const FLM_LRB_SCRIPT_HASH: string = properties.flmLrbScriptHash;
export const FLM_USDL_SCRIPT_HASH: string = properties.flmUsdlScriptHash;

// Entry point for all read operations
async function genericReadCall(scriptHash: string, operation: string, args: any[]) {
  const result = await RPC_CLIENT.invokeFunction(scriptHash, operation, args);
  const retVal = result.stack[0].value;
  return retVal;
}

export async function getDecimal0(contractHash: string) {
  return genericReadCall(contractHash, 'getToken0', []).then((ret) => {
    const tokenHash = u.HexString.fromBase64(ret as string).toLittleEndian();
    return genericReadCall(tokenHash, 'decimals', []).then((innerRet) => parseInt(innerRet as string, 10));
  });
}

export async function getDecimal1(contractHash: string) {
  return genericReadCall(contractHash, 'getToken1', []).then((ret) => {
    const tokenHash = u.HexString.fromBase64(ret as string).toLittleEndian();
    return genericReadCall(tokenHash, 'decimals', []).then((innerRet) => parseInt(innerRet as string, 10));
  });
}

export async function getToken0(contractHash: string) {
  return genericReadCall(contractHash, 'getToken0', []).then((ret) => u.HexString.fromBase64(ret as string).toLittleEndian());
}

export async function getToken1(contractHash: string) {
  return genericReadCall(contractHash, 'getToken1', []).then((ret) => u.HexString.fromBase64(ret as string).toLittleEndian());
}

export async function getExchangePair(contractHash: string, token1: string, token2: string) {
  const params = [
    sc.ContractParam.hash160(token1),
    sc.ContractParam.hash160(token2),
  ];
  return genericReadCall(contractHash, 'getExchangePairWithAssert', params).then((ret) => u.HexString.fromBase64(ret as string).toLittleEndian());
}

export async function getPoolReserves(contractHash: string) {
  return genericReadCall(contractHash, 'getReserves', []).then((ret) => ret as unknown as StackItemJson[]);
}

export async function getBalance(contractHash: string, account: wallet.Account) {
  return genericReadCall(contractHash, 'balanceOf', [sc.ContractParam.hash160(account.address)]).then((ret) => parseInt(ret as unknown as string, 10));
}

export async function computeAviarySwap(
  lrbPrice: number,
  lAssetPrice: number,
  buyLrb: boolean,
  quantity: number,
) {
  const buyLrbStr = buyLrb ? 1 : 0;
  const params = [
    sc.ContractParam.integer(lrbPrice),
    sc.ContractParam.integer(lAssetPrice),
    sc.ContractParam.integer(buyLrbStr),
    sc.ContractParam.integer(quantity),
  ];
  return genericReadCall(AVIARY_SCRIPT_HASH, 'computeSwapWithMin', params).then((ret) => {
    const retJson = ret as any as StackItemJson[];
    const swapComputation = {
      ask: parseInt(retJson[0].value as string, 10),
      spread: parseInt(retJson[1].value as string, 10),
    } as SwapComputation;
    return swapComputation;
  });
}

// Entry point for all write operations
async function createTransaction(
  contractHash: string,
  operation: string,
  params: sc.ContractParam[],
  account: wallet.Account,
) {
  const script = sc.createScript({
    scriptHash: contractHash,
    operation,
    args: params,
  });

  const currentHeight = await RPC_CLIENT.getBlockCount();
  const transaction = new tx.Transaction({
    signers: [
      {
        account: account.scriptHash,
        scopes: tx.WitnessScope.CustomContracts,
        allowedContracts: [
          LRB_SCRIPT_HASH,
          USDL_SCRIPT_HASH,
          FLM_SCRIPT_HASH,
          ROUTER_SCRIPT_HASH,
          SWAP_FACTORY_SCRIPT_HASH,
          FLM_LRB_SCRIPT_HASH,
          FLM_USDL_SCRIPT_HASH,
        ],
      },
    ],
    validUntilBlock: currentHeight + 10,
    script,
  });
  logger.debug(`Transaction created: contractHash=${contractHash}, operation=${operation}, `
    + `params=${JSON.stringify(params)}, account=${account.address}`);
  return transaction;
}

export async function createFlamingoSwapLrbForUsdl(
  quantity: number,
  maxInQuantity: number,
  account: wallet.Account,
) {
  const maxDelay = 60000;
  const operation = 'swapTokenOutForTokenIn';
  const paramsJson = {
    type: 'Array',
    value: [
      {
        type: 'Hash160',
        value: LRB_SCRIPT_HASH,
      },
      {
        type: 'Hash160',
        value: FLM_SCRIPT_HASH,
      },
      {
        type: 'Hash160',
        value: USDL_SCRIPT_HASH,
      },
    ],
  };
  const params = [
    sc.ContractParam.hash160(account.address),
    sc.ContractParam.integer(quantity),
    sc.ContractParam.integer(maxInQuantity),
    sc.ContractParam.fromJson(paramsJson),
    sc.ContractParam.integer(new Date().getTime() + maxDelay),
  ];

  return createTransaction(ROUTER_SCRIPT_HASH, operation, params, account);
}

export async function createFlamingoSwapUsdlForLrb(
  quantity: number,
  minOutQuantity: number,
  account: wallet.Account,
) {
  const maxDelay = 60000;
  const operation = 'swapTokenInForTokenOut';
  const paramsJson = {
    type: 'Array',
    value: [
      {
        type: 'Hash160',
        value: USDL_SCRIPT_HASH,
      },
      {
        type: 'Hash160',
        value: FLM_SCRIPT_HASH,
      },
      {
        type: 'Hash160',
        value: LRB_SCRIPT_HASH,
      },
    ],
  };
  const params = [
    sc.ContractParam.hash160(account.address),
    sc.ContractParam.integer(quantity),
    sc.ContractParam.integer(minOutQuantity),
    sc.ContractParam.fromJson(paramsJson),
    sc.ContractParam.integer(new Date().getTime() + maxDelay),
  ];

  return createTransaction(ROUTER_SCRIPT_HASH, operation, params, account);
}

async function createAviarySwap(
  outTokenHash: string,
  inTokenHash: string,
  quantity: number,
  maxSpread: number,
  account: wallet.Account,
) {
  const operation = 'transfer';
  const swapJson = {
    type: 'Array',
    value: [
      {
        type: 'String',
        value: 'ACTION_SWAP',
      },
      {
        type: 'Hash160',
        value: inTokenHash,
      },
      {
        type: 'Integer',
        value: maxSpread,
      },
    ],
  };
  const params = [
    sc.ContractParam.hash160(account.address),
    sc.ContractParam.hash160(AVIARY_SCRIPT_HASH),
    sc.ContractParam.integer(quantity),
    sc.ContractParam.fromJson(swapJson),
  ];

  return createTransaction(outTokenHash, operation, params, account);
}

export async function createAviarySwapUsdlForLrb(
  quantity: number,
  maxSpread: number,
  account: wallet.Account,
) {
  return createAviarySwap(USDL_SCRIPT_HASH, LRB_SCRIPT_HASH, quantity, maxSpread, account);
}

export async function createAviarySwapLrbForUsdl(
  quantity: number,
  maxSpread: number,
  account: wallet.Account,
) {
  return createAviarySwap(LRB_SCRIPT_HASH, USDL_SCRIPT_HASH, quantity, maxSpread, account);
}

export async function checkNetworkFee(transaction: tx.Transaction) {
  const feePerByteInvokeResponse = await RPC_CLIENT.invokeFunction(
    CONST.NATIVE_CONTRACT_HASH.PolicyContract,
    'getFeePerByte',
  );

  if (feePerByteInvokeResponse.state !== 'HALT') {
    throw new Error('Unable to retrieve data to calculate network fee.');
  }
  const feePerByte = u.BigInteger.fromNumber(
    feePerByteInvokeResponse.stack[0].value as any as string,
  );
  // Account for witness size
  const transactionByteSize = transaction.serialize().length / 2 + 109;
  // Hardcoded. Running a witness is always the same cost for the basic account.
  const witnessProcessingFee = u.BigInteger.fromNumber(1000390);
  const networkFeeEstimate = feePerByte
    .mul(transactionByteSize)
    .add(witnessProcessingFee);
  // eslint-disable-next-line no-param-reassign
  transaction.networkFee = networkFeeEstimate;
  logger.debug(`Network Fee set: ${transaction.networkFee.toDecimal(8)}`);
}

export async function checkSystemFee(transaction: tx.Transaction) {
  const invokeFunctionResponse = await RPC_CLIENT.invokeScript(
    u.HexString.fromHex(transaction.script),
    transaction.signers,
  );
  if (invokeFunctionResponse.state !== 'HALT') {
    throw new Error(
      `Transfer script errored out: ${invokeFunctionResponse.exception}`,
    );
  }
  const requiredSystemFee = u.BigInteger.fromNumber(
    invokeFunctionResponse.gasconsumed,
  );
  // eslint-disable-next-line no-param-reassign
  transaction.systemFee = requiredSystemFee;
  logger.debug(`System Fee set: ${transaction.systemFee.toDecimal(8)}`);
}

export async function performTransfer(transaction: tx.Transaction, account: wallet.Account) {
  const signedTransaction = transaction.sign(
    account,
    NETWORK_MAGIC,
  );

  const result = await RPC_CLIENT.sendRawTransaction(
    u.HexString.fromHex(signedTransaction.serialize(true)),
  );
  logger.info(`Transaction hash: ${result}`);
}

export function base64MatchesAddress(base64Hash: string, address: string) {
  const fromBase64 = u.HexString.fromBase64(base64Hash, true).toString();
  const fromAddress = wallet.getScriptHashFromAddress(address);
  return fromBase64 === fromAddress;
}

// eslint-disable-next-line import/no-self-import
export * as DapiUtils from './dapiUtils';
