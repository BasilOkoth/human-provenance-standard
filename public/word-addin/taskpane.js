/* global Office, Word */
const IMPORT_KEY = "hps.trustedResearchAgent.wordImport.v1";
const AI_KEY = "hps.trustedResearchAgent.wordAi.v1";
let captured = null;

const $ = (id) => document.getElementById(id);
const now = () => new Date().toISOString();

function splitSentences(text){
  return text.replace(/\s+/g," ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(x=>x.trim()).filter(Boolean);
}
function claimLike(sentence){
  const words=sentence.split(/\s+/).length;
  return words>=8 && /\b(is|are|was|were|has|have|shows?|demonstrates?|suggests?|indicates?|increases?|decreases?|causes?|associated|significant|effective|improves?|reduces?)\b/i.test(sentence);
}
function citationMarkers(sentence){
  const markers=[];
  const authorYear=/\(([^)]*?\b(?:19|20)\d{2}[a-z]?[^)]*?)\)|\b([A-Z][A-Za-z'’\-]+(?:\s+et al\.)?)\s*\(((?:19|20)\d{2}[a-z]?)\)/g;
  const numeric=/\[(\d+(?:\s*[-,]\s*\d+)*)\]/g;
  const doi=/\b10\.\d{4,9}\/[\-._;()/:A-Z0-9]+\b/ig;
  for(const re of [authorYear,numeric,doi]){ let m; while((m=re.exec(sentence))!==null) markers.push(m[0]); }
  return markers;
}
async function sha256(text){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getWordText(scope){
  return Word.run(async (context)=>{
    const range = scope === "selection" ? context.document.getSelection() : context.document.body;
    range.load("text");
    await context.sync();
    return range.text || "";
  });
}
async function inspect(scope){
  try{
    const text=await getWordText(scope);
    if(!text.trim()){ $("status").textContent=`The ${scope} is empty.`; return; }
    const sentences=splitSentences(text);
    const claims=sentences.filter(claimLike);
    const rows=claims.map(sentence=>({sentence,citations:citationMarkers(sentence)}));
    const uncited=rows.filter(row=>row.citations.length===0);
    const hash=await sha256(text);
    const url=Office.context.document.url || undefined;
    captured={title:url?url.split(/[\\/]/).pop():"Microsoft Word manuscript",text,scope,capturedAt:now(),documentUrl:url,manuscriptHash:hash};

    $("auditCard").hidden=false;
    $("claimCount").textContent=String(rows.length);
    $("citationCount").textContent=String(rows.reduce((n,row)=>n+row.citations.length,0));
    $("uncitedCount").textContent=String(uncited.length);
    $("hash").textContent=hash;
    $("warnings").innerHTML="";
    if(uncited.length){
      const div=document.createElement("div"); div.className="warning high";
      div.textContent=`${uncited.length} claim-like sentence${uncited.length===1?"":"s"} contain no recognizable in-text citation. Full HPS review is required.`;
      $("warnings").appendChild(div);
    } else {
      const div=document.createElement("div"); div.className="warning";
      div.textContent="No obvious uncited claim-like sentences were found by the Word pre-check. Full HPS source resolution is still required.";
      $("warnings").appendChild(div);
    }
    $("docState").textContent=`Captured ${scope}: ${text.length.toLocaleString()} characters.`;
    $("sendHps").disabled=false;
    $("status").textContent="Word manuscript pre-check complete.";
  }catch(error){
    $("status").textContent=`Word integration error: ${error?.message || error}`;
  }
}

Office.onReady((info)=>{
  if(info.host !== Office.HostType.Word){ $("status").textContent="This HPS add-in must run inside Microsoft Word."; return; }
  $("readDoc").addEventListener("click",()=>inspect("document"));
  $("readSelection").addEventListener("click",()=>inspect("selection"));
  $("recordAi").addEventListener("click",()=>{
    const tool=$("aiTool").value.trim()||"AI tool";
    const task=$("aiTask").value.trim();
    if(!task){ $("aiState").textContent="Describe the AI assistance first."; return; }
    const event={type:"ai",at:now(),title:`${tool} assistance`,detail:task,source:"microsoft-word-addin",reviewed:false};
    const previous=JSON.parse(localStorage.getItem(AI_KEY)||"[]"); previous.push(event); localStorage.setItem(AI_KEY,JSON.stringify(previous));
    $("aiTask").value=""; $("aiState").textContent="AI assistance disclosure recorded locally for the HPS trail.";
  });
  $("sendHps").addEventListener("click",()=>{
    if(!captured) return;
    localStorage.setItem(IMPORT_KEY,JSON.stringify(captured));
    window.open(`${location.origin}/research-agent?wordImport=1`,"_blank","noopener,noreferrer");
    $("status").textContent="Transferred to HPS document-aware audit.";
  });
});
