const { ethers } = require('ethers');
async function test() {
  const provider = new ethers.WebSocketProvider('wss://ethereum-rpc.publicnode.com');
  const subId = await provider.send('eth_subscribe', ['newHeads']);
  console.log('Sub ID:', subId);
  provider.on(subId, (result) => {
    console.log('Got result:', Object.keys(result));
    provider.destroy();
  });
}
test();
