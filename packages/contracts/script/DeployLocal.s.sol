// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {YDToken} from "../src/YDToken.sol";
import {CourseCatalog} from "../src/CourseCatalog.sol";
import {CourseMarket} from "../src/CourseMarket.sol";
import {CertificateSBT} from "../src/CertificateSBT.sol";
import {ChainlinkPriceOracle} from "../src/ChainlinkPriceOracle.sol";
import {MockAggregatorV3} from "../test/mocks/MockAggregatorV3.sol";

/// @notice Local-Anvil-only deployment helper. The chain guard blocks Sepolia/mainnet use.
contract DeployLocal is Script {
    error LocalChainOnly(uint256 actualChainId);

    struct Deployment {
        YDToken token;
        CourseCatalog catalog;
        CourseMarket market;
        CertificateSBT certificate;
        MockAggregatorV3 mockEthUsdFeed;
        ChainlinkPriceOracle oracle;
    }

    function run() external returns (Deployment memory deployment) {
        if (block.chainid != 31_337) revert LocalChainOnly(block.chainid);

        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address worker = vm.envAddress("WORKER_ADDRESS");

        vm.startBroadcast();
        deployment.token = new YDToken(treasury);
        deployment.catalog = new CourseCatalog(admin);
        deployment.market = new CourseMarket(address(deployment.token), address(deployment.catalog), treasury, admin);
        deployment.certificate = new CertificateSBT(address(deployment.market), admin, worker);
        deployment.mockEthUsdFeed = new MockAggregatorV3(8);
        deployment.oracle = new ChainlinkPriceOracle(address(deployment.mockEthUsdFeed), 1 hours, admin);
        deployment.mockEthUsdFeed.setRoundData(1, 3_500e8, block.timestamp, block.timestamp, 1);
        vm.stopBroadcast();
    }
}

