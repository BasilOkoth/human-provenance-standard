import fs from "node:fs";
import nacl from "tweetnacl";
import util from "tweetnacl-util";
const input=process.argv[2];
if(!input) throw new Error("Usage: node scripts/sign-manifest.mjs <manifest.json>");
const keys=JSON.parse(fs.readFileSync("hps-keypair.json","utf8"));
const m=JSON.parse(fs.readFileSync(input,"utf8"));
function c(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return"["+v.map(c).join(",")+"]";return"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+c(v[k])).join(",")+"}"}
delete m.signature;
m.issuer={actorId:m.responsibility.finalApprovalActorId,publicKey:keys.publicKey};
const sig=nacl.sign.detached(util.decodeUTF8(c(m)),util.decodeBase64(keys.secretKey));
m.signature={algorithm:"Ed25519",value:util.encodeBase64(sig)};
const out=input.replace(/\.json$/,".signed.json");
fs.writeFileSync(out,JSON.stringify(m,null,2));
console.log("Signed:",out);
