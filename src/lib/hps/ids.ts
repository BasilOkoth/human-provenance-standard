import crypto from "node:crypto";

export function createHpsId() {
  const year = new Date().getUTCFullYear();
  return `HPS-${year}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}
