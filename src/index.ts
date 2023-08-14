import { JsonRpcProvider } from "@ethersproject/providers";
import axios from "axios";

import * as Utils from "./utils";
import rpcList from "./rpc.json";

const chainList: Record<string, string[]> = rpcList;

export interface RpcManagerConfig {
  chainId: number;
  maxProviders: number;
  rotateIntervalMins: number;
}

export class RpcManager {
  public NewRpcUrl = new Utils.Evt<string>();

  public rotateProvider: () => Promise<void>;

  constructor(
    public provider: JsonRpcProvider,
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
        } catch {
          working = false;
        }

        return { time: +new Date() - start, url, working };
      })
    );

    const valid_providers = checked_providers
      .filter(({ working }) => working)
      .sort((a, b) => a.time - b.time);

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
    const provider = new JsonRpcProvider(bestUrl);
    return new RpcManager(provider, config);
  }

  private async _rotateProvider() {
    const bestUrl = await RpcManager.getBestRpcUrl(this._config.chainId);

    if (bestUrl !== this.provider.connection.url) {
      this.provider = new JsonRpcProvider(bestUrl);

      this.NewRpcUrl.trigger(bestUrl);
    }
  }
}
