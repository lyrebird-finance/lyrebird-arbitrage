# README #

### Introduction ###
arby is the reference arbitrage bot for Lyrebird.

arby is able to run at a profit because Lyrebird swaps LRB and USDL based on the `target price` of USDL (always $1.00), whereas Flamingo maintains the `real price` of USDL which can deviate from the target price. When these prices differ enough, arby can perform arbitrage by engaging in a swap trade on Flamingo at the `real price` and rebalancing later on Lyrebird at the `target price`.

Please note that the FRP-FLM-LRB and FRP-FLM-USDL pools are not yet live on Mainnet, so `prod.json` does not contain the correct scripthashes. v1.0.0 will be released when these hashes are available.

As of April 20, 2022, arby implements arbitrage of USDL between Flamingo and Lyrebird by looping through the following cycle:

*  Fetch the current prevailing price of USDL on Flamingo, defined as `USDL/FLM * FLM/fUSDT`.
*  If `$USDL > 1.0 + PEG_THRESHOLD`, sell USDL for LRB through the FlamingoSwapRouter contract.
*  If `$USDL < 1.0 / (1.0 + PEG_THRESHOLD)`, buy USDL using LRB through the FlamingoSwapRouter contract.
*  If the wallet's `[USDL_VALUE|LRB_VALUE] / (LRB_VALUE + USDL_VALUE) < BALANCE_THRESHOLD * TOTAL_VALUE`, rebalance by swapping appropriately on the LyrebirdAviary contract.

### Getting Started ###
*  Run `npm install` to install all dependencies.
*  Run `export NODE_ENV=test` to run on testnet, or `export NODE_ENV=prod` to run on mainnet`.
*  Set up your wallet's private key, either `export PRIVATE_KEY=<PRIVATE_KEY>` or create a `.env` file in the root directory with `PRIVATE_KEY=<PRIVATE_KEY>`. Do not check in this file or share your private key with anybody. Ensure that your operating environment is secure.
*  Tune parameters as desired.
*  Run `npm run arby-dev` to run the bot.
*  Remember to start with `DRY_RUN=true` and check the output.

### Deploying to Production ###
*  Run `npm run build` to transpile the source to JavaScript.
*  Run `docker build -t lyrebird_archive .` to create a container image.
*  Run your image.

### Tunable Parameters ###
| Option | Description |
| --- | --- |
| `PEG_THRESHOLD` | The minimum deviation from the peg at which arby should perform a Flamingo swap. `0.05` indicates that arby maintains the peg at less than `5%` away from the `target price`. |
| `BALANCE_THRESHOLD` | The threshold at which arby will rebalance on Lyrebird. `0.40` indicates that the market value proportion of USDL and LRB will be maintained above `40%` of the combined market value. |
| `SWAP_RATIO` | The percentage of the *perfect swap* (that brings the value of USDL exactly to the target price) that will be performed. A value of `0.75` indicates that arby will compute the perfect swap quantity of USDL and swap `75%` of this quantity. |
| `MAX_SPREAD` | The max spread that can be incurred in a Lyrebird swap, expressed in basis points. `100` indicates that a swap on Lyrebird will abort if it loses more than `1%` of the fair value (at `target price`). |
| `SLIPPAGE_TOLERANCE` | The max slippage that can be incurred in a Flamingo swap, also expressed in basis points. `100` indicates that a swap on Flamingo will abort if it loses more than `1%` of the fair value (at `real price`). |
| `SLEEP_MILLIS` | The cycle duration expressed in milliseconds. arby will wait this duration betwen each cycle. It is meaningless to set this duration to less than `15000`, as Flamingo prices can't change between blocks which are generated every 15 seconds. |
| `AVIARY_WAIT_MILLIS` | The maximum amount of time to wait for an Aviary swap in milliseconds. If the Oracle hasn't responded by this time, arby will continue to the next cycle.. |
| `DRY_RUN` | If set to true, output the computations without actually performing swaps. Useful for testing and tuning parameters. |
