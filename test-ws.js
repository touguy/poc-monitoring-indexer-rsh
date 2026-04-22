const { ethers } = require('ethers');
const provider = new ethers.WebSocketProvider('wss://ethereum-rpc.publicnode.com');
console.log(typeof provider.websocket);
provider.destroy();
