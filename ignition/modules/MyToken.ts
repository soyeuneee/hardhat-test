import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MyTokenModule", (m) => {
  const myTokenC = m.contract("MyToken", ["MyToken", "MT", 18, 1]);
  return { myTokenC };
});
