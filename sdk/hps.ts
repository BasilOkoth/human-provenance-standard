export type HpsVerifyResult={assetHash:string;match:boolean;records:Array<{id:string;title:string;status:string;validRegistrySignature:boolean;creatorSignatureValid:boolean;institutionSignatureValid:boolean}>};
export class HPSClient{
  constructor(public baseUrl:string){this.baseUrl=baseUrl.replace(/\/$/,"")}
  async verifyHash(assetHash:string):Promise<HpsVerifyResult>{const r=await fetch(`${this.baseUrl}/api/verify/asset`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assetHash})});if(!r.ok)throw new Error(`HPS verify failed: ${r.status}`);return r.json()}
  async getRecord(id:string){const r=await fetch(`${this.baseUrl}/api/records/${encodeURIComponent(id)}`);if(!r.ok)throw new Error(`HPS record failed: ${r.status}`);return r.json()}
  badgeUrl(id:string){return `${this.baseUrl}/api/badge/${encodeURIComponent(id)}`}
  credentialUrl(id:string){return `${this.baseUrl}/api/records/${encodeURIComponent(id)}/credentials`}
  c2paMappingUrl(id:string){return `${this.baseUrl}/api/records/${encodeURIComponent(id)}/c2pa`}
}
export async function sha256File(file:Blob){const d=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("")}
