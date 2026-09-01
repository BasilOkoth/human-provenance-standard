import nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { canonicalize } from "./canonical";
import type { HPSManifest } from "./schema";

export function unsignedPayload(manifest: HPSManifest) {
  const clone = structuredClone(manifest);
  delete clone.signature;
  return clone;
}

export function signManifest(manifest:HPSManifest, secretKeyBase64:string, publicKeyBase64:string):HPSManifest {
  const payload = unsignedPayload(manifest);
  payload.issuer = { actorId: payload.responsibility.finalApprovalActorId, publicKey: publicKeyBase64 };
  const bytes = util.decodeUTF8(canonicalize(payload));
  const sig = nacl.sign.detached(bytes, util.decodeBase64(secretKeyBase64));
  return {...payload, signature:{algorithm:"Ed25519", value:util.encodeBase64(sig)}};
}

export function verifyManifestSignature(manifest:HPSManifest):boolean {
  if (!manifest.signature || !manifest.issuer) return false;
  const payload = unsignedPayload(manifest);
  return nacl.sign.detached.verify(
    util.decodeUTF8(canonicalize(payload)),
    util.decodeBase64(manifest.signature.value),
    util.decodeBase64(manifest.issuer.publicKey)
  );
}
