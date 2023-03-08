const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", function () {
      let lottery,
        lotteryContract,
        vrfCoordinatorV2Mock,
        lotteryEntranceFee,
        deployer,
        interval,
        player
      const chainId = network.config.chainId

      beforeEach(async function () {
        accounts = await ethers.getSigners()
        player = accounts[1]
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lotteryContract = await ethers.getContract("Lottery", deployer)
        lottery = lotteryContract.connect(player)
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        )
        lotteryEntranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
      })

      describe("constructor", function () {
        it("initializes the lottery correctly", async function () {
          const lotteryState = await lottery.getLotteryState()
          const interval = await lottery.getInterval()
          assert.equal(lotteryState.toString(), "0")
          assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
      })

      describe("enterLottery", function () {
        it("reverts when you don't pay enough", async function () {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughEthEntered"
          )
        })
        it("records players when they enter", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          const contractPlayer = await lottery.getPlayer(0)
          assert.equal(player.address, contractPlayer)
        })
        it("emits event on enter", async function () {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, "LotteryEnter")
        })
        it("doesnt allow entrance when lottery is calculating", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          // We pretend to be a Chainlink Keeper
          await lottery.performUpkeep([])
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith("Lottery__NotOpen")
        })
      })
      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
          assert(!upkeepNeeded)
        })
        it("returns false if lottery isn't open", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          await lottery.performUpkeep([])
          const lotteryState = await lottery.getLotteryState()
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
          assert.equal(lotteryState.toString(), "1")
          assert.equal(upkeepNeeded, false)
        })
        it("returns false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]) // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded)
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded)
        })
      })

      describe("performUpKeep", function () {
        it("it can only run if checkUpKeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const tx = await lottery.performUpkeep([])
          assert(tx)
        })
        it("reverts when checkUpKeep is false", async function () {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Lottery__UpKeepNotNeeded"
          )
        })
        it("updates the lottery state and emits an event and calls the vrf coordinator", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const txResponse = await lottery.performUpkeep([])
          const txReceipt = await txResponse.wait(1)
          const requestId = txReceipt.events[1].args.requestId
          const lotteryState = await lottery.getLotteryState()
          assert(requestId.toNumber() > 0)
          assert(lotteryState.toString() == "1")
        })
      })
      describe("fulfillRandomWords", function () {
        beforeEach(async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
        })
        it("can only be called after performUpKeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request")
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request")
        })
        // Big Ass Test
        it("picks a winner, resets the lottery, and sends money", async function () {
          const additionalEntrants = 3
          const startingAccountIndex = 1 // deployer = 0
          // const accounts = await ethers.getSigners()
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            lottery = lotteryContract.connect(accounts[i])
            await lottery.enterLottery({
              value: lotteryEntranceFee,
            })
          }
          const startingTimeStamp = await lottery.getLatestTimeStamp()

          // performUpKeep (mock being chainlink keepers)
          // fulfillRandomWords (mock being chainlink vrf)
          // Wait for fulfillRandomWords to be called
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!")
              try {
                const recentWinner = await lottery.getRecentWinner()
                const lotteryState = await lottery.getLotteryState()
                const endingTimeStamp = await lottery.getLatestTimeStamp()
                const numPlayers = await lottery.getNumberOfPlayers()
                const winnerEndingBalance = await accounts[1].getBalance()
                assert.equal(numPlayers.toString(), "0")
                assert.equal(lotteryState.toString(), "0")
                assert(endingTimeStamp > startingTimeStamp)

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    lotteryEntranceFee
                      .mul(additionalEntrants)
                      .add(lotteryEntranceFee)
                      .toString()
                  )
                )
              } catch (e) {
                reject(e)
              }
              resolve()
            })
            // Setting up the listener
            // below, we will fire the event, and the listener will pick it up, and resolve
            const tx = await lottery.performUpkeep([])
            const txReceipt = await tx.wait(1)
            const winnerStartingBalance = await accounts[1].getBalance()
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            )
          })
        })
      })
    })
