/*
 * script.js – Smart Vision AI Assistant (FINAL FIXED)
 * Fixes: phone HTTPS camera, cm distance always shown, real chat, better detection UI
 */
"use strict";

const API = window.location.origin;

let currentLang          = 'en';
let currentObjectContext = null;
let currentDetections    = [];
let conversationHistory  = [];
let isProcessing         = false;
let isCameraOn           = false;
let uploadMode           = 'detect';
let currentStream        = null;
let captureInterval      = null;
let fullInfoText          = '';
let voiceListening       = false;
let recognition          = null;
let lastCaptureTime      = 0;
let voiceEnabled         = false;

// ── i18n strings ─────────────────────────────────────────────────────────────
const UI = {
  en:{
    statusReady:'System Ready',statusCamera:'Camera Active',
    statusStopped:'Camera Stopped',statusAnalysing:'Analysing…',statusError:'Error',
    noObjects:'No objects detected yet',startOrUpload:'Start camera or upload an image',
    noHistory:'No detections yet',cameraPanel:'Camera Vision',uploadPanel:'Upload Image',
    detected:'Detection Results',chat:'Chat Assistant',history:'Detection History',
    voicePanel:'Voice Controls',startVoice:'Start Voice Command',stopVoice:'Stop Listening',
    sayCommands:'Say commands like:',noCamera:'Camera not started',
    clickStart:'Click "Start Camera" to begin',drag:'Drag & drop or click to upload',
    welcomeMsg:"Hello! I'm your Smart Vision AI. Start camera or upload an image to begin!",
    about:'About This Project',hudLabel:'SCANNING…',distHint:'Distance',
    askBtn:'Ask AI',speakBtn:'Speak',infoBtn:'Full Info',
    mDetections:'Detections',mHistory:'History',mLang:'Language',
  },
  hi:{
    statusReady:'सिस्टम तैयार',statusCamera:'कैमरा सक्रिय',
    statusStopped:'कैमरा बंद',statusAnalysing:'विश्लेषण…',statusError:'त्रुटि',
    noObjects:'अभी तक कोई वस्तु नहीं',startOrUpload:'कैमरा शुरू करें या छवि अपलोड करें',
    noHistory:'कोई पहचान नहीं',cameraPanel:'कैमरा विज़न',uploadPanel:'छवि अपलोड करें',
    detected:'पहचान परिणाम',chat:'चैट सहायक',history:'पहचान इतिहास',
    voicePanel:'वॉयस नियंत्रण',startVoice:'वॉयस कमांड शुरू करें',stopVoice:'सुनना बंद करें',
    sayCommands:'इस तरह कमांड दें:',noCamera:'कैमरा शुरू नहीं हुआ',
    clickStart:'"कैमरा शुरू करें" दबाएं',drag:'खींचें और छोड़ें या क्लिक करें',
    welcomeMsg:'नमस्ते! कैमरा चालू करें या छवि अपलोड करें!',
    about:'इस प्रोजेक्ट के बारे में',hudLabel:'स्कैनिंग…',distHint:'दूरी',
    askBtn:'AI से पूछें',speakBtn:'बोलें',infoBtn:'पूरी जानकारी',
    mDetections:'पहचान',mHistory:'इतिहास',mLang:'भाषा',
  },
  kn:{
    statusReady:'ಸಿಸ್ಟಮ್ ಸಿದ್ಧ',statusCamera:'ಕ್ಯಾಮೆರಾ ಸಕ್ರಿಯ',
    statusStopped:'ಕ್ಯಾಮೆರಾ ನಿಲ್ಲಿಸಲಾಗಿದೆ',statusAnalysing:'ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ…',statusError:'ದೋಷ',
    noObjects:'ಯಾವ ವಸ್ತುವೂ ಪತ್ತೆಯಾಗಿಲ್ಲ',startOrUpload:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ ಅಥವಾ ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ',
    noHistory:'ಯಾವ ಪತ್ತೆಯೂ ಇಲ್ಲ',cameraPanel:'ಕ್ಯಾಮೆರಾ ದೃಷ್ಟಿ',uploadPanel:'ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ',
    detected:'ಪತ್ತೆ ಫಲಿತಾಂಶ',chat:'ಚಾಟ್ ಸಹಾಯಕ',history:'ಪತ್ತೆ ಇತಿಹಾಸ',
    voicePanel:'ಧ್ವನಿ ನಿಯಂತ್ರಣ',startVoice:'ಧ್ವನಿ ಆಜ್ಞೆ ಪ್ರಾರಂಭಿಸಿ',stopVoice:'ಕೇಳುವುದನ್ನು ನಿಲ್ಲಿಸಿ',
    sayCommands:'ಈ ರೀತಿ ಆಜ್ಞೆ ಹೇಳಿ:',noCamera:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿಲ್ಲ',
    clickStart:'"ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ" ಒತ್ತಿ',drag:'ಎಳೆದು ಬಿಡಿ ಅಥವಾ ಕ್ಲಿಕ್ ಮಾಡಿ',
    welcomeMsg:'ನಮಸ್ಕಾರ! ಕ್ಯಾಮೆರಾ ತೋರಿಸಿ ಅಥವಾ ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ!',
    about:'ಈ ಯೋಜನೆಯ ಬಗ್ಗೆ',hudLabel:'ಸ್ಕ್ಯಾನಿಂಗ್…',distHint:'ದೂರ',
    askBtn:'AI ಕೇಳಿ',speakBtn:'ಮಾತಾಡಿ',infoBtn:'ಪೂರ್ಣ ಮಾಹಿತಿ',
    mDetections:'ಪತ್ತೆಗಳು',mHistory:'ಇತಿಹಾಸ',mLang:'ಭಾಷೆ',
  }
};
const LANG_CODES = {en:'en-US',hi:'hi-IN',kn:'kn-IN'};
const VOICE_HINTS = {
  en:['"What is this?"','"Tell distance"','"Read text"','"Switch to Hindi"','"Full information"'],
  hi:['"यह क्या है?"','"दूरी बताओ"','"पाठ पढ़ो"','"हिंदी बोलो"','"पूरी जानकारी"'],
  kn:['"ಇದೇನು?"','"ದೂರ ಹೇಳಿ"','"ಪಠ್ಯ ಓದಿ"','"ಕನ್ನಡದಲ್ಲಿ"','"ಪೂರ್ಣ ಮಾಹಿತಿ"'],
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const videoEl        = $('videoEl');
const videoCanvas    = $('videoCanvas');
const camPlaceholder = $('camPlaceholder');
const camScanOverlay = $('camScanOverlay');
const liveBadge      = $('liveBadge');
const startCamBtn    = $('startCamBtn');
const stopCamBtn     = $('stopCamBtn');
const captureBtn     = $('captureBtn');
const fileInput      = $('fileInput');
const dropZone       = $('dropZone');
const uploadPreview  = $('uploadPreview');
const previewImg     = $('previewImg');
const resultsContainer = $('resultsContainer');
const chatMessages   = $('chatMessages');
const chatInput      = $('chatInput');
const sendBtn        = $('sendBtn');
const historyList    = $('historyList');
const langSelect     = $('langSelect');
const statusChip     = $('statusChip');
const statusText     = $('statusText');
const voiceCmdBtn    = $('voiceCmdBtn');
const voiceTranscript= $('voiceTranscript');
const vtText         = $('vtText');
const mDetections    = $('mDetections');
const mHistory       = $('mHistory');
const mLang          = $('mLang');
const mVoice         = $('mVoice');

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  applyLang('en');
  checkHealth();
  loadHistory();
  const saved = localStorage.getItem('svt');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
});

function setupEvents() {
  startCamBtn.addEventListener('click', startCamera);
  stopCamBtn.addEventListener('click',  stopCamera);
  captureBtn.addEventListener('click',  captureAndAnalyse);
  dropZone.addEventListener('click',    () => fileInput.click());
  dropZone.addEventListener('dragover', e=>{e.preventDefault();dropZone.classList.add('drag-over');});
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop',     e=>{e.preventDefault();dropZone.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
  fileInput.addEventListener('change',  e=>handleFile(e.target.files[0]));
  $('clearUploadBtn').addEventListener('click',  clearUpload);
  $('analyseAgainBtn').addEventListener('click', analyseAgain);
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
  $('clearChatBtn').addEventListener('click',    clearChat);
  $('clearResultsBtn').addEventListener('click', clearResults);
  $('clearHistoryBtn').addEventListener('click', clearHistory);
  $('speakAllBtn').addEventListener('click',     speakAll);
  langSelect.addEventListener('change', e=>applyLang(e.target.value));
  voiceCmdBtn.addEventListener('click', toggleVoice);
  $('themeBtn').addEventListener('click', toggleTheme);
}

