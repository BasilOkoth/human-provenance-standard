import nacl from "tweetnacl";
import util from "tweetnacl-util";
import fs from "node:fs";
const pair=nacl.sign.keyPair();
fs.writeFileSync("hps-keypair.json",JSON.stringify({
 algorithm:"Ed25519",
 publicKey:util.encodeBase64(pair.publicKey),
 secretKey:util.encodeBase64(pair.secretKey)
},null,2));
console.log("Created hps-keypair.json — keep the secret key private.");
