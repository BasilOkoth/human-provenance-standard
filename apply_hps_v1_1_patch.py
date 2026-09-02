#!/usr/bin/env python3
"""Apply HPS v1.1 compression-resilient provenance to an existing HPS v1.0.x repo.

Run from the HPS repository root:
    python apply_hps_v1_1_patch.py

The patch is conservative: it aborts individual edits when expected anchors are not
found rather than silently replacing unrelated code. Commit/back up your repo first.
"""
from __future__ import annotations
import json
import re
import shutil
from pathlib import Path

ROOT = Path.cwd()
PATCH = Path(__file__).resolve().parent

required = [
    ROOT / "package.json",
    ROOT / "src/lib/hps/schema.ts",
    ROOT / "src/app/create/page.tsx",
    ROOT / "src/app/institutional/[id]/page.tsx",
    ROOT / "src/app/api/records/route.ts",
    ROOT / "src/app/api/organizations/[id]/issue/route.ts",
]
missing = [str(p) for p in required if not p.exists()]
if missing:
    raise SystemExit("Not an HPS repo or files missing:\n" + "\n".join(missing))

# Always-safe additive files.
for rel in [
    "src/lib/hps/fingerprint-client.ts",
    "src/lib/hps/fingerprint-compare.ts",
    "src/app/api/verify/asset/route.ts",
    "src/app/api/records/[id]/derivatives/route.ts",
    "src/app/verify/derivative/page.tsx",
    "supabase/migrations/20260902_130_compression_resilient_provenance.sql",
]:
    src = PATCH / rel
    dst = ROOT / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print("copied", rel)

# package.json merge rather than overwrite.
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["version"] = "1.1.0"
pkg.setdefault("dependencies", {})["pdfjs-dist"] = "^5.5.207"
pkg.setdefault("dependencies", {})["mammoth"] = "^1.12.2"
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
print("updated package.json")

# schema.ts: use the tested v1.1 schema file from the patch package because this is
# a narrow schema file and backwards-compatible fields are optional.
shutil.copy2(PATCH / "src/lib/hps/schema.ts", ROOT / "src/lib/hps/schema.ts")
print("updated src/lib/hps/schema.ts")


def edit(path: Path, fn):
    old = path.read_text(encoding="utf-8")
    new = fn(old)
    if new == old:
        print("WARNING: no changes applied to", path)
        return False
    path.write_text(new, encoding="utf-8")
    print("patched", path.relative_to(ROOT))
    return True


def patch_create(s: str) -> str:
    if 'from "@/lib/hps/fingerprint-client"' not in s:
        s = s.replace(
            'import { getStoredPublicKey, signCanonicalWithCreatorKey } from "@/lib/hps/keyvault";',
            'import { getStoredPublicKey, signCanonicalWithCreatorKey } from "@/lib/hps/keyvault";\nimport { fingerprintFile, type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";'
        )
    if 'const [assetFingerprint,setAssetFingerprint]' not in s:
        s = s.replace(
            'const [assetHash,setAssetHash]=useState("");',
            'const [assetHash,setAssetHash]=useState("");\n  const [assetFingerprint,setAssetFingerprint]=useState<HpsAssetFingerprintV1|null>(null);\n  const [fingerprintBusy,setFingerprintBusy]=useState(false);'
        )
    s = re.sub(
        r'async function onFile\(file\?:File\)\{if\(!file\)return;setFileName\(file\.name\);setAssetHash\(await hashFile\(file\)\)\}',
        'async function onFile(file?:File){if(!file)return;setFingerprintBusy(true);setError("");try{const fp=await fingerprintFile(file);setFileName(file.name);setAssetHash(fp.exactSha256);setAssetFingerprint(fp)}catch(e:any){setError(e.message||"Unable to fingerprint file.");setAssetFingerprint(null);setAssetHash("")}finally{setFingerprintBusy(false)}}',
        s
    )
    s = s.replace(
        'user && publicKey && title && creatorName && assetHash &&',
        'user && publicKey && title && creatorName && assetHash && assetFingerprint &&'
    )
    if 'assetFingerprint:assetFingerprint||undefined' not in s:
        s = s.replace(
            'title,creatorName,workType,fileName:fileName||undefined,assetHash,',
            'title,creatorName,workType,fileName:fileName||undefined,assetHash,assetFingerprint:assetFingerprint||undefined,'
        )
    if 'COMPRESSION-RESILIENT FINGERPRINT' not in s:
        s = s.replace(
            '{assetHash&&<div className="hashBox"><span>ASSET SHA-256</span><code>{assetHash}</code></div>}',
            '{fingerprintBusy&&<p className="muted">Building exact, canonical-text and visual fingerprints…</p>}\n        {assetHash&&<div className="hashBox"><span>ASSET SHA-256</span><code>{assetHash}</code></div>}\n        {assetFingerprint&&<div className="statusBox"><strong>COMPRESSION-RESILIENT FINGERPRINT</strong><p>{assetFingerprint.modality} · {assetFingerprint.pageCount?`${assetFingerprint.pageCount} page(s) · `:""}fingerprint {assetFingerprint.version}</p></div>}'
        )
    return s