// ── LANGUAGE ──────────────────────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang;
  const u = UI[lang] || UI.en;
  setStatus(u.statusReady, 'ok');
  mLang.textContent = lang.toUpperCase();

  // Metric labels
  mDetections.parentElement.querySelector('.metric-label').textContent = u.mDetections;
  mHistory.parentElement.querySelector('.metric-label').textContent    = u.mHistory;
  mLang.parentElement.querySelector('.metric-label').textContent       = u.mLang;

  const map = {
    lblCameraPanel:u.cameraPanel,lblUploadPanel:u.uploadPanel,lblDetected:u.detected,
    lblChatPanel:u.chat,lblHistory:u.history,lblVoicePanel:u.voicePanel,
    lblNoObjects:u.noObjects,lblStartOrUpload:u.startOrUpload,lblNoHistory:u.noHistory,
    lblNoCamera:u.noCamera,lblClickStart:u.clickStart,lblDrag:u.drag,
    lblVoiceCmd:u.startVoice,lblSayCommands:u.sayCommands,
    hudLabel:u.hudLabel,welcomeMsg:u.welcomeMsg,lblAbout:u.about,
  };
  for(const[id,txt] of Object.entries(map)) setText(id,txt);

  startCamBtn.textContent = {en:'Start Camera',hi:'कैमरा शुरू करें',kn:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ'}[lang];
  stopCamBtn.textContent  = {en:'Stop',hi:'बंद',kn:'ನಿಲ್ಲಿಸಿ'}[lang];
  captureBtn.textContent  = {en:'📸 Capture',hi:'📸 कैप्चर',kn:'📸 ಕ್ಯಾಪ್ಚರ್'}[lang];

  const pills = $('voiceHintPills');
  if(pills) pills.innerHTML = (VOICE_HINTS[lang]||VOICE_HINTS.en).map(h=>`<span class="vh-pill">${h}</span>`).join('');
}
function setText(id,txt){const e=$(id);if(e)e.textContent=txt;}
function setStatus(msg,type='ok'){
  statusText.textContent=msg;
  statusChip.className='status-chip'+(type==='error'?' error':type==='warn'?' warning':'');
}

async function checkHealth(){
  try{
    const r=await fetch(`${API}/api/health`);
    const d=await r.json();
    setStatus(UI[currentLang].statusReady+(d.ai_ready?' · AI Ready':''),'ok');
  }catch{setStatus('Server offline – start Flask!','error');}
}

// ── CAMERA ────────────────────────────────────────────────────────────────────
async function startCamera(){
  try{
    // Try back camera (phone), fallback to any
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}
      });
    }catch{
      stream = await navigator.mediaDevices.getUserMedia({video:true});
    }
    currentStream = stream;
    videoEl.srcObject = stream;
    await new Promise(res=>{videoEl.onloadedmetadata=res;});
    await videoEl.play();

    videoEl.style.display        = 'block';
    camPlaceholder.style.display = 'none';
    camScanOverlay.style.display = 'block';
    liveBadge.style.display      = 'inline-flex';
    startCamBtn.disabled = true;
    stopCamBtn.disabled  = false;
    captureBtn.disabled  = false;
    isCameraOn = true;
    setStatus(UI[currentLang].statusCamera,'ok');
    drawLoop();
    captureInterval = setInterval(captureAndAnalyse, 3000);
  }catch(e){
    console.error(e);
    setStatus(UI[currentLang].statusError,'error');
    const isHttp = location.protocol === 'http:';
    if(isHttp){
      addBotMsg(`❌ Camera blocked on HTTP!\n\nOn your phone, open:\nhttps://${location.hostname}:5000\n\nThen tap "Advanced" → "Proceed to site" when you see the security warning.`);
    } else {
      addBotMsg('❌ Camera error: '+e.message+'\nPlease allow camera permission in your browser settings.');
    }
  }
}

function stopCamera(){
  if(currentStream)currentStream.getTracks().forEach(t=>t.stop());
  currentStream=null;
  clearInterval(captureInterval);captureInterval=null;
  videoEl.style.display        = 'none';
  camPlaceholder.style.display = 'flex';
  camScanOverlay.style.display = 'none';
  liveBadge.style.display      = 'none';
  startCamBtn.disabled=false;stopCamBtn.disabled=true;captureBtn.disabled=true;
  isCameraOn=false;
  setStatus(UI[currentLang].statusStopped,'ok');
}

function drawLoop(){
  if(!isCameraOn)return;
  const ctx=videoCanvas.getContext('2d');
  if(videoEl.videoWidth>0){
    videoCanvas.width=videoEl.videoWidth;
    videoCanvas.height=videoEl.videoHeight;
    ctx.drawImage(videoEl,0,0);
  }
  requestAnimationFrame(drawLoop);
}

async function captureAndAnalyse(){
  if(!isCameraOn||isProcessing)return;
  const now=Date.now();
  if(now-lastCaptureTime<2500)return;
  lastCaptureTime=now;
  const c=document.createElement('canvas');
  c.width=videoEl.videoWidth||640;c.height=videoEl.videoHeight||480;
  c.getContext('2d').drawImage(videoEl,0,0);
  c.toBlob(blob=>{if(blob)sendForDetection(blob,'camera');},'image/jpeg',0.85);
}

// ── UPLOAD ────────────────────────────────────────────────────────────────────
function setUploadMode(mode){
  uploadMode=mode;
  $('tabDetect').classList.toggle('active',mode==='detect');
  $('tabOCR').classList.toggle('active',mode==='ocr');
}
window.setUploadMode=setUploadMode;

function handleFile(file){
  if(!file||!file.type.startsWith('image/'))return;
  const r=new FileReader();
  r.onload=e=>{previewImg.src=e.target.result;dropZone.style.display='none';uploadPreview.style.display='block';};
  r.readAsDataURL(file);
  window._lastFile=file;
  if(uploadMode==='ocr')sendForOCR(file);
  else sendForDetection(file,'upload');
}
function analyseAgain(){if(window._lastFile){if(uploadMode==='ocr')sendForOCR(window._lastFile);else sendForDetection(window._lastFile,'upload');}}
function clearUpload(){uploadPreview.style.display='none';dropZone.style.display='flex';fileInput.value='';window._lastFile=null;}

// ── DETECTION ─────────────────────────────────────────────────────────────────
async function sendForDetection(blob, source){
  if(isProcessing)return;
  isProcessing=true;
  setStatus(UI[currentLang].statusAnalysing,'ok');
  const fd=new FormData();
  fd.append('file',blob,'image.jpg');
  fd.append('language',currentLang);
  try{
    const res=await fetch(`${API}/api/detect`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.error)throw new Error(data.error);

    currentDetections=data.objects||[];
    renderDetections(currentDetections);
    mDetections.textContent=currentDetections.length;

    // Show annotated image
    if(data.annotated_image){
      const img=new Image();
      img.onload=()=>{
        const ctx=videoCanvas.getContext('2d');
        videoCanvas.width=img.naturalWidth;videoCanvas.height=img.naturalHeight;
        ctx.drawImage(img,0,0);
      };
      img.src=`data:image/jpeg;base64,${data.annotated_image}`;
      if(source==='upload')previewImg.src=img.src;
    }

    // Auto-announce first detection
    if(currentDetections.length>0){
      const first=currentDetections[0];
      const d=first.distance;
      currentObjectContext=first.name;
      chatInput.disabled=false;sendBtn.disabled=false;
      $('speakAllBtn').disabled=false;

      if(first.name!==window._lastChatObj){
        window._lastChatObj=first.name;
        const distTxt = d ? ` — ${d.cm} cm away` : '';
        addBotMsg(`🔍 Detected: ${first.name.toUpperCase()}${distTxt} (${Math.round(first.confidence*100)}% confident)`);
        if(voiceEnabled){
          const s = d ? `${first.name}, ${d.cm} centimetres away.` : `${first.name} detected.`;
          speak(s);
        }
      }
    }

    checkObstacles(currentDetections);
    loadHistory();
    setStatus(UI[currentLang].statusReady,'ok');
  }catch(e){
    setStatus(UI[currentLang].statusError,'error');
    console.error(e);
  }
  isProcessing=false;
}

