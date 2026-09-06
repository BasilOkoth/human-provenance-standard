const KEY = "hpsResearchEventsV1";
const status = document.getElementById("status");
const count = document.getElementById("count");

const now = () => new Date().toISOString();
const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

async function readEvents(){
  const data = await chrome.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}
async function writeEvent(event){
  const events = await readEvents();
  events.push(event);
  await chrome.storage.local.set({[KEY]:events});
  await refresh();
}
async function refresh(){
  const events = await readEvents();
  count.textContent = `${events.length} provenance event${events.length===1?"":"s"}`;
}

document.getElementById("saveSource").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url){ status.textContent="No active page available."; return; }
  await writeEvent({id:uid("source"),type:"source",at:now(),title:tab.title||tab.url,url:tab.url,detail:"Source explicitly captured by researcher."});
  status.textContent="Source saved.";
});

document.getElementById("saveAi").addEventListener("click", async () => {
  const tool = document.getElementById("tool").value.trim() || "AI tool";
  const task = document.getElementById("task").value.trim();
  if(!task){ status.textContent="Describe the AI assistance first."; return; }
  await writeEvent({id:uid("ai"),type:"ai",at:now(),title:`${tool} assistance`,detail:task,reviewed:false});
  document.getElementById("task").value="";
  status.textContent="AI assistance recorded.";
});

document.getElementById("checkpoint").addEventListener("click", async () => {
  await writeEvent({id:uid("checkpoint"),type:"checkpoint",at:now(),title:"Browser provenance checkpoint",detail:"User-created research checkpoint."});
  status.textContent="Checkpoint created.";
});

document.getElementById("export").addEventListener("click", async () => {
  const events = await readEvents();
  const blob = new Blob([JSON.stringify({hpsType:"browser-research-trail",hpsVersion:"0.1",events,disclosure:{captureMode:"explicit-user-approved-events",hiddenBrowsingCaptured:false,keystrokesCaptured:false}},null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`hps-browser-trail-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  status.textContent="Trail exported.";
});

refresh();
