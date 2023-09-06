import {
  JsonRpcProvider,
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import axios from "axios";

import * as Utils from "./utils";
import rpcList from "./rpc.json";

const chainList: Record<string, string[]> = rpcList;

export class AutoGasJsonRpcProvider extends JsonRpcProvider {
  async sendAutoGasTransaction(
    transaction: TransactionRequest,
    wallet: Wallet
  ): Promise<TransactionResponse> {
    const [gasInfo, nonce, network] = await Promise.all([
      this.getGasInfo(),
      this.getTransactionCount(wallet.address, "pending"),
      this.getNetwork(),
    ]);

    transaction.nonce = nonce;
    transaction.chainId = network.chainId;
    transaction.from = wallet.address;

    if (gasInfo.gasPrice) {
      transaction.gasPrice = gasInfo.gasPrice;
    } else if (gasInfo.maxFeePerGas && gasInfo.maxPriorityFeePerGas) {
      transaction.maxFeePerGas = gasInfo.maxFeePerGas;
      transaction.maxPriorityFeePerGas = gasInfo.maxPriorityFeePerGas;
      transaction.type = 2;
    }
    transaction.gasLimit = await this.estimateGas(transaction);

    const signedTx = await wallet.signTransaction(transaction);

    return this.sendTransaction(signedTx);
  }

  async getGasInfo() {
    const feeData = await this.getFeeData();

    const gas = {
      gasPrice: feeData.gasPrice,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxFeePerGas,
    };

    return gas;
  }
}

export interface RpcManagerConfig {
  chainId: number;
  maxProviders: number;
  rotateIntervalMins: number;
}

export interface NewRpcEvent {
  bestUrl: string;
  oldProvider: AutoGasJsonRpcProvider;
}

export class RpcManager {
  public NewRpcUrl = new Utils.Evt<NewRpcEvent>();

  public rotateProvider: () => Promise<void>;

  constructor(
    public provider: AutoGasJsonRpcProvider,
    private _config: RpcManagerConfig
  ) {
    this.rotateProvider = this._rotateProvider.bind(this);

    setInterval(this.rotateProvider, _config.rotateIntervalMins * 60 * 1000);
  }

  static async getBestRpcUrl(chainId: number) {
    const start = +new Date();
    const checked_providers = await Promise.all(
      chainList[chainId].map(async (url) => {
        let working = true;
        try {
          await Promise.race([
            axios
              .post(url, {
                id: 1,
                jsonrpc: "2.0",
                method: "eth_chainId",
                params: [],
              })
              .then((res) => {
                const id = parseInt(res.data.result, 16);
                if (id !== chainId) throw new Error("invalid chainId");
              }),
            Utils.timeout(3000),
          ]);
        } catch (err: any) {
          console.log(err.message, url);
          working = false;
        }

        return { time: +new Date() - start, url, working };
      })
    );

    const valid_providers = checked_providers
      .filter(({ working }) => working)
      .sort((a, b) => a.time - b.time);

    console.log("FOUND VALID:", valid_providers.length);

    return valid_providers[0].url;
  }

  static async new(initial_config?: Partial<RpcManagerConfig>) {
    const {
      chainId = 1,
      maxProviders = 5,
      rotateIntervalMins = 60,
    } = initial_config ?? {};

    const config = {
      chainId,
      maxProviders,
      rotateIntervalMins,
    };

    const bestUrl = await this.getBestRpcUrl(chainId);
    const provider = new AutoGasJsonRpcProvider(bestUrl);
    return new RpcManager(provider, config);
  }

  private async _rotateProvider() {
    const bestUrl = await RpcManager.getBestRpcUrl(this._config.chainId);

    if (bestUrl !== this.provider.connection.url) {
      const oldProvider = this.provider;
      this.provider = new AutoGasJsonRpcProvider(bestUrl);

      this.NewRpcUrl.trigger({ bestUrl, oldProvider });
    }
  }
}

const main = async () => {
  const rpcManager = await RpcManager.new({
    chainId: 137,
    rotateIntervalMins: 1,
  });

  setInterval(() => {
    rpcManager.provider
      .getBlockNumber()
      .then((b) => console.log("CURRENT BLOCK:", b));
  }, 3000);
};

main();
