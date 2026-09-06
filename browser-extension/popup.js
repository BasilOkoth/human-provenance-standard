const KEY = "hpsResearchEventsV1";
const HPS_IMPORT_URL = "https://www.humanprovenancestandard.org/research-agent/browser-import";

const status = document.getElementById("status");
const count = document.getElementById("count");
const aiForm = document.getElementById("aiForm");
const reviewAi = document.getElementById("reviewAi");
const toggleAi = document.getElementById("toggleAi");

const now = () => new Date().toISOString();
const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

async function readEvents(){
  const data = await chrome.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}

async function writeEvents(events){
  await chrome.storage.local.set({[KEY]:events});
  await refresh();
}

async function writeEvent(event){
  const events = await readEvents();
  events.push(event);
  await writeEvents(events);
}

async function refresh(){
  const events = await readEvents();
  count.textContent = `${events.length} event${events.length===1?"":"s"}`;

  const unreviewed = [...events].reverse().find(
    (event) => event.type === "ai" && !event.reviewed
  );

  reviewAi.classList.toggle("show", Boolean(unreviewed));
}

function utf8ToBase64Url(value){
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function trailPayload(events){
  return {
    hpsType:"browser-research-trail",
    hpsVersion:"0.2",
    events,
    disclosure:{
      captureMode:"explicit-user-approved-events",
      hiddenBrowsingCaptured:false,
      keystrokesCaptured:false
    }
  };
}

toggleAi.addEventListener("click", () => {
  aiForm.classList.toggle("open");
  if(aiForm.classList.contains("open")){
    document.getElementById("tool").focus();
    toggleAi.textContent = "Close AI disclosure";
  }else{
    toggleAi.textContent = "Record AI assistance";
  }
});

document.getElementById("saveSource").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url){ status.textContent="No active page available."; return; }

  await writeEvent({
    id:uid("source"),
    type:"source",
    at:now(),
    title:tab.title||tab.url,
    url:tab.url,
    detail:"Source explicitly captured by researcher."
  });

  status.textContent="Source saved.";
});

document.getElementById("saveAi").addEventListener("click", async () => {
  const tool = document.getElementById("tool").value.trim() || "AI tool";
  const task = document.getElementById("task").value.trim();

  if(!task){
    status.textContent="Describe the AI assistance first.";
    return;
  }

  await writeEvent({
    id:uid("ai"),
    type:"ai",
    at:now(),
    title:`${tool} assistance`,
    detail:task,
    reviewed:false
  });

  document.getElementById("task").value="";
  aiForm.classList.remove("open");
  toggleAi.textContent="Record AI assistance";
  status.textContent="AI assistance recorded.";
});

reviewAi.addEventListener("click", async () => {
  const events = await readEvents();
  let index = -1;

  for(let i=events.length-1;i>=0;i-=1){
    if(events[i].type === "ai" && !events[i].reviewed){
      index=i;
      break;
    }
  }

  if(index < 0){
    status.textContent="No unreviewed AI event.";
    return;
  }

  const note = window.prompt(
    "What did you verify or change after checking the AI output?",
    "AI-assisted output checked against the source and reviewed by the researcher."
  );

  if(note === null) return;
  if(!note.trim()){
    status.textContent="Add a short review note.";
    return;
  }

  const aiEvent = {
    ...events[index],
    reviewed:true,
    reviewedAt:now()
  };

  events[index] = aiEvent;

  events.push({
    id:uid("review"),
    type:"review",
    at:now(),
    title:"Human review of AI assistance",
    detail:note.trim(),
    relatedEventId:aiEvent.id,
    reviewed:true
  });

  await writeEvents(events);
  status.textContent="Human review linked to AI event.";
});

document.getElementById("checkpoint").addEventListener("click", async () => {
  const events = await readEvents();
  const unreviewedAi = events.filter(
    (event) => event.type === "ai" && !event.reviewed
  );

  await writeEvent({
    id:uid("checkpoint"),
    type:"checkpoint",
    at:now(),
    title:"Browser provenance checkpoint",
    detail:unreviewedAi.length
      ? `User-created checkpoint. ${unreviewedAi.length} AI-assistance event(s) remain unreviewed.`
      : "User-created checkpoint. All recorded AI-assistance events are human-reviewed."
  });

  status.textContent = unreviewedAi.length
    ? `Checkpoint saved · ${unreviewedAi.length} AI event(s) still need review.`
    : "Checkpoint saved.";
});

document.getElementById("sendHps").addEventListener("click", async () => {
  const events = await readEvents();

  if(!events.length){
    status.textContent="There is no trail to send yet.";
    return;
  }

  const encoded = utf8ToBase64Url(JSON.stringify(trailPayload(events)));

  await chrome.tabs.create({
    url:`${HPS_IMPORT_URL}#trail=${encoded}`
  });

  status.textContent="Opening HPS…";
});

document.getElementById("export").addEventListener("click", async () => {
  const events = await readEvents();

  const blob = new Blob(
    [JSON.stringify(trailPayload(events),null,2)],
    {type:"application/json"}
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url;
  a.download=`hps-browser-trail-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  status.textContent="Trail exported.";
});

refresh();
