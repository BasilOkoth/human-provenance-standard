import Link from "next/link";
import Nav from "@/components/Nav";
import QRCode from "qrcode";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { HPSManifestSchema } from "@/lib/hps/schema";
import {
  verifyRegistrySignature,
  verifyDetachedCanonical,
} from "@/lib/hps/crypto";
import RevokeRecord from "@/components/RevokeRecord";

export const dynamic = "force-dynamic";

type PublicEvidence = {
  id?: string;
  type?: string;
  visibility?: "public" | "hashed" | "sealed" | string;
  fileName?: string;
  sha256?: string;
  note?: string;
};

function label(value?: string) {
  return (value || "unknown").replaceAll("_", " ");
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: any = null;
  let attestations: any[] = [];
  let signatureValid = false;
  let qr = "";
  let creatorSigValid = false;
  let institutionSigValid = false;

  try {
    const admin = createAdminSupabase();

    const record = await admin
      .from("hps_records")
      .select("*")
      .eq("id", id)
      .single();

    data = record.data;

    if (data) {
      const parsedManifest = HPSManifestSchema.parse(data.manifest);

      signatureValid = verifyRegistrySignature(parsedManifest);

      creatorSigValid = Boolean(
        parsedManifest.creatorClaim &&
          parsedManifest.creatorSignature?.publicKey &&
          verifyDetachedCanonical(
            parsedManifest.creatorClaim,
            parsedManifest.creatorSignature.value,
            parsedManifest.creatorSignature.publicKey
          )
      );

      institutionSigValid = Boolean(
        parsedManifest.institutionalClaim &&
          parsedManifest.institutionSignature?.publicKey &&
          verifyDetachedCanonical(
            parsedManifest.institutionalClaim,
            parsedManifest.institutionSignature.value,
            parsedManifest.institutionSignature.publicKey
          )
      );

      const attestationResult = await admin
        .from("hps_attestations")
        .select("*")
        .eq("record_id", id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      attestations = attestationResult.data || [];

      const base =
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://human-provenance-standard.onrender.com";

      qr = await QRCode.toDataURL(`${base}/records/${id}`, {
        width: 320,
        margin: 1,
        color: {
          dark: "#111111",
          light: "#f4f0e8",
        },
      });
    }
  } catch {}

  if (!data) {
    return (
      <main className="pageShell">
        <Nav />
        <header className="pageHead shell">
          <h1>Record not found.</h1>
        </header>
      </main>
    );
  }

  const m: any = data.manifest;
  const actor = m.actors?.[0];
  const creatorClaim = m.creatorClaim;

  const human = (m.contributions || [])
    .filter((c: any) => c.origin === "human")
    .map((c: any) => c.type.replaceAll("_", " "))
    .join(" · ");

  const assisted = (m.contributions || [])
    .filter((c: any) => c.origin === "ai_assisted")
    .map((c: any) => c.type.replaceAll("_", " "))
    .join(" · ");

  const active = data.status === "active";
  const signed =
    creatorSigValid ||
    institutionSigValid ||
    Boolean(m.creatorSignature && m.hpsVersion === "0.4");

  const trust = active && signatureValid && signed;
  const code = id.split("-").pop();

  const supportingEvidence: PublicEvidence[] =
    creatorClaim?.supportingEvidence || m.evidence || [];

  const declaration = creatorClaim?.declaration || null;

  const aiDeclared = creatorClaim
    ? creatorClaim.aiUsed === true
      ? "Generative AI assistance declared"
      : "No generative AI declared"
    : null;

  const evidenceAssurance =
    supportingEvidence.length > 0 ? "evidence-backed claim" : "self-declared";

  return (
    <main className="pageShell">
      <Nav />

      {data.status === "revoked" && (
        <div className="revocationBanner">
          REVOKED ·{" "}
          {data.revocation_reason ||
            "This record has been revoked by its issuer."}
        </div>
      )}

      {data.status === "superseded" && (
        <div className="supersededBanner">
          SUPERSEDED · A newer version exists.
        </div>
      )}

      {data.status === "under_review" && (
        <div className="supersededBanner">
          UNDER REVIEW · A provenance challenge has been accepted for formal
          review. This is not a finding that the record is false.
        </div>
      )}

      <header className="recordHero shell">
        <div>
          <p className="eyebrow">
            HPS{" "}
            {data.record_kind === "institutional_document"
              ? "INSTITUTIONAL RECORD"
              : "PROVENANCE RECORD"}
          </p>

          <h1>{data.title}</h1>

          <p className="recordNumber">
            {id} · Version {data.version}
          </p>

          {trust && (
            <Link className="hpsCompactMark" href="/verify">
              <span className="hpsCompactLogo">HPS</span>
              <span className="hpsCompactCheck">✓</span>
              <span className="hpsCompactText">PROVENANCE RECORD VALID</span>
              <code>{code}</code>
            </Link>
          )}
        </div>

        {qr && <img className="qr" src={qr} alt={`QR for ${id}`} />}
      </header>

      <section className="recordDetail">
        <div className="verificationGrid">
          <div>
            <span>
              {data.record_kind === "institutional_document"
                ? "Institution signature"
                : "Creator signature"}
            </span>

            <strong className={signed ? "positive" : "negative"}>
              {signed ? "✓ Valid / present" : "✕ Missing or invalid"}
            </strong>
          </div>

          <div>
            <span>Registry signature</span>

            <strong className={signatureValid ? "positive" : "negative"}>
              {signatureValid
                ? "✓ Cryptographically valid"
                : "✕ Invalid"}
            </strong>
          </div>

          <div>
            <span>Identity assurance</span>
            <strong>{actor?.identityAssurance || "unknown"}</strong>
          </div>

          <div>
            <span>Status</span>
            <strong>{data.status}</strong>
          </div>
        </div>

        <dl className="recordFacts">
          <div>
            <dt>
              {data.record_kind === "institutional_document"
                ? "Issuer"
                : "Creator"}
            </dt>
            <dd>{data.creator_name}</dd>
          </div>

          {m.contributions?.length > 0 && (
            <>
              <div>
                <dt>Human contribution</dt>
                <dd>{human || "None declared"}</dd>
              </div>

              <div>
                <dt>Human contribution with AI assistance</dt>
                <dd>{assisted || "None declared"}</dd>
              </div>
            </>
          )}

          {aiDeclared && (
            <div>
              <dt>AI-use declaration</dt>
              <dd>{aiDeclared}</dd>
            </div>
          )}

          {creatorClaim && (
            <div>
              <dt>Contribution assurance</dt>
              <dd>{evidenceAssurance}</dd>
            </div>
          )}

          <div>
            <dt>Asset SHA-256</dt>
            <dd>
              <code>{data.asset_hash}</code>
            </dd>
          </div>

          <div>
            <dt>Portable badge</dt>
            <dd>
              <code>{`/api/badge/${id}`}</code>
            </dd>
          </div>
        </dl>

        {creatorClaim && (
          <>
            <div className="sectionHeader">
              <div>
                <p className="micro">CREATOR PROVENANCE</p>
                <h2>Declaration & supporting evidence</h2>
              </div>
            </div>

            <div className="verificationGrid">
              <div>
                <span>Creator declaration</span>
                <strong className={declaration?.accepted ? "positive" : ""}>
                  {declaration?.accepted ? "✓ Creator signed" : "Not recorded"}
                </strong>
              </div>

              <div>
                <span>Supporting evidence</span>
                <strong>
                  {supportingEvidence.length} item
                  {supportingEvidence.length === 1 ? "" : "s"}
                </strong>
              </div>

              <div>
                <span>Evidence assurance</span>
                <strong>{evidenceAssurance}</strong>
              </div>

              <div>
                <span>AI-use statement</span>
                <strong>{aiDeclared || "Not recorded"}</strong>
              </div>
            </div>

            {declaration?.statement && (
              <div className="notice" style={{ marginTop: 18 }}>
                <strong>Signed provenance declaration</strong>
                <p>{declaration.statement}</p>

                {declaration.acceptedAt && (
                  <p className="muted">
                    Accepted{" "}
                    {new Date(declaration.acceptedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {supportingEvidence.length === 0 ? (
              <p className="muted">
                No supporting evidence was attached to this creator claim.
                Human-contribution statements remain self-declared unless
                strengthened by an independent attestation.
              </p>
            ) : (
              <div className="attestationList">
                {supportingEvidence.map((evidence, index) => (
                  <article
                    key={evidence.id || `${evidence.sha256}-${index}`}
                  >
                    <div>
                      <span>{label(evidence.type)}</span>
                      <strong>{label(evidence.visibility)}</strong>
                    </div>

                    <p>
                      {evidence.note ||
                        "Supporting evidence fingerprint included in the signed provenance claim."}
                    </p>

                    <footer>
                      {evidence.fileName || "Evidence item"}
                      {evidence.sha256
                        ? ` · SHA-256 ${evidence.sha256}`
                        : ""}
                    </footer>
                  </article>
                ))}
              </div>
            )}

            <div className="notice" style={{ marginTop: 18 }}>
              <strong>What this means</strong>
              <p>
                HPS verifies the integrity of the signed provenance declaration
                and evidence fingerprints. Evidence-backed does not mean HPS
                independently proved every statement to be true. Sealed
                evidence remains private; hashed evidence records only its
                fingerprint.
              </p>
            </div>
          </>
        )}

        <div className="actions">
          <Link className="button primary" href="/verify">
            Verify this file
          </Link>

          <Link
            className="button darkButton"
            href={`/api/records/${id}/credentials`}
          >
            VC export
          </Link>

          <Link
            className="button darkButton"
            href={`/api/records/${id}/c2pa`}
          >
            C2PA mapping
          </Link>

          {data.status !== "revoked" && (
            <Link className="button darkButton" href={`/dispute/${id}`}>
              Challenge provenance
            </Link>
          )}
        </div>

        <RevokeRecord recordId={id} status={data.status} />

        <div className="sectionHeader">
          <div>
            <p className="micro">INDEPENDENT CLAIMS</p>
            <h2>Signed attestations</h2>
          </div>

          <Link className="button darkButton" href={`/attest/${id}`}>
            Add attestation
          </Link>
        </div>

        {attestations.length === 0 ? (
          <p className="muted">No third-party attestations yet.</p>
        ) : (
          <div className="attestationList">
            {attestations.map((attestation) => (
              <article key={attestation.id}>
                <div>
                  <span>
                    {attestation.claim_type.replaceAll("_", " ")}
                  </span>
                  <strong>
                    {attestation.attestor_signature ? "signed" : "legacy"}
                  </strong>
                </div>

                <p>{attestation.statement}</p>

                <footer>
                  {attestation.attestor_name}
                  {attestation.institution
                    ? ` · ${attestation.institution}`
                    : ""}
                </footer>
              </article>
            ))}
          </div>
        )}

        <details className="manifestDetails">
          <summary>View signed manifest</summary>
          <pre>{JSON.stringify(m, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}