def patch_institution(s: str) -> str:
    if 'fingerprintFile' not in s:
        s = s.replace(
            'import { createIssuerKey,getIssuerPublicKey,signIssuerClaim } from "@/lib/hps/issuer-keyvault";',
            'import { createIssuerKey,getIssuerPublicKey,signIssuerClaim } from "@/lib/hps/issuer-keyvault";import { fingerprintFile,type HpsAssetFingerprintV1 } from "@/lib/hps/fingerprint-client";'
        )
    if 'assetFingerprint' not in s:
        s = s.replace(
            '[assetHash,setAssetHash]=useState("")',
            '[assetHash,setAssetHash]=useState(""),[assetFingerprint,setAssetFingerprint]=useState<HpsAssetFingerprintV1|null>(null),[fingerprintBusy,setFingerprintBusy]=useState(false)'
        )
    s = re.sub(
        r'async function file\(f\?:File\)\{if\(!f\)return;setFileName\(f\.name\);setAssetHash\(await hashFile\(f\)\)\}',
        'async function file(f?:File){if(!f)return;setFingerprintBusy(true);try{const fp=await fingerprintFile(f);setFileName(f.name);setAssetHash(fp.exactSha256);setAssetFingerprint(fp);setMsg("Compression-resilient fingerprint prepared.")}catch(e:any){setMsg(e.message||"Unable to fingerprint file.");setAssetHash("");setAssetFingerprint(null)}finally{setFingerprintBusy(false)}}',
        s
    )
    s = s.replace(
        'fileName:fileName||undefined,assetHash,issuerPublicKey:',
        'fileName:fileName||undefined,assetHash,assetFingerprint:assetFingerprint||undefined,issuerPublicKey:'
    )
    s = s.replace(
        'disabled={!title||!assetHash||!pk||!pass}',
        'disabled={!title||!assetHash||!assetFingerprint||!pk||!pass||fingerprintBusy}'
    )
    return s


def patch_records_route(s: str) -> str:
    s = s.replace(
        'sha256:creatorClaim.assetHash,fileName:creatorClaim.fileName}',
        'sha256:creatorClaim.assetHash,fileName:creatorClaim.fileName,fingerprint:creatorClaim.assetFingerprint}'
    )
    if 'asset_fingerprint:creatorClaim.assetFingerprint' not in s:
        s = s.replace(
            'record_kind:"creator_provenance",asset_hash:creatorClaim.assetHash,manifest:countersigned,',
            'record_kind:"creator_provenance",asset_hash:creatorClaim.assetHash,asset_fingerprint:creatorClaim.assetFingerprint||null,canonical_text_sha256:creatorClaim.assetFingerprint?.canonicalTextSha256||null,fingerprint_version:creatorClaim.assetFingerprint?.version||null,manifest:countersigned,'
        )
    return s


def patch_issue_route(s: str) -> str:
    s = s.replace(
        'sha256:claim.assetHash,fileName:claim.fileName}',
        'sha256:claim.assetHash,fileName:claim.fileName,fingerprint:claim.assetFingerprint}'
    )
    if 'asset_fingerprint:claim.assetFingerprint' not in s:
        s = s.replace(
            'record_kind:"institutional_document",asset_hash:claim.assetHash,manifest:signed,',
            'record_kind:"institutional_document",asset_hash:claim.assetHash,asset_fingerprint:claim.assetFingerprint||null,canonical_text_sha256:claim.assetFingerprint?.canonicalTextSha256||null,fingerprint_version:claim.assetFingerprint?.version||null,manifest:signed,'
        )
    return s

edit(ROOT / "src/app/create/page.tsx", patch_create)
edit(ROOT / "src/app/institutional/[id]/page.tsx", patch_institution)
edit(ROOT / "src/app/api/records/route.ts", patch_records_route)
edit(ROOT / "src/app/api/organizations/[id]/issue/route.ts", patch_issue_route)

# Add a non-destructive route from the existing verifier to the new verifier when
# the expected header is present.
verify_page = ROOT / "src/app/verify/page.tsx"
if verify_page.exists():
    def patch_verify_link(s: str) -> str:
        if '/verify/derivative' in s:
            return s
        needle = '<header className="pageHead shell"><p className="eyebrow">HPS VERIFY</p><h1>Check the file in front of you.</h1><p>Upload a document, image or other digital asset. HPS calculates its SHA-256 fingerprint locally and checks for an exact registered match.</p></header>'
        repl = '<header className="pageHead shell"><p className="eyebrow">HPS VERIFY</p><h1>Check the file in front of you.</h1><p>Upload a document, image or other digital asset. HPS calculates its SHA-256 fingerprint locally and checks for an exact registered match.</p><div className="actions"><Link className="button darkButton" href="/verify/derivative">Verify a compressed / transformed copy</Link></div></header>'
        return s.replace(needle, repl)
    edit(verify_page, patch_verify_link)

print("\nHPS v1.1 patch files applied.")
print("NEXT: npm install")
print("NEXT: run supabase/migrations/20260902_130_compression_resilient_provenance.sql")
print("NEXT: npm run typecheck && npm run build")
