import nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import {canonicalize} from "./canonical";
import type {HPSManifest} from "./schema";
export function verifyManifestSignature(m:HPSManifest){
  if(!m.signature||!m.issuer)return false;
  const c=structuredClone(m); delete c.signature;
  return nacl.sign.detached.verify(
    util.decodeUTF8(canonicalize(c)),
    util.decodeBase64(m.signature.value),
    util.decodeBase64(m.issuer.publicKey)
  )
}