// ── RENDER DETECTIONS ─────────────────────────────────────────────────────────
function renderDetections(detections){
  const u=UI[currentLang];
  if(!detections||!detections.length){
    resultsContainer.innerHTML=`<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>${u.noObjects}</p><p class="empty-note">${u.startOrUpload}</p></div>`;
    return;
  }
  resultsContainer.innerHTML=detections.map((det,i)=>{
    const conf=Math.round(det.confidence*100);
    const cls=conf>=80?'conf-high':conf>=55?'conf-med':'conf-low';
    const d=det.distance;  // {cm, m} or null

    // Distance — show cm, m, zone label, and coloured bar
    let distHtml='';
    if(d){
      const barW = Math.max(5, Math.min(95, 100-(d.cm/600)*100));
      const mStr = d.cm >= 100 ? ` (${d.m} m)` : '';

      // Zone: how far is the object?
      let zone, zoneColor, zoneIcon;
      if      (d.cm < 50)  { zone='Very Close';   zoneColor='#ff3c5e'; zoneIcon='🔴'; }
      else if (d.cm < 100) { zone='Close';         zoneColor='#f5a623'; zoneIcon='🟡'; }
      else if (d.cm < 200) { zone='Near';          zoneColor='#00d4ff'; zoneIcon='🔵'; }
      else if (d.cm < 400) { zone='Medium Range';  zoneColor='#00ff9d'; zoneIcon='🟢'; }
      else                 { zone='Far Away';      zoneColor='#7b5ea7'; zoneIcon='🟣'; }

      distHtml=`
        <div class="dist-row">
          <div class="dist-top-row">
            <span class="dist-icon">📏</span>
            <span class="dist-number">${d.cm} cm${mStr}</span>
            <span class="dist-zone-badge" style="background:${zoneColor}22;border:1px solid ${zoneColor};color:${zoneColor}">${zoneIcon} ${zone}</span>
          </div>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width:${barW}%;background:linear-gradient(90deg,${zoneColor},${zoneColor}88)"></div>
          </div>
          <div class="dist-hint-row">
            <span class="dist-scale-lbl">0 cm</span>
            <span class="dist-scale-mid">300 cm</span>
            <span class="dist-scale-lbl">600 cm</span>
          </div>
        </div>`;
    }

    return `
    <div class="det-item">
      <div class="det-header">
        <span class="det-name">${det.name.toUpperCase()}</span>
        <span class="det-conf-badge ${cls}">${conf}%</span>
      </div>
      ${distHtml}
      <div class="det-actions">
        <button class="det-btn speak"  onclick="speakDet(${i})">${u.speakBtn}</button>
        <button class="det-btn"        onclick="askAbout('${det.name}')">${u.askBtn}</button>
        <button class="det-btn info"   onclick="showFullInfo('${det.name}')">${u.infoBtn}</button>
      </div>
    </div>`;
  }).join('');
}

// ── OCR ───────────────────────────────────────────────────────────────────────
async function sendForOCR(blob){
  if(isProcessing)return;isProcessing=true;
  setStatus(UI[currentLang].statusAnalysing,'ok');
  addBotMsg('🔠 Reading text from image…');
  const fd=new FormData();fd.append('file',blob,'image.jpg');fd.append('language',currentLang);
  try{
    const res=await fetch(`${API}/api/ocr`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.text){addBotMsg(`📝 Text found:\n\n${data.text}`);if(voiceEnabled)speak(data.text);chatInput.disabled=false;sendBtn.disabled=false;}
    else{addBotMsg(data.message||'No text found.');if(data.tip)addBotMsg(`💡 ${data.tip}`);}
    setStatus(UI[currentLang].statusReady,'ok');
  }catch{addBotMsg('OCR failed. Is Tesseract installed on the server?');setStatus(UI[currentLang].statusError,'error');}
  isProcessing=false;
}

// ── FULL INFO MODAL ───────────────────────────────────────────────────────────
async function showFullInfo(name){
  $('fullInfoModal').style.display='flex';
  $('infoTitle').textContent=name;
  $('infoBody').textContent='Loading…';
  try{
    const res=await fetch(`${API}/api/full_info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({object_name:name,language:currentLang})});
    const data=await res.json();
    fullInfoText=data.info||'No information available.';
    $('infoBody').textContent=fullInfoText;
  }catch{$('infoBody').textContent='Could not load information.';}
}
window.closeFullInfo=()=>{$('fullInfoModal').style.display='none';};
window.speakFullInfo=()=>{if(fullInfoText)speak(fullInfoText);};

// ── OBSTACLE CHECK ────────────────────────────────────────────────────────────
async function checkObstacles(detections){
  const close=detections.filter(d=>d.distance&&d.distance.cm<80);
  if(!close.length)return;
  try{
    const res=await fetch(`${API}/api/obstacle_check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({detections,language:currentLang})});
    const data=await res.json();
    if(data.has_alert){
      const msg=data.alerts[0];
      $('alertTitle').textContent={en:'⚠️ Obstacle Alert!',hi:'⚠️ बाधा चेतावनी!',kn:'⚠️ ಅಡಚಣೆ ಎಚ್ಚರಿಕೆ!'}[currentLang];
      $('alertMsg').textContent=msg;
      $('obstacleModal').style.display='flex';
      speak(msg);
    }
  }catch{}
}
window.closeObstacleAlert=()=>{$('obstacleModal').style.display='none';};

// ── SPEAK ─────────────────────────────────────────────────────────────────────
function speak(text){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  utt.lang=LANG_CODES[currentLang]||'en-US';utt.rate=0.92;utt.pitch=1;
  const voices=window.speechSynthesis.getVoices();
  const match=voices.find(v=>v.lang.startsWith(utt.lang.split('-')[0]));
  if(match)utt.voice=match;
  voiceEnabled=true;mVoice.textContent='ON';mVoice.classList.add('on');
  window.speechSynthesis.speak(utt);
}

function speakDet(idx){
  const det=currentDetections[idx];if(!det)return;
  const d=det.distance;
  let dist='';
  if(d){
    let zone;
    if      (d.cm<50)  zone='very close, be careful';
    else if (d.cm<100) zone='close range';
    else if (d.cm<200) zone='near range';
    else if (d.cm<400) zone='medium range';
    else               zone='far away';
    dist=` It is ${d.cm} centimetres away — ${zone}.`;
  }
  speak(`${det.name} detected with ${Math.round(det.confidence*100)} percent confidence.${dist}`);
}
function speakAll(){
  const n=currentDetections.map(d=>d.name).join(', ');
  if(n)speak(`Detected: ${n}`);
}

// ── VOICE COMMANDS ────────────────────────────────────────────────────────────
function toggleVoice(){if(voiceListening)stopVoice();else startVoice();}

function startVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addBotMsg('Voice recognition needs Chrome or Edge.');return;}
  recognition=new SR();
  recognition.lang=LANG_CODES[currentLang]||'en-US';
  recognition.continuous=false;recognition.interimResults=false;
  recognition.onstart=()=>{
    voiceListening=true;voiceCmdBtn.classList.add('listening');
    setText('lblVoiceCmd',UI[currentLang].stopVoice);
    voiceTranscript.style.display='block';vtText.textContent='…';
    $('vsText').textContent='Listening…';
    document.querySelector('.vs-dot').classList.add('active');
  };
  recognition.onresult=e=>{
    const t=e.results[0][0].transcript;vtText.textContent=t;handleCmd(t.toLowerCase());
  };
  recognition.onerror=recognition.onend=stopVoice;
  recognition.start();
}
function stopVoice(){
  voiceListening=false;if(recognition)recognition.stop();
  voiceCmdBtn.classList.remove('listening');
  setText('lblVoiceCmd',UI[currentLang].startVoice);
  $('vsText').textContent='Ready';
  document.querySelector('.vs-dot').classList.remove('active');
}
function handleCmd(cmd){
  if(cmd.includes('hindi')||cmd.includes('हिंदी')){langSelect.value='hi';applyLang('hi');speak('भाषा हिंदी में बदली।');return;}
  if(cmd.includes('kannada')||cmd.includes('ಕನ್ನಡ')){langSelect.value='kn';applyLang('kn');speak('ಭಾಷೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿತು.');return;}
  if(cmd.includes('english')){langSelect.value='en';applyLang('en');speak('Language changed to English.');return;}

  const obj=currentDetections[0]?.name;

  if(cmd.includes('what is')||cmd.includes('describe')||cmd.includes('क्या है')||cmd.includes('ಏನು')){
    if(obj)askAbout(obj);else speak('No object detected yet.');return;
  }
  if(cmd.includes('distance')||cmd.includes('दूरी')||cmd.includes('ದೂರ')){
    const d=currentDetections[0]?.distance;
    if(d)speak(`The ${obj} is ${d.cm} centimetres away.`);else speak('Distance not available.');return;
  }
  if(cmd.includes('read text')||cmd.includes('ocr')||cmd.includes('पाठ')||cmd.includes('ಪಠ್ಯ')){
    setUploadMode('ocr');speak('Please upload an image with text.');return;
  }
  if(cmd.includes('full info')||cmd.includes('पूरी जानकारी')||cmd.includes('ಪೂರ್ಣ')){
    if(obj)showFullInfo(obj);return;
  }
  if(cmd.includes('capture')||cmd.includes('snap')||cmd.includes('photo')){captureAndAnalyse();return;}

  chatInput.value=cmd;sendChat();
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
async function sendChat(){
  const msg=chatInput.value.trim();
  if(!msg||isProcessing)return;
  addUserMsg(msg);chatInput.value='';showTyping();isProcessing=true;
  try{
    const res=await fetch(`${API}/api/chat`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,object_context:currentObjectContext,language:currentLang,conversation_history:conversationHistory.slice(-6)})
    });
    const data=await res.json();removeTyping();
    const reply=data.response||'No response.';
    addBotMsg(reply);if(voiceEnabled)speak(reply);
    conversationHistory.push({role:'user',content:msg},{role:'assistant',content:reply});
    if(conversationHistory.length>20)conversationHistory=conversationHistory.slice(-20);
  }catch{removeTyping();addBotMsg('Chat error. Is Flask running?');}
  isProcessing=false;
}
async function askAbout(name){currentObjectContext=name;chatInput.value=`What is a ${name}?`;sendChat();}

