import fs from "node:fs";
import nacl from "tweetnacl";
import util from "tweetnacl-util";
const input=process.argv[2];
if(!input) throw new Error("Usage: node scripts/verify-manifest.mjs <signed-manifest.json>");
const m=JSON.parse(fs.readFileSync(input,"utf8"));
function c(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return"["+v.map(c).join(",")+"]";return"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+c(v[k])).join(",")+"}"}
if(!m.signature||!m.issuer){console.error("Unsigned");process.exit(1)}
const s=m.signature.value;delete m.signature;
const ok=nacl.sign.detached.verify(util.decodeUTF8(c(m)),util.decodeBase64(s),util.decodeBase64(m.issuer.publicKey));
console.log(ok?"✓ HPS signature valid":"✗ HPS signature invalid");
process.exit(ok?0:1);
