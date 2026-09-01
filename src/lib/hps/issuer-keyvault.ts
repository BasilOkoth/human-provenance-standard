

import nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { jcsCanonicalize } from "./canonical";

const keyName = (orgId: string) => `hps_issuer_key_${orgId}`;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function derive(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 300000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createIssuerKey(
  orgId: string,
  passphrase: string
) {
  const pair = nacl.sign.keyPair();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(pair.secretKey)
  );

  const vault = {
    version: 1,
    publicKey: util.encodeBase64(pair.publicKey),
    salt: util.encodeBase64(salt),
    iv: util.encodeBase64(iv),
    encryptedSecret: util.encodeBase64(new Uint8Array(encrypted)),
  };

  localStorage.setItem(keyName(orgId), JSON.stringify(vault));
  return vault.publicKey;
}

export function getIssuerPublicKey(orgId: string) {
  try {
    return (
      JSON.parse(localStorage.getItem(keyName(orgId)) || "null")
        ?.publicKey || null
    );
  } catch {
    return null;
  }
}

export async function signIssuerClaim(
  orgId: string,
  value: unknown,
  passphrase: string
) {
  const raw = localStorage.getItem(keyName(orgId));
  if (!raw) throw new Error("No issuer key on this device.");

  const v = JSON.parse(raw);
  const key = await derive(passphrase, util.decodeBase64(v.salt));

  let secret: ArrayBuffer;
  try {
    secret = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(util.decodeBase64(v.iv)) },
      key,
      toArrayBuffer(util.decodeBase64(v.encryptedSecret))
    );
  } catch {
    throw new Error("Incorrect issuer-key passphrase.");
  }

  const sig = nacl.sign.detached(
    util.decodeUTF8(jcsCanonicalize(value)),
    new Uint8Array(secret)
  );

  return {
    publicKey: v.publicKey as string,
