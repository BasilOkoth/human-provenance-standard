import nacl from "tweetnacl";
import util from "tweetnacl-util";

const pair = nacl.sign.keyPair();

console.log("\nHPS Registry keys — add to Render Environment Variables\n");
console.log("HPS_REGISTRY_PUBLIC_KEY=" + util.encodeBase64(pair.publicKey));
console.log("HPS_REGISTRY_SECRET_KEY=" + util.encodeBase64(pair.secretKey));
console.log("\nNever expose HPS_REGISTRY_SECRET_KEY to the browser or GitHub.\n");