function addBotMsg(text){
  const d=document.createElement('div');d.className='msg-bot';
  d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble">${escHtml(text)}</div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function addUserMsg(text){
  const d=document.createElement('div');d.className='msg-user';
  d.innerHTML=`<div class="msg-bubble">${escHtml(text)}</div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function showTyping(){
  const d=document.createElement('div');d.id='typingDots';d.className='msg-bot';
  d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble typing-dots"><span></span><span></span><span></span></div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function removeTyping(){const e=$('typingDots');if(e)e.remove();}
function clearChat(){chatMessages.innerHTML='';conversationHistory=[];window._lastChatObj=null;addBotMsg(UI[currentLang].welcomeMsg);}

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function loadHistory(){
  try{const res=await fetch(`${API}/api/history`);const data=await res.json();if(data.history)renderHistory(data.history);}catch{}
}
function renderHistory(items){
  mHistory.textContent=items.length;
  if(!items.length){historyList.innerHTML=`<div class="history-empty"><p>${UI[currentLang].noHistory}</p></div>`;return;}
  historyList.innerHTML=items.map(h=>{
    const dist=h.distance_cm?`${h.distance_cm}cm`:'—';
    return `<div class="history-item"><div class="hi-dot"></div><div class="hi-name">${(h.name||'').toUpperCase()}</div><div class="hi-dist">${dist}</div><div class="hi-conf">${h.confidence}%</div><div class="hi-time">${h.time||''}</div></div>`;
  }).join('');
}
async function clearHistory(){
  try{await fetch(`${API}/api/history/clear`,{method:'POST'});historyList.innerHTML=`<div class="history-empty"><p>${UI[currentLang].noHistory}</p></div>`;mHistory.textContent='0';}catch{}
}

function clearResults(){
  currentDetections=[];currentObjectContext=null;mDetections.textContent='0';
  resultsContainer.innerHTML=`<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>${UI[currentLang].noObjects}</p><p class="empty-note">${UI[currentLang].startOrUpload}</p></div>`;
  $('speakAllBtn').disabled=true;
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme(){
  const h=document.documentElement;
  const n=h.getAttribute('data-theme')==='dark'?'light':'dark';
  h.setAttribute('data-theme',n);$('themeBtn').textContent=n==='dark'?'💡':'🌙';
  localStorage.setItem('svt',n);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
window._lastChatObj=null;

/*
 * script.js – Smart Vision AI Assistant (FINAL FIXED)
 * Fixes: phone HTTPS camera, cm distance always shown, real chat, better detection UI
 */
"use strict";

const API = window.location.origin;

let currentLang          = 'en';
let currentObjectContext = null;
let currentDetections    = [];
let conversationHistory  = [];
let isProcessing         = false;
let isCameraOn           = false;
let uploadMode           = 'detect';
let currentStream        = null;
let captureInterval      = null;
let fullInfoText          = '';
let voiceListening       = false;
let recognition          = null;
let lastCaptureTime      = 0;
let voiceEnabled         = false;

// ── i18n strings ─────────────────────────────────────────────────────────────
const UI = {
  en:{
    statusReady:'System Ready',statusCamera:'Camera Active',
    statusStopped:'Camera Stopped',statusAnalysing:'Analysing…',statusError:'Error',
    noObjects:'No objects detected yet',startOrUpload:'Start camera or upload an image',
    noHistory:'No detections yet',cameraPanel:'Camera Vision',uploadPanel:'Upload Image',
    detected:'Detection Results',chat:'Chat Assistant',history:'Detection History',
    voicePanel:'Voice Controls',startVoice:'Start Voice Command',stopVoice:'Stop Listening',
    sayCommands:'Say commands like:',noCamera:'Camera not started',
    clickStart:'Click "Start Camera" to begin',drag:'Drag & drop or click to upload',
    welcomeMsg:"Hello! I'm your Smart Vision AI. Start camera or upload an image to begin!",
    about:'About This Project',hudLabel:'SCANNING…',distHint:'Distance',
    askBtn:'Ask AI',speakBtn:'Speak',infoBtn:'Full Info',
    mDetections:'Detections',mHistory:'History',mLang:'Language',
  },
  hi:{
    statusReady:'सिस्टम तैयार',statusCamera:'कैमरा सक्रिय',
    statusStopped:'कैमरा बंद',statusAnalysing:'विश्लेषण…',statusError:'त्रुटि',
    noObjects:'अभी तक कोई वस्तु नहीं',startOrUpload:'कैमरा शुरू करें या छवि अपलोड करें',
    noHistory:'कोई पहचान नहीं',cameraPanel:'कैमरा विज़न',uploadPanel:'छवि अपलोड करें',
    detected:'पहचान परिणाम',chat:'चैट सहायक',history:'पहचान इतिहास',
    voicePanel:'वॉयस नियंत्रण',startVoice:'वॉयस कमांड शुरू करें',stopVoice:'सुनना बंद करें',
    sayCommands:'इस तरह कमांड दें:',noCamera:'कैमरा शुरू नहीं हुआ',
    clickStart:'"कैमरा शुरू करें" दबाएं',drag:'खींचें और छोड़ें या क्लिक करें',
    welcomeMsg:'नमस्ते! कैमरा चालू करें या छवि अपलोड करें!',
    about:'इस प्रोजेक्ट के बारे में',hudLabel:'स्कैनिंग…',distHint:'दूरी',
    askBtn:'AI से पूछें',speakBtn:'बोलें',infoBtn:'पूरी जानकारी',
    mDetections:'पहचान',mHistory:'इतिहास',mLang:'भाषा',
  },
  kn:{
    statusReady:'ಸಿಸ್ಟಮ್ ಸಿದ್ಧ',statusCamera:'ಕ್ಯಾಮೆರಾ ಸಕ್ರಿಯ',
    statusStopped:'ಕ್ಯಾಮೆರಾ ನಿಲ್ಲಿಸಲಾಗಿದೆ',statusAnalysing:'ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ…',statusError:'ದೋಷ',
    noObjects:'ಯಾವ ವಸ್ತುವೂ ಪತ್ತೆಯಾಗಿಲ್ಲ',startOrUpload:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ ಅಥವಾ ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ',
    noHistory:'ಯಾವ ಪತ್ತೆಯೂ ಇಲ್ಲ',cameraPanel:'ಕ್ಯಾಮೆರಾ ದೃಷ್ಟಿ',uploadPanel:'ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ',
    detected:'ಪತ್ತೆ ಫಲಿತಾಂಶ',chat:'ಚಾಟ್ ಸಹಾಯಕ',history:'ಪತ್ತೆ ಇತಿಹಾಸ',
    voicePanel:'ಧ್ವನಿ ನಿಯಂತ್ರಣ',startVoice:'ಧ್ವನಿ ಆಜ್ಞೆ ಪ್ರಾರಂಭಿಸಿ',stopVoice:'ಕೇಳುವುದನ್ನು ನಿಲ್ಲಿಸಿ',
    sayCommands:'ಈ ರೀತಿ ಆಜ್ಞೆ ಹೇಳಿ:',noCamera:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿಲ್ಲ',
    clickStart:'"ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ" ಒತ್ತಿ',drag:'ಎಳೆದು ಬಿಡಿ ಅಥವಾ ಕ್ಲಿಕ್ ಮಾಡಿ',
    welcomeMsg:'ನಮಸ್ಕಾರ! ಕ್ಯಾಮೆರಾ ತೋರಿಸಿ ಅಥವಾ ಚಿತ್ರ ಅಪ್ಲೋಡ್ ಮಾಡಿ!',
    about:'ಈ ಯೋಜನೆಯ ಬಗ್ಗೆ',hudLabel:'ಸ್ಕ್ಯಾನಿಂಗ್…',distHint:'ದೂರ',
    askBtn:'AI ಕೇಳಿ',speakBtn:'ಮಾತಾಡಿ',infoBtn:'ಪೂರ್ಣ ಮಾಹಿತಿ',
    mDetections:'ಪತ್ತೆಗಳು',mHistory:'ಇತಿಹಾಸ',mLang:'ಭಾಷೆ',
  }
};
const LANG_CODES = {en:'en-US',hi:'hi-IN',kn:'kn-IN'};
const VOICE_HINTS = {
  en:['"What is this?"','"Tell distance"','"Read text"','"Switch to Hindi"','"Full information"'],
  hi:['"यह क्या है?"','"दूरी बताओ"','"पाठ पढ़ो"','"हिंदी बोलो"','"पूरी जानकारी"'],
  kn:['"ಇದೇನು?"','"ದೂರ ಹೇಳಿ"','"ಪಠ್ಯ ಓದಿ"','"ಕನ್ನಡದಲ್ಲಿ"','"ಪೂರ್ಣ ಮಾಹಿತಿ"'],
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const videoEl        = $('videoEl');
const videoCanvas    = $('videoCanvas');
const camPlaceholder = $('camPlaceholder');
const camScanOverlay = $('camScanOverlay');
const liveBadge      = $('liveBadge');
const startCamBtn    = $('startCamBtn');
const stopCamBtn     = $('stopCamBtn');
const captureBtn     = $('captureBtn');
const fileInput      = $('fileInput');
const dropZone       = $('dropZone');
const uploadPreview  = $('uploadPreview');
const previewImg     = $('previewImg');
const resultsContainer = $('resultsContainer');
const chatMessages   = $('chatMessages');
const chatInput      = $('chatInput');
const sendBtn        = $('sendBtn');
const historyList    = $('historyList');
const langSelect     = $('langSelect');
const statusChip     = $('statusChip');
const statusText     = $('statusText');
const voiceCmdBtn    = $('voiceCmdBtn');
const voiceTranscript= $('voiceTranscript');
const vtText         = $('vtText');
const mDetections    = $('mDetections');
const mHistory       = $('mHistory');
const mLang          = $('mLang');
const mVoice         = $('mVoice');

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  applyLang('en');
  checkHealth();
  loadHistory();
  const saved = localStorage.getItem('svt');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
});

function setupEvents() {
  startCamBtn.addEventListener('click', startCamera);
  stopCamBtn.addEventListener('click',  stopCamera);
  captureBtn.addEventListener('click',  captureAndAnalyse);
  dropZone.addEventListener('click',    () => fileInput.click());
  dropZone.addEventListener('dragover', e=>{e.preventDefault();dropZone.classList.add('drag-over');});
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop',     e=>{e.preventDefault();dropZone.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
  fileInput.addEventListener('change',  e=>handleFile(e.target.files[0]));
  $('clearUploadBtn').addEventListener('click',  clearUpload);
  $('analyseAgainBtn').addEventListener('click', analyseAgain);
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
  $('clearChatBtn').addEventListener('click',    clearChat);
  $('clearResultsBtn').addEventListener('click', clearResults);
  $('clearHistoryBtn').addEventListener('click', clearHistory);
  $('speakAllBtn').addEventListener('click',     speakAll);
  langSelect.addEventListener('change', e=>applyLang(e.target.value));
  voiceCmdBtn.addEventListener('click', toggleVoice);
  $('themeBtn').addEventListener('click', toggleTheme);
}

// ── LANGUAGE ──────────────────────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang;
  const u = UI[lang] || UI.en;
  setStatus(u.statusReady, 'ok');
  mLang.textContent = lang.toUpperCase();

  // Metric labels
  mDetections.parentElement.querySelector('.metric-label').textContent = u.mDetections;
  mHistory.parentElement.querySelector('.metric-label').textContent    = u.mHistory;
  mLang.parentElement.querySelector('.metric-label').textContent       = u.mLang;

  const map = {
    lblCameraPanel:u.cameraPanel,lblUploadPanel:u.uploadPanel,lblDetected:u.detected,
    lblChatPanel:u.chat,lblHistory:u.history,lblVoicePanel:u.voicePanel,
    lblNoObjects:u.noObjects,lblStartOrUpload:u.startOrUpload,lblNoHistory:u.noHistory,
    lblNoCamera:u.noCamera,lblClickStart:u.clickStart,lblDrag:u.drag,
    lblVoiceCmd:u.startVoice,lblSayCommands:u.sayCommands,
    hudLabel:u.hudLabel,welcomeMsg:u.welcomeMsg,lblAbout:u.about,
  };
  for(const[id,txt] of Object.entries(map)) setText(id,txt);

  startCamBtn.textContent = {en:'Start Camera',hi:'कैमरा शुरू करें',kn:'ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ'}[lang];
  stopCamBtn.textContent  = {en:'Stop',hi:'बंद',kn:'ನಿಲ್ಲಿಸಿ'}[lang];
  captureBtn.textContent  = {en:'📸 Capture',hi:'📸 कैप्चर',kn:'📸 ಕ್ಯಾಪ್ಚರ್'}[lang];

  const pills = $('voiceHintPills');
  if(pills) pills.innerHTML = (VOICE_HINTS[lang]||VOICE_HINTS.en).map(h=>`<span class="vh-pill">${h}</span>`).join('');
}
function setText(id,txt){const e=$(id);if(e)e.textContent=txt;}
function setStatus(msg,type='ok'){
  statusText.textContent=msg;
  statusChip.className='status-chip'+(type==='error'?' error':type==='warn'?' warning':'');
}

async function checkHealth(){
  try{
    const r=await fetch(`${API}/api/health`);
    const d=await r.json();
    setStatus(UI[currentLang].statusReady+(d.ai_ready?' · AI Ready':''),'ok');
  }catch{setStatus('Server offline – start Flask!','error');}
}

// ── CAMERA ────────────────────────────────────────────────────────────────────
async function startCamera(){
  try{
    // Try back camera (phone), fallback to any
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}
      });
    }catch{
      stream = await navigator.mediaDevices.getUserMedia({video:true});
    }
    currentStream = stream;
    videoEl.srcObject = stream;
    await new Promise(res=>{videoEl.onloadedmetadata=res;});
    await videoEl.play();

    videoEl.style.display        = 'block';
    camPlaceholder.style.display = 'none';
    camScanOverlay.style.display = 'block';
    liveBadge.style.display      = 'inline-flex';
    startCamBtn.disabled = true;
    stopCamBtn.disabled  = false;
    captureBtn.disabled  = false;
    isCameraOn = true;
    setStatus(UI[currentLang].statusCamera,'ok');
    drawLoop();
    captureInterval = setInterval(captureAndAnalyse, 3000);
  }catch(e){
    console.error(e);
    setStatus(UI[currentLang].statusError,'error');
    const isHttp = location.protocol === 'http:';
    if(isHttp){
      addBotMsg(`❌ Camera blocked on HTTP!\n\nOn your phone, open:\nhttps://${location.hostname}:5000\n\nThen tap "Advanced" → "Proceed to site" when you see the security warning.`);
    } else {
      addBotMsg('❌ Camera error: '+e.message+'\nPlease allow camera permission in your browser settings.');
    }
  }
}

