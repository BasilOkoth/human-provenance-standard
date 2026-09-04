"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import {
  createIssuerKey,
  getIssuerPublicKey,
  signIssuerClaim
} from "@/lib/hps/issuer-keyvault";

type InstitutionalRecordRef = {
  id: string;
  title: string;
  creator_name?: string;
  issuer_org_id?: string;
  status: string;
  version: number;
  asset_hash: string;
  record_kind?: string;
  work_type?: string;
  manifest?: any;
};

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );

  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [org, setOrg] = useState<any>(null);
  const [role, setRole] = useState("");

  const [pk, setPk] = useState<string | null>(null);
  const [keyId, setKeyId] = useState("");
  const [pass, setPass] = useState("");

  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("official_letter");
  const [subjectName, setSubjectName] = useState("");
  const [fileName, setFileName] = useState("");
  const [assetHash, setAssetHash] = useState("");
  const [msg, setMsg] = useState("");
  const [issuedRecordId, setIssuedRecordId] = useState("");

  const [dups, setDups] = useState<any[]>([]);
  const [sameOrgMatches, setSameOrgMatches] = useState<InstitutionalRecordRef[]>([]);
  const [relatedRecordId, setRelatedRecordId] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [versionParent, setVersionParent] = useState<InstitutionalRecordRef | null>(null);

  const [eType, setEType] = useState("registration_certificate");
  const [regNo, setRegNo] = useState("");
  const [eNote, setENote] = useState("");
  const [eFile, setEFile] = useState<File | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [eMsg, setEMsg] = useState("");

  async function loadEvidence() {
    const r = await fetch(
      `/api/organizations/${id}/verification-evidence`,
      { cache: "no-store" }
    );

    if (r.ok) {
      const d = await r.json();
      setEvidence(d.evidence || []);
    }
  }

  async function loadParent(recordId: string) {
    const r = await fetch(`/api/records/${encodeURIComponent(recordId)}`, {
      cache: "no-store"
    });
    const d = await r.json();

    if (!r.ok || !d.record) {
      setMsg(d.error || "Unable to load the previous HPS record.");
      return;
    }

    const record = d.record as InstitutionalRecordRef;

    if (
      record.record_kind !== "institutional_document" ||
      record.issuer_org_id !== id
    ) {
      setMsg("That HPS record was not issued by this institution.");
      return;
    }

    if (record.status !== "active") {
      setMsg(
        "Only an active institutional record can be used as the parent of a new version."
      );
      return;
    }

    setVersionParent(record);

    const previousClaim = record.manifest?.institutionalClaim;
    setTitle(previousClaim?.title || record.title || "");
    setDocumentType(
      previousClaim?.documentType || record.work_type || "official_letter"
    );
    setSubjectName(previousClaim?.subjectName || "");

    setMsg(
      `Versioning mode: ${record.id} (Version ${record.version || 1}) is the parent. Select the UPDATED file. HPS will reject identical bytes.`
    );
  }

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/organizations");
      const d = await r.json();

      const row = (d.organizations || []).find(
        (x: any) => x.hps_organizations?.id === id
      );

      setOrg(row?.hps_organizations);
      setRole(row?.role || "");

      const localPk = getIssuerPublicKey(id);
      setPk(localPk);

      if (localPk) {
        const kr = await fetch(`/api/organizations/${id}/keys`);

        if (kr.ok) {
          const kd = await kr.json();
          const match = (kd.keys || []).find(
            (k: any) =>
              k.public_key === localPk &&
              k.status === "active"
          );

          if (match) {
            setKeyId(match.id);
          }
        }
      }

      await loadEvidence();

      const requestedParentId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("parent")
          : null;

      if (requestedParentId) {
        await loadParent(requestedParentId);
      }
    })();
  }, [id]);

  async function makeKey() {
    if (pass.length < 10) {
      return setMsg(
        "Use an issuer-key passphrase of at least 10 characters."
      );
    }

    const publicKey = await createIssuerKey(id, pass);
    setPk(publicKey);

    const r = await fetch(`/api/organizations/${id}/keys`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        publicKey,
        label: "Primary issuer key"
      })
    });

    const d = await r.json();

    if (r.ok) {
      setKeyId(d.key.id);
      setMsg("Issuer key registered.");
    } else {
      setMsg(d.error || "Unable to register issuer key.");
    }
  }

  function beginVersion(record: InstitutionalRecordRef) {
    if (record.status !== "active") {
      setMsg("A superseded or revoked record cannot be the parent of a new version.");
      return;
    }

    setVersionParent(record);
    setSameOrgMatches([]);
    setAssetHash("");
    setFileName("");
    setDups([]);
    setRelatedRecordId("");
    setRelationshipType("");
    setIssuedRecordId("");

    setMsg(
      `Versioning mode enabled for ${record.id}. Now select the updated document file. It must differ from Version ${record.version || 1}.`
    );
  }

  function cancelVersion() {
    setVersionParent(null);
    setAssetHash("");
    setFileName("");
    setSameOrgMatches([]);
    setDups([]);
    setRelatedRecordId("");
    setRelationshipType("");
    setMsg("Versioning mode cancelled.");
  }

  async function chooseFile(file?: File) {
    if (!file) return;

    setIssuedRecordId("");
    setFileName(file.name);

    const hash = await hashFile(file);

    setAssetHash(hash);
    setDups([]);
    setSameOrgMatches([]);
    setRelatedRecordId("");
    setRelationshipType("");

    const r = await fetch(
      `/api/organizations/${id}/asset-check?hash=${hash}`
    );

    if (!r.ok) {
      setMsg("Unable to check existing institutional provenance.");
      return;
    }

    const d = await r.json();
    const sameOrganization = (d.sameOrganization || []) as InstitutionalRecordRef[];

    if (sameOrganization.length) {
      setSameOrgMatches(sameOrganization);
      setMsg(
        "This exact file is already registered by this institution. Identical bytes cannot be issued as a new version. View the existing record, or choose an active record below as the parent and then upload an updated file."
      );
      return;
    }

    if (versionParent && versionParent.asset_hash === hash) {
      setMsg(
        "The selected file is byte-for-byte identical to the parent record. A new version must contain a real change."
      );
      return;
    }

    if ((d.otherOrganizations || []).length) {
      setDups(d.otherOrganizations);
      setRelatedRecordId(d.otherOrganizations[0].id);
      setMsg(
        "This exact file is already registered by another institution. Review the existing record and declare the relationship before issuing."
      );
      return;
    }

    if (versionParent) {
      setMsg(
        `✓ Updated file selected. HPS will issue Version ${(versionParent.version || 1) + 1} and automatically mark ${versionParent.id} as superseded.`
      );
      return;
    }

    setMsg(
      "✓ No prior institutional registration found for this exact file. You may proceed with issuance if this is the final approved document."
    );
  }

  async function uploadEvidence() {
    if (!eFile) {
      return setEMsg("Choose an evidence file.");
    }

    const form = new FormData();
    form.set("file", eFile);
    form.set("evidenceType", eType);
    form.set("registrationNumber", regNo);
    form.set("note", eNote);

    const r = await fetch(
      `/api/organizations/${id}/verification-evidence`,
      {
        method: "POST",
        body: form
      }
    );

    const d = await r.json();

    if (!r.ok) {
      return setEMsg(d.error || "Unable to upload evidence.");
    }

    setEMsg("Verification evidence uploaded privately.");
    setEFile(null);
    await loadEvidence();
  }

  async function issue() {
    if (!org || !pk || !keyId) {
      return setMsg("Register an issuer key first.");
    }

    if (!title) {
      return setMsg("Enter the document title.");
    }

    if (!assetHash) {
      return setMsg("Choose the final document file first.");
    }

    if (sameOrgMatches.length) {
      return setMsg(
        "This exact file already has institutional provenance. Select an updated file before issuing."
      );
    }

    if (versionParent && versionParent.asset_hash === assetHash) {
      return setMsg("A new version cannot contain the exact same bytes as its parent.");
    }

    if (
      dups.length &&
      (!relatedRecordId || !relationshipType)
    ) {
      return setMsg(
        "Declare the relationship to the existing HPS record."
      );
    }

    const claim = {
      organizationId: id,
      organizationName: org.name,
      documentType,
      title,
      subjectName: subjectName || undefined,
      fileName: fileName || undefined,
      assetHash,
      issuerPublicKey: pk,
      issuerKeyId: keyId,
      parentRecordId: versionParent?.id || null,
      issuedAt: new Date().toISOString()
    };

    try {
      const signed = await signIssuerClaim(id, claim, pass);

      const body: any = {
        institutionalClaim: claim,
        institutionSignature: signed.signature
      };

      if (dups.length) {
        body.assetRelationship = {
          relatedRecordId,
          relationshipType
        };
      }

      const r = await fetch(`/api/organizations/${id}/issue`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const d = await r.json();

      if (!r.ok) {
        setMsg(d.error || "Unable to issue record.");
        return;
      }

      setIssuedRecordId(d.id);
      setMsg(
        versionParent
          ? `✓ Issued ${d.id} as Version ${(versionParent.version || 1) + 1}. The previous record has been superseded.`
          : `✓ Issued ${d.id}.`
      );
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  if (!org) {
    return (
      <main className="pageShell">
        <Nav />
        <div className="loading">Loading institution…</div>
      </main>
    );
  }

  return (
    <main className="pageShell">
      <Nav />

      <header className="pageHead shell">
        <p className="eyebrow">HPS INSTITUTIONAL ISSUER</p>
        <h1>{org.name}</h1>
        <p>
          Verification: <strong>{org.verification_status}</strong> · Your role:{" "}
          <strong>{role}</strong>
        </p>

        <div className="actions">
          <Link
            className="button primary"
            href={`/institutional/${id}/bulk`}
          >
            Bulk issuance
          </Link>
        </div>
      </header>

      <section className="panel">
        <div className="formGrid">
          <div className="sectionLabel">
            00 · Institution verification evidence
          </div>

          <div className="field">
            <label>Evidence type</label>
            <select
              value={eType}
              onChange={e => setEType(e.target.value)}
            >
              <option value="registration_certificate">
                Registration certificate
              </option>
              <option value="government_registry">
                Government/regulator registry
              </option>
              <option value="authorization_letter">
                Authorization letter
              </option>
              <option value="operating_licence">
                Operating licence
              </option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label>Registration/licence number</label>
            <input
              value={regNo}
              onChange={e => setRegNo(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Evidence file (private)</label>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={e => setEFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="field">
            <label>Note</label>
            <input
              value={eNote}
              onChange={e => setENote(e.target.value)}
            />
          </div>

          <div className="field full">
            <button
              className="button secondary"
              onClick={uploadEvidence}
              disabled={!eFile}
            >
              Upload verification evidence
            </button>

            {eMsg && <div className="accountMessage">{eMsg}</div>}
          </div>

          {evidence.length > 0 && (
            <div className="field full">
              <strong>Submitted evidence</strong>
              <ul>
                {evidence.map((x: any) => (
                  <li key={x.id}>
                    {x.evidence_type} · {x.file_name}
                    {x.registration_number
                      ? ` · ${x.registration_number}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sectionLabel">01 · Authorized issuer key</div>

          <div className="field full">
            <label>Issuer key passphrase</label>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
            />
          </div>

          <div className="field full">
            {pk ? (
              <>
                <label>Registered issuer public key</label>
                <code className="publicKey">{pk}</code>
              </>
            ) : (
              <button
                className="button primary"
                onClick={makeKey}
              >
                Create & register issuer key
              </button>
            )}
          </div>

          <div className="sectionLabel">02 · Issue document</div>

          {versionParent && (
            <div className="field full">
              <div className="notice">
                <strong>
                  Creating Version {(versionParent.version || 1) + 1}
                </strong>
                <p>
                  Parent: {versionParent.id} · Version {versionParent.version || 1}
                  {versionParent.title ? ` · ${versionParent.title}` : ""}
                </p>
                <div className="actions">
                  <Link
                    className="button darkButton"
                    href={`/records/${versionParent.id}`}
                    target="_blank"
                  >
                    View previous version
                  </Link>
                  <button
                    type="button"
                    className="textButton"
                    onClick={cancelVersion}
                  >
                    Cancel versioning
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="field">
            <label>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Document type</label>
            <input
              value={documentType}
              onChange={e => setDocumentType(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Subject / recipient</label>
            <input
              value={subjectName}
              onChange={e => setSubjectName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>
              {versionParent ? "Updated document file" : "Final document file"}
            </label>
            <input
              type="file"
              onChange={e => chooseFile(e.target.files?.[0])}
            />
          </div>

          {assetHash && (
            <div className="hashBox">
              <span>ASSET SHA-256</span>
              <code>{assetHash}</code>
            </div>
          )}

          {sameOrgMatches.length > 0 && (
            <>
              <div className="sectionLabel">03 · Existing HPS record</div>

              <div className="field full">
                <div className="notice">
                  <strong>Exact institutional provenance already exists</strong>
                  <p>
                    HPS will not issue the same bytes twice. If this document has
                    been updated, choose the active record below as its parent,
                    then upload the changed file.
                  </p>
                </div>
              </div>

              <div className="field full">
                {sameOrgMatches.map(record => (
                  <div
                    key={record.id}
                    style={{
                      padding: "14px 0",
                      borderBottom: "1px solid rgba(0,0,0,.12)"
                    }}
                  >
                    <strong>{record.title || record.id}</strong>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {record.id} · Version {record.version || 1} · {record.status}
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}>
                      <Link
                        className="button darkButton"
                        href={`/records/${record.id}`}
                        target="_blank"
                      >
                        View record
                      </Link>

                      {record.status === "active" && (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => beginVersion(record)}
                        >
                          Create new version from this record
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {dups.length > 0 && (
            <>
              <div className="sectionLabel">
                04 · Existing asset relationship
              </div>

              <div className="field full">
                {dups.map((d: any) => (
                  <label
                    key={d.id}
                    style={{ display: "block", marginBottom: 8 }}
                  >
                    <input
                      type="radio"
                      checked={relatedRecordId === d.id}
                      onChange={() => setRelatedRecordId(d.id)}
                    />{" "}
                    {d.id} · {d.creator_name} · {d.title}
                  </label>
                ))}
              </div>

              <div className="field">
                <label>Relationship</label>
                <select
                  value={relationshipType}
                  onChange={e => setRelationshipType(e.target.value)}
                >
                  <option value="">Choose relationship…</option>
                  <option value="co_issuer">Co-issuer</option>
                  <option value="co_signatory">Co-signatory</option>
                  <option value="attestor">Attestor</option>
                  <option value="endorser">Endorser</option>
                </select>
              </div>
            </>
          )}

          <div className="field full">
            <button
              className="button primary"
              disabled={
                !title ||
                !assetHash ||
                !pk ||
                !pass ||
                sameOrgMatches.length > 0 ||
                Boolean(versionParent && versionParent.asset_hash === assetHash) ||
                (dups.length > 0 && !relationshipType)
              }
              onClick={issue}
            >
              {versionParent
                ? `Sign & issue Version ${(versionParent.version || 1) + 1}`
                : "Sign & issue institutional record"}
            </button>
          </div>
        </div>

        {msg && <div className="accountMessage">{msg}</div>}

        {issuedRecordId && (
          <div className="actions" style={{ marginTop: 18 }}>
            <Link
              className="button primary"
              href={`/records/${issuedRecordId}`}
            >
              View issued record
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
