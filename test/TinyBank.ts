import hre from "hardhat";
import { expect } from "chai";
import { MyToken, TinyBank } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { describe, it, beforeEach } from "mocha";
import { DECIMALS, MINTING_AMOUNT } from "./constant";

describe("TinyBank", () => {
  let signers: HardhatEthersSigner[];
  let managers: HardhatEthersSigner[];
  let myTokenC: MyToken;
  let tinyBankC: TinyBank;

  beforeEach(async () => {
    signers = await hre.ethers.getSigners();
    managers = signers.slice(0, 3); // signer0, signer1, signer2

    myTokenC = await hre.ethers.deployContract("MyToken", [
      "MyToken",
      "MT",
      DECIMALS,
      MINTING_AMOUNT,
    ]);
    tinyBankC = await hre.ethers.deployContract("TinyBank", [
      await myTokenC.getAddress(),
      managers.map((m) => m.address),
    ]);
    await myTokenC.setManager(await tinyBankC.getAddress());
  });

  describe("Initialized state check", () => {
    it("should return totalStaked 0", async () => {
      expect(await tinyBankC.totalStaked()).equal(0);
    });

    it("should return staked 0 amount of signer0", async () => {
      const signer0 = signers[0];
      expect(await tinyBankC.staked(signer0.address)).equal(0);
    });
  });

  describe("Staking", async () => {
    it("should return staked amount", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);
      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);
      expect(await tinyBankC.staked(signer0.address)).equal(stakingAmount);
      expect(await tinyBankC.totalStaked()).equal(stakingAmount);
      expect(await myTokenC.balanceOf(tinyBankC)).equal(
        await tinyBankC.totalStaked(),
      );
    });
  });

  describe("Withdraw", () => {
    it("should return 0 staked after withdrawing total token", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);
      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);
      await tinyBankC.withdraw(stakingAmount);
      expect(await tinyBankC.staked(signer0.address)).equal(0);
    });
  });

  describe("reward", () => {
    it("should reward 1MT every blocks", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);
      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);

      const BLOCKS = 5n;
      const transferAmount = hre.ethers.parseUnits("1", DECIMALS);
      for (var i = 0; i < BLOCKS; i++) {
        await myTokenC.transfer(transferAmount, signer0.address);
      }

      await tinyBankC.withdraw(stakingAmount);
      expect(await myTokenC.balanceOf(signer0.address)).equal(
        hre.ethers.parseUnits((BLOCKS + MINTING_AMOUNT + 1n).toString()),
      );
    });
  });

  describe("Multi Manager", () => {
    it("should revert deployment with less than 3 managers", async () => {
      await expect(
        hre.ethers.deployContract("TinyBank", [
          await myTokenC.getAddress(),
          [signers[0].address, signers[1].address],
        ]),
      ).to.be.revertedWith("At least 3 managers required");
    });

    it("should register 3 managers", async () => {
      for (const m of managers) {
        expect(await tinyBankC.isManager(m.address)).equal(true);
      }
      expect(await tinyBankC.isManager(signers[3].address)).equal(false);
    });

    it("should revert with 'You are not a manager' when non-manager confirms", async () => {
      const hacker = signers[3];
      await expect(tinyBankC.connect(hacker).confirm()).to.be.revertedWith(
        "You are not a manager",
      );
    });

    it("should revert with 'You are not a manager' when non-manager changes rewardPerBlock", async () => {
      const hacker = signers[3];
      const rewardToChange = hre.ethers.parseUnits("10000", DECIMALS);
      await expect(
        tinyBankC.connect(hacker).setRewardPerBlock(rewardToChange),
      ).to.be.revertedWith("You are not a manager");
    });

    it("should revert with 'Not all confirmed yet' when not all managers confirmed", async () => {
      const rewardToChange = hre.ethers.parseUnits("10000", DECIMALS);
      await tinyBankC.connect(managers[0]).confirm();
      await tinyBankC.connect(managers[1]).confirm();
      await expect(
        tinyBankC.connect(managers[0]).setRewardPerBlock(rewardToChange),
      ).to.be.revertedWith("Not all confirmed yet");
    });

    it("should change rewardPerBlock after all managers confirmed", async () => {
      const rewardToChange = hre.ethers.parseUnits("10000", DECIMALS);
      for (const m of managers) {
        await tinyBankC.connect(m).confirm();
      }
      await tinyBankC.connect(managers[0]).setRewardPerBlock(rewardToChange);
      expect(await tinyBankC.rewardPerBlock()).equal(rewardToChange);
    });

    it("should reset confirmations after changing rewardPerBlock", async () => {
      const rewardToChange = hre.ethers.parseUnits("10000", DECIMALS);
      for (const m of managers) {
        await tinyBankC.connect(m).confirm();
      }
      await tinyBankC.connect(managers[0]).setRewardPerBlock(rewardToChange);
      await expect(
        tinyBankC.connect(managers[0]).setRewardPerBlock(rewardToChange),
      ).to.be.revertedWith("Not all confirmed yet");
    });
  });
});