function stopCamera(){
  if(currentStream)currentStream.getTracks().forEach(t=>t.stop());
  currentStream=null;
  clearInterval(captureInterval);captureInterval=null;
  videoEl.style.display        = 'none';
  camPlaceholder.style.display = 'flex';
  camScanOverlay.style.display = 'none';
  liveBadge.style.display      = 'none';
  startCamBtn.disabled=false;stopCamBtn.disabled=true;captureBtn.disabled=true;
  isCameraOn=false;
  setStatus(UI[currentLang].statusStopped,'ok');
}

function drawLoop(){
  if(!isCameraOn)return;
  const ctx=videoCanvas.getContext('2d');
  if(videoEl.videoWidth>0){
    videoCanvas.width=videoEl.videoWidth;
    videoCanvas.height=videoEl.videoHeight;
    ctx.drawImage(videoEl,0,0);
  }
  requestAnimationFrame(drawLoop);
}

async function captureAndAnalyse(){
  if(!isCameraOn||isProcessing)return;
  const now=Date.now();
  if(now-lastCaptureTime<2500)return;
  lastCaptureTime=now;
  const c=document.createElement('canvas');
  c.width=videoEl.videoWidth||640;c.height=videoEl.videoHeight||480;
  c.getContext('2d').drawImage(videoEl,0,0);
  c.toBlob(blob=>{if(blob)sendForDetection(blob,'camera');},'image/jpeg',0.85);
}

// ── UPLOAD ────────────────────────────────────────────────────────────────────
function setUploadMode(mode){
  uploadMode=mode;
  $('tabDetect').classList.toggle('active',mode==='detect');
  $('tabOCR').classList.toggle('active',mode==='ocr');
}
window.setUploadMode=setUploadMode;

