const { ethers } = require("hardhat")

const networkConfig = {
  31337: {
    name: "hardhat",
    entranceFee: ethers.utils.parseEther("0.01"), // 0.01 ETH
    gasLane:
      "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15",
    callbackGasLimit: "500000", // 500,000 gas
    interval: "30",
  },
  5: {
    name: "goerli",
    vrfCoordinatorV2: "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D",
    entranceFee: ethers.utils.parseEther("0.01"), // 0.01 ETH
    gasLane:
      "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15", // 30 gwei
    subscriptionId: "10594",
    callbackGasLimit: "500000", // 500,000 gas
    interval: "30",
  },
  1: {
    name: "mainnet",
  },
  11155111: {
    name: "sepolia",
    vrfCoordinatorV2: "0x8103b0a8a00be2ddc778e6e7eaa21791cd364625",
    entranceFee: ethers.utils.parseEther("0.01"), // 0.01 ETH
    gasLane:
      "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
    subscriptionId: "302",
    callbackGasLimit: "500000", // 500,000 gas
    interval: "30",
  },
}

const developmentChains = ["hardhat", "localhost"]

module.exports = {
  networkConfig,
  developmentChains,
}
