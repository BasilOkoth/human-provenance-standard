import nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { canonicalize } from "./canonical";
import type { HPSManifest } from "./schema";

export function verifyCreatorSignature(
  unsignedPayload: string,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    return nacl.sign.detached.verify(
      util.decodeUTF8(unsignedPayload),
      util.decodeBase64(signatureBase64),
      util.decodeBase64(publicKeyBase64)
    );
  } catch {
    return false;
  }
}

export function signRegistryManifest(
  manifest: HPSManifest,
  publicKeyBase64: string,
  secretKeyBase64: string
): HPSManifest {
  const payload: HPSManifest = {
    ...manifest,
    registry: {
      name: "Human Provenance Standard Registry",
      publicKey: publicKeyBase64,
      signedAt: new Date().toISOString()
    }
  };

  delete payload.registrySignature;

  const signature = nacl.sign.detached(
    util.decodeUTF8(canonicalize(payload)),
    util.decodeBase64(secretKeyBase64)
  );

  return {
    ...payload,
    registrySignature: {
      algorithm: "Ed25519",
      value: util.encodeBase64(signature)
    }
  };
}

export function verifyRegistrySignature(manifest: HPSManifest): boolean {
  if (!manifest.registrySignature || !manifest.registry) return false;

  const copy = structuredClone(manifest);
  delete copy.registrySignature;

  try {
    return nacl.sign.detached.verify(
      util.decodeUTF8(canonicalize(copy)),
      util.decodeBase64(manifest.registrySignature.value),
      util.decodeBase64(manifest.registry.publicKey)
    );
  } catch {
    return false;
  }
}