function handleFile(file){
  if(!file||!file.type.startsWith('image/'))return;
  const r=new FileReader();
  r.onload=e=>{previewImg.src=e.target.result;dropZone.style.display='none';uploadPreview.style.display='block';};
  r.readAsDataURL(file);
  window._lastFile=file;
  if(uploadMode==='ocr')sendForOCR(file);
  else sendForDetection(file,'upload');
}
function analyseAgain(){if(window._lastFile){if(uploadMode==='ocr')sendForOCR(window._lastFile);else sendForDetection(window._lastFile,'upload');}}
function clearUpload(){uploadPreview.style.display='none';dropZone.style.display='flex';fileInput.value='';window._lastFile=null;}

// ── DETECTION ─────────────────────────────────────────────────────────────────
async function sendForDetection(blob, source){
  if(isProcessing)return;
  isProcessing=true;
  setStatus(UI[currentLang].statusAnalysing,'ok');
  const fd=new FormData();
  fd.append('file',blob,'image.jpg');
  fd.append('language',currentLang);
  try{
    const res=await fetch(`${API}/api/detect`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.error)throw new Error(data.error);

    currentDetections=data.objects||[];
    renderDetections(currentDetections);
    mDetections.textContent=currentDetections.length;

    // Show annotated image
    if(data.annotated_image){
      const img=new Image();
      img.onload=()=>{
        const ctx=videoCanvas.getContext('2d');
        videoCanvas.width=img.naturalWidth;videoCanvas.height=img.naturalHeight;
        ctx.drawImage(img,0,0);
      };
      img.src=`data:image/jpeg;base64,${data.annotated_image}`;
      if(source==='upload')previewImg.src=img.src;
    }

    // Auto-announce first detection
    if(currentDetections.length>0){
      const first=currentDetections[0];
      const d=first.distance;
      currentObjectContext=first.name;
      chatInput.disabled=false;sendBtn.disabled=false;
      $('speakAllBtn').disabled=false;

      if(first.name!==window._lastChatObj){
        window._lastChatObj=first.name;
        const distTxt = d ? ` — ${d.cm} cm away` : '';
        addBotMsg(`🔍 Detected: ${first.name.toUpperCase()}${distTxt} (${Math.round(first.confidence*100)}% confident)`);
        if(voiceEnabled){
          const s = d ? `${first.name}, ${d.cm} centimetres away.` : `${first.name} detected.`;
          speak(s);
        }
      }
    }

    checkObstacles(currentDetections);
    loadHistory();
    setStatus(UI[currentLang].statusReady,'ok');
  }catch(e){
    setStatus(UI[currentLang].statusError,'error');
    console.error(e);
  }
  isProcessing=false;
}

// ── RENDER DETECTIONS ─────────────────────────────────────────────────────────
function renderDetections(detections){
  const u=UI[currentLang];
  if(!detections||!detections.length){
    resultsContainer.innerHTML=`<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>${u.noObjects}</p><p class="empty-note">${u.startOrUpload}</p></div>`;
    return;
  }
  resultsContainer.innerHTML=detections.map((det,i)=>{
    const conf=Math.round(det.confidence*100);
    const cls=conf>=80?'conf-high':conf>=55?'conf-med':'conf-low';
    const d=det.distance;  // {cm, m} or null

    // Distance — show cm, m, zone label, and coloured bar
    let distHtml='';
    if(d){
      const barW = Math.max(5, Math.min(95, 100-(d.cm/600)*100));
      const mStr = d.cm >= 100 ? ` (${d.m} m)` : '';

      // Zone: how far is the object?
      let zone, zoneColor, zoneIcon;
      if      (d.cm < 50)  { zone='Very Close';   zoneColor='#ff3c5e'; zoneIcon='🔴'; }
      else if (d.cm < 100) { zone='Close';         zoneColor='#f5a623'; zoneIcon='🟡'; }
      else if (d.cm < 200) { zone='Near';          zoneColor='#00d4ff'; zoneIcon='🔵'; }
      else if (d.cm < 400) { zone='Medium Range';  zoneColor='#00ff9d'; zoneIcon='🟢'; }
      else                 { zone='Far Away';      zoneColor='#7b5ea7'; zoneIcon='🟣'; }

      distHtml=`
        <div class="dist-row">
          <div class="dist-top-row">
            <span class="dist-icon">📏</span>
            <span class="dist-number">${d.cm} cm${mStr}</span>
            <span class="dist-zone-badge" style="background:${zoneColor}22;border:1px solid ${zoneColor};color:${zoneColor}">${zoneIcon} ${zone}</span>
          </div>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width:${barW}%;background:linear-gradient(90deg,${zoneColor},${zoneColor}88)"></div>
          </div>
          <div class="dist-hint-row">
            <span class="dist-scale-lbl">0 cm</span>
            <span class="dist-scale-mid">300 cm</span>
            <span class="dist-scale-lbl">600 cm</span>
          </div>
        </div>`;
    }

    // Color display
    const col = det.color;
    let colorHtml = '';
    if(col && col.name && col.name !== 'Unknown'){
      colorHtml = `<div class="color-row">
        <div class="color-swatch" style="background:${col.hex};box-shadow:0 0 8px ${col.hex}66"></div>
        <span class="color-label">🎨 ${col.full_label || col.name}</span>
        <span class="color-hex">${col.hex}</span>
      </div>`;
    }

    return `
    <div class="det-item">
      <div class="det-header">
        <span class="det-name">${det.name.toUpperCase()}</span>
        <span class="det-conf-badge ${cls}">${conf}%</span>
      </div>
      ${colorHtml}
      ${distHtml}
      <div class="det-actions">
        <button class="det-btn speak"  onclick="speakDet(${i})">${u.speakBtn}</button>
        <button class="det-btn"        onclick="askAbout('${det.name}')">${u.askBtn}</button>
        <button class="det-btn info"   onclick="showFullInfo('${det.name}')">${u.infoBtn}</button>
        <button class="det-btn feedback" onclick="openFeedback('${det.name}',${i})" title="Report wrong answer">🔧 Wrong?</button>
      </div>
    </div>`;
  }).join('');
}

// ── OCR ───────────────────────────────────────────────────────────────────────
async function sendForOCR(blob){
  if(isProcessing)return;isProcessing=true;
  setStatus(UI[currentLang].statusAnalysing,'ok');
  addBotMsg('🔠 Reading text from image…');
  const fd=new FormData();fd.append('file',blob,'image.jpg');fd.append('language',currentLang);
  try{
    const res=await fetch(`${API}/api/ocr`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.text){addBotMsg(`📝 Text found:\n\n${data.text}`);if(voiceEnabled)speak(data.text);chatInput.disabled=false;sendBtn.disabled=false;}
    else{addBotMsg(data.message||'No text found.');if(data.tip)addBotMsg(`💡 ${data.tip}`);}
    setStatus(UI[currentLang].statusReady,'ok');
  }catch{addBotMsg('OCR failed. Is Tesseract installed on the server?');setStatus(UI[currentLang].statusError,'error');}
  isProcessing=false;
}

// ── FULL INFO MODAL ───────────────────────────────────────────────────────────
async function showFullInfo(name){
  $('fullInfoModal').style.display='flex';
  $('infoTitle').textContent=name;
  $('infoBody').textContent='Loading…';
  try{
    const res=await fetch(`${API}/api/full_info`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({object_name:name,language:currentLang})});
    const data=await res.json();
    fullInfoText=data.info||'No information available.';
    $('infoBody').textContent=fullInfoText;
  }catch{$('infoBody').textContent='Could not load information.';}
}
window.closeFullInfo=()=>{$('fullInfoModal').style.display='none';};
window.speakFullInfo=()=>{if(fullInfoText)speak(fullInfoText);};

