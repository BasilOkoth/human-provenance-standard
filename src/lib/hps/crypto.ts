import nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { jcsCanonicalize } from "./canonical";
import type { HPSManifest } from "./schema";

export function verifyDetachedCanonical(value:unknown, signatureBase64:string, publicKeyBase64:string):boolean{
  try{
    return nacl.sign.detached.verify(
      util.decodeUTF8(jcsCanonicalize(value)),
      util.decodeBase64(signatureBase64),
      util.decodeBase64(publicKeyBase64)
    );
  }catch{return false}
}

export function verifyCreatorSignature(unsignedPayload:string,signatureBase64:string,publicKeyBase64:string):boolean{
  try{
    return nacl.sign.detached.verify(util.decodeUTF8(unsignedPayload),util.decodeBase64(signatureBase64),util.decodeBase64(publicKeyBase64));
  }catch{return false}
}

export function signRegistryManifest(manifest:HPSManifest,publicKeyBase64:string,secretKeyBase64:string):HPSManifest{
  const payload:HPSManifest={
    ...manifest,
    registry:{name:"Human Provenance Standard Registry",publicKey:publicKeyBase64,signedAt:new Date().toISOString(),keyId:"hps-registry-main"}
  };
  delete payload.registrySignature;
  const signature=nacl.sign.detached(util.decodeUTF8(jcsCanonicalize(payload)),util.decodeBase64(secretKeyBase64));
  return {...payload,registrySignature:{algorithm:"Ed25519",keyId:"hps-registry-main",value:util.encodeBase64(signature)}};
}

export function verifyRegistrySignature(manifest:HPSManifest):boolean{
  if(!manifest.registrySignature||!manifest.registry)return false;
  const copy=structuredClone(manifest);delete copy.registrySignature;
  return verifyDetachedCanonical(copy,manifest.registrySignature.value,manifest.registry.publicKey);
}

export function signRegistryObject(value:unknown,secretKeyBase64:string){
  const signature=nacl.sign.detached(util.decodeUTF8(jcsCanonicalize(value)),util.decodeBase64(secretKeyBase64));
  return util.encodeBase64(signature);
}