// ── OBSTACLE CHECK ────────────────────────────────────────────────────────────
async function checkObstacles(detections){
  const close=detections.filter(d=>d.distance&&d.distance.cm<80);
  if(!close.length)return;
  try{
    const res=await fetch(`${API}/api/obstacle_check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({detections,language:currentLang})});
    const data=await res.json();
    if(data.has_alert){
      const msg=data.alerts[0];
      $('alertTitle').textContent={en:'⚠️ Obstacle Alert!',hi:'⚠️ बाधा चेतावनी!',kn:'⚠️ ಅಡಚಣೆ ಎಚ್ಚರಿಕೆ!'}[currentLang];
      $('alertMsg').textContent=msg;
      $('obstacleModal').style.display='flex';
      speak(msg);
    }
  }catch{}
}
window.closeObstacleAlert=()=>{$('obstacleModal').style.display='none';};

// ── SPEAK ─────────────────────────────────────────────────────────────────────
function speak(text){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  utt.lang=LANG_CODES[currentLang]||'en-US';utt.rate=0.92;utt.pitch=1;
  const voices=window.speechSynthesis.getVoices();
  const match=voices.find(v=>v.lang.startsWith(utt.lang.split('-')[0]));
  if(match)utt.voice=match;
  voiceEnabled=true;mVoice.textContent='ON';mVoice.classList.add('on');
  window.speechSynthesis.speak(utt);
}

function speakDet(idx){
  const det=currentDetections[idx];if(!det)return;
  const d=det.distance;
  let dist='';
  if(d){
    let zone;
    if      (d.cm<50)  zone='very close, be careful';
    else if (d.cm<100) zone='close range';
    else if (d.cm<200) zone='near range';
    else if (d.cm<400) zone='medium range';
    else               zone='far away';
    dist=` It is ${d.cm} centimetres away — ${zone}.`;
  }
  speak(`${det.name} detected with ${Math.round(det.confidence*100)} percent confidence.${dist}`);
}
function speakAll(){
  const n=currentDetections.map(d=>d.name).join(', ');
  if(n)speak(`Detected: ${n}`);
}

// ── VOICE COMMANDS ────────────────────────────────────────────────────────────
function toggleVoice(){if(voiceListening)stopVoice();else startVoice();}

function startVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addBotMsg('Voice recognition needs Chrome or Edge.');return;}
  recognition=new SR();
  recognition.lang=LANG_CODES[currentLang]||'en-US';
  recognition.continuous=false;recognition.interimResults=false;
  recognition.onstart=()=>{
    voiceListening=true;voiceCmdBtn.classList.add('listening');
    setText('lblVoiceCmd',UI[currentLang].stopVoice);
    voiceTranscript.style.display='block';vtText.textContent='…';
    $('vsText').textContent='Listening…';
    document.querySelector('.vs-dot').classList.add('active');
  };
  recognition.onresult=e=>{
    const t=e.results[0][0].transcript;vtText.textContent=t;handleCmd(t.toLowerCase());
  };
  recognition.onerror=recognition.onend=stopVoice;
  recognition.start();
}
function stopVoice(){
  voiceListening=false;if(recognition)recognition.stop();
  voiceCmdBtn.classList.remove('listening');
  setText('lblVoiceCmd',UI[currentLang].startVoice);
  $('vsText').textContent='Ready';
  document.querySelector('.vs-dot').classList.remove('active');
}
function handleCmd(cmd){
  if(cmd.includes('hindi')||cmd.includes('हिंदी')){langSelect.value='hi';applyLang('hi');speak('भाषा हिंदी में बदली।');return;}
  if(cmd.includes('kannada')||cmd.includes('ಕನ್ನಡ')){langSelect.value='kn';applyLang('kn');speak('ಭಾಷೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿತು.');return;}
  if(cmd.includes('english')){langSelect.value='en';applyLang('en');speak('Language changed to English.');return;}

  const obj=currentDetections[0]?.name;

  if(cmd.includes('what is')||cmd.includes('describe')||cmd.includes('क्या है')||cmd.includes('ಏನು')){
    if(obj)askAbout(obj);else speak('No object detected yet.');return;
  }
  if(cmd.includes('distance')||cmd.includes('दूरी')||cmd.includes('ದೂರ')){
    const d=currentDetections[0]?.distance;
    if(d)speak(`The ${obj} is ${d.cm} centimetres away.`);else speak('Distance not available.');return;
  }
  if(cmd.includes('read text')||cmd.includes('ocr')||cmd.includes('पाठ')||cmd.includes('ಪಠ್ಯ')){
    setUploadMode('ocr');speak('Please upload an image with text.');return;
  }
  if(cmd.includes('full info')||cmd.includes('पूरी जानकारी')||cmd.includes('ಪೂರ್ಣ')){
    if(obj)showFullInfo(obj);return;
  }
  if(cmd.includes('capture')||cmd.includes('snap')||cmd.includes('photo')){captureAndAnalyse();return;}

  chatInput.value=cmd;sendChat();
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
async function sendChat(){
  const msg=chatInput.value.trim();
  if(!msg||isProcessing)return;
  addUserMsg(msg);chatInput.value='';showTyping();isProcessing=true;
  try{
    const res=await fetch(`${API}/api/chat`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,object_context:currentObjectContext,language:currentLang,conversation_history:conversationHistory.slice(-6)})
    });
    const data=await res.json();removeTyping();
    const reply=data.response||'No response.';
    addBotMsg(reply);if(voiceEnabled)speak(reply);
    conversationHistory.push({role:'user',content:msg},{role:'assistant',content:reply});
    if(conversationHistory.length>20)conversationHistory=conversationHistory.slice(-20);
  }catch{removeTyping();addBotMsg('Chat error. Is Flask running?');}
  isProcessing=false;
}
async function askAbout(name){currentObjectContext=name;chatInput.value=`What is a ${name}?`;sendChat();}

function addBotMsg(text){
  const d=document.createElement('div');d.className='msg-bot';
  d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble">${escHtml(text)}</div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function addUserMsg(text){
  const d=document.createElement('div');d.className='msg-user';
  d.innerHTML=`<div class="msg-bubble">${escHtml(text)}</div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function showTyping(){
  const d=document.createElement('div');d.id='typingDots';d.className='msg-bot';
  d.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble typing-dots"><span></span><span></span><span></span></div>`;
  chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function removeTyping(){const e=$('typingDots');if(e)e.remove();}
function clearChat(){chatMessages.innerHTML='';conversationHistory=[];window._lastChatObj=null;addBotMsg(UI[currentLang].welcomeMsg);}

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function loadHistory(){
  try{const res=await fetch(`${API}/api/history`);const data=await res.json();if(data.history)renderHistory(data.history);}catch{}
}
function renderHistory(items){
  mHistory.textContent=items.length;
  if(!items.length){historyList.innerHTML=`<div class="history-empty"><p>${UI[currentLang].noHistory}</p></div>`;return;}
  historyList.innerHTML=items.map(h=>{
    const dist=h.distance_cm?`${h.distance_cm}cm`:'—';
    return `<div class="history-item"><div class="hi-dot"></div><div class="hi-name">${(h.name||'').toUpperCase()}</div><div class="hi-dist">${dist}</div><div class="hi-conf">${h.confidence}%</div><div class="hi-time">${h.time||''}</div></div>`;
  }).join('');
}
async function clearHistory(){
  try{await fetch(`${API}/api/history/clear`,{method:'POST'});historyList.innerHTML=`<div class="history-empty"><p>${UI[currentLang].noHistory}</p></div>`;mHistory.textContent='0';}catch{}
}

function clearResults(){
  currentDetections=[];currentObjectContext=null;mDetections.textContent='0';
  resultsContainer.innerHTML=`<div class="empty-results"><div class="empty-icon-anim">🎯</div><p>${UI[currentLang].noObjects}</p><p class="empty-note">${UI[currentLang].startOrUpload}</p></div>`;
  $('speakAllBtn').disabled=true;
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme(){
  const h=document.documentElement;
  const n=h.getAttribute('data-theme')==='dark'?'light':'dark';
  h.setAttribute('data-theme',n);$('themeBtn').textContent=n==='dark'?'💡':'🌙';
  localStorage.setItem('svt',n);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
window._lastChatObj=null;

// ═══════════════════════════════════════════════════════════════════
//  NEW FEATURES: Auth, Gallery, Feedback, Color
// ═══════════════════════════════════════════════════════════════════

// ── Auth ──────────────────────────────────────────────────────────
let currentUser = null;
let lastSessionId = null;

(function initUser(){
  const saved = localStorage.getItem('sv_user');
  if(!saved){ window.location.href='/'; return; }
  try{
    currentUser = JSON.parse(saved);
    const $n=$('unName'), $u=$('unUID'), $a=$('unAvatar'), $nav=$('userNav');
    if($n) $n.textContent = currentUser.username || 'User';
    if($u) $u.textContent = currentUser.user_id  || '';
    if($a) $a.textContent = (currentUser.username||'U')[0].toUpperCase();
    if($nav) $nav.style.display='flex';
  }catch(e){ window.location.href='/'; }
})();

async function doLogout(){
  try{ await fetch(`${API}/api/auth/logout`,{method:'POST',credentials:'include'}); }catch(e){}
  localStorage.removeItem('sv_user');
  localStorage.removeItem('sv_token');
  window.location.href='/';
}

// Track session id from detection responses
const _origSendForDetection = sendForDetection;
// We patch it after to capture session_id
const _origRender = window._renderOrig;

// Override sendForDetection to capture session_id
async function sendForDetection(blob, source){
  if(isProcessing)return;
  isProcessing=true;
  setStatus(UI[currentLang].statusAnalysing,'ok');
  const fd=new FormData();
  fd.append('file',blob,'image.jpg');
  fd.append('language',currentLang);
  fd.append('source', source||'camera');
  // include auth token
  const token = localStorage.getItem('sv_token')||'';
  fd.append('token', token);
  try{
    const res=await fetch(`${API}/api/detect`,{method:'POST',body:fd,credentials:'include'});
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    currentDetections=data.objects||[];
    if(data.session_id) lastSessionId = data.session_id;
    renderDetections(currentDetections);
    mDetections.textContent=currentDetections.length;
    if(data.annotated_image){
      const img=new Image();
      img.onload=()=>{
        const ctx=videoCanvas.getContext('2d');
        videoCanvas.width=img.naturalWidth;videoCanvas.height=img.naturalHeight;
        ctx.drawImage(img,0,0);
      };
      img.src=`data:image/jpeg;base64,${data.annotated_image}`;
      if(source==='upload') previewImg.src=img.src;
    }
    if(currentDetections.length>0){
      const first=currentDetections[0];
      const d=first.distance;
      const col=first.color;
      currentObjectContext=first.name;
      chatInput.disabled=false;sendBtn.disabled=false;
      $('speakAllBtn').disabled=false;
      if(first.name!==window._lastChatObj){
        window._lastChatObj=first.name;
        const distTxt = d ? ` — ${d.cm} cm` : '';
        const colTxt  = col && col.name ? ` | Color: ${col.name}` : '';
        addBotMsg(`🔍 ${first.name.toUpperCase()}${distTxt}${colTxt} (${Math.round(first.confidence*100)}%)`);
        if(voiceEnabled){
          const colSpeak = col && col.name ? ` It appears to be ${col.name} in color.` : '';
          const distSpeak = d ? ` ${d.cm} centimetres away.` : '';
          speak(`${first.name}${distSpeak}${colSpeak}`);
        }
      }
    }
    checkObstacles(currentDetections);
    loadHistory();
    setStatus(UI[currentLang].statusReady,'ok');
  }catch(e){setStatus(UI[currentLang].statusError,'error');console.error(e);}
  isProcessing=false;
}

// ── Side panels (Gallery, My Feedback) ───────────────────────────
function showPanel(name){
  document.querySelectorAll('.side-panel').forEach(p=>p.classList.remove('open'));
  const p=document.getElementById(name+'Panel');
  if(p){
    p.classList.add('open');
    document.getElementById('panelOverlay').style.display='block';
    if(name==='gallery') loadGallery();
    if(name==='myfeedback') loadMyFeedback();
  }
}
function closePanel(){
  document.querySelectorAll('.side-panel').forEach(p=>p.classList.remove('open'));
  document.getElementById('panelOverlay').style.display='none';
}

// ── Gallery ───────────────────────────────────────────────────────
async function loadGallery(){
  const body = document.getElementById('galleryBody');
  body.innerHTML='<div class="sp-loading">Loading…</div>';
  const token = localStorage.getItem('sv_token')||'';
  try{
    const r = await fetch(`${API}/api/user/images?token=${token}`,{credentials:'include'});
    const d = await r.json();
    if(!d.images||!d.images.length){
      body.innerHTML='<div class="sp-empty">No captured images yet.<br>Start the camera to begin!</div>';
      return;
    }
    body.innerHTML = d.images.map(img=>`
      <div class="gallery-card" id="gc-${img.session_id}">
        <div class="gc-img-wrap">
          <img src="${img.image_url}" alt="Detection" loading="lazy"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22140%22%3E%3Crect fill=%22%230b1220%22 width=%22200%22 height=%22140%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%235f7a96%22 font-size=%2212%22 text-anchor=%22middle%22%3EImage not found%3C/text%3E%3C/svg%3E'"/>
          <div class="gc-badge">${img.total_objects || 0} objects</div>
        </div>
        <div class="gc-info">
          <div class="gc-objects">${img.objects_detected||'—'}</div>
          ${img.colors_found?`<div class="gc-colors">🎨 ${img.colors_found}</div>`:''}
          <div class="gc-meta">📅 ${img.captured_at} · ${img.source}</div>
          ${img.notes?`<div class="gc-note">${img.notes}</div>`:''}
        </div>
        <div class="gc-actions">
          <button class="gc-btn" onclick="editNote(${img.session_id})">✏️ Note</button>
          <button class="gc-btn gc-del" onclick="deleteImage(${img.session_id})">🗑️ Delete</button>
        </div>
      </div>`).join('');
  }catch(e){
    body.innerHTML='<div class="sp-empty">Error loading images. Is Flask running?</div>';
  }
}

async function deleteImage(sessionId){
  if(!confirm('Delete this captured image?')) return;
  const token = localStorage.getItem('sv_token')||'';
  try{
    await fetch(`${API}/api/user/images/${sessionId}?token=${token}`,
                {method:'DELETE',credentials:'include'});
    const card = document.getElementById(`gc-${sessionId}`);
    if(card){ card.style.opacity='0'; setTimeout(()=>card.remove(),300); }
  }catch(e){ alert('Error deleting image.'); }
}

async function editNote(sessionId){
  const note = prompt('Add a note for this detection:','');
  if(note===null) return;
  const token = localStorage.getItem('sv_token')||'';
  await fetch(`${API}/api/user/images/${sessionId}/notes?token=${token}`,{
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({notes:note}), credentials:'include'
  });
  loadGallery();
}

// ── My Feedback list ──────────────────────────────────────────────
async function loadMyFeedback(){
  const body = document.getElementById('myfeedbackBody');
  body.innerHTML='<div class="sp-loading">Loading…</div>';
  const token = localStorage.getItem('sv_token')||'';
  try{
    const r = await fetch(`${API}/api/feedback/list?token=${token}`,{credentials:'include'});
    const d = await r.json();
    if(!d.feedback||!d.feedback.length){
      body.innerHTML='<div class="sp-empty">No corrections submitted yet.<br>Use the 🔧 Wrong? button when AI makes a mistake!</div>';
      return;
    }
    const statusColors = {pending:'#f5a623',reviewed:'#00d4ff',trained:'#00ff9d'};
    body.innerHTML = d.feedback.map(f=>`
      <div class="fb-card">
        <div class="fb-card-header">
          <span class="fb-type">${f.feedback_type.replace('_',' ')}</span>
          <span class="fb-status" style="color:${statusColors[f.status]||'#888'}">${f.status}</span>
        </div>
        <div class="fb-row"><span class="fb-label-sm">❌ Wrong:</span><span class="fb-text">${f.wrong_answer}</span></div>
        <div class="fb-row"><span class="fb-label-sm">✅ Correct:</span><span class="fb-text">${f.correct_answer}</span></div>
        <div class="fb-meta">${f.object_name?`Object: ${f.object_name} · `:''} ${f.created_at}</div>
      </div>`).join('');
  }catch(e){
    body.innerHTML='<div class="sp-empty">Error loading feedback.</div>';
  }
}

// ── Feedback modal ────────────────────────────────────────────────
let feedbackObjName = '';
let feedbackIdx = -1;

function openFeedback(objName, idx){
  feedbackObjName = objName;
  feedbackIdx     = idx;
  const det = currentDetections[idx];
  // Pre-fill wrong answer with what AI currently says
  let wrongDefault = `Detected: ${objName}`;
  if(det){
    if(det.distance) wrongDefault += `, Distance: ${det.distance.cm} cm`;
    if(det.color && det.color.name) wrongDefault += `, Color: ${det.color.name}`;
  }
  document.getElementById('fbWrong').value   = wrongDefault;
  document.getElementById('fbCorrect').value = '';
  document.getElementById('fbMsg').style.display = 'none';
  document.getElementById('feedbackModal').style.display='flex';
}
window.openFeedback = openFeedback;

function closeFeedback(){
  document.getElementById('feedbackModal').style.display='none';
}
window.closeFeedback = closeFeedback;

async function submitFeedback(){
  const wrong   = document.getElementById('fbWrong').value.trim();
  const correct = document.getElementById('fbCorrect').value.trim();
  const fbType  = document.getElementById('fbType').value;
  if(!wrong||!correct){ alert('Please fill in both fields.'); return; }

  const token = localStorage.getItem('sv_token')||'';
  try{
    const r = await fetch(`${API}/api/feedback`,{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        wrong_answer:  wrong,
        correct_answer:correct,
        feedback_type: fbType,
        object_name:   feedbackObjName,
        session_id:    lastSessionId,
        token,
      })
    });
    const d = await r.json();
    const msg = document.getElementById('fbMsg');
    msg.textContent = d.ok ? '✅ Thank you! Your correction has been saved.' : (d.error||'Error submitting');
    msg.style.color = d.ok ? '#00ff9d' : '#ff7a99';
    msg.style.display='block';
    if(d.ok) setTimeout(closeFeedback, 2000);
  }catch(e){ alert('Error. Is Flask running?'); }
}
window.submitFeedback = submitFeedback;

// Also expose panel functions globally
window.showPanel  = showPanel;
window.closePanel = closePanel;
window.doLogout   = doLogout;
window.deleteImage= deleteImage;
window.editNote   = editNote;
