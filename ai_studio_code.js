/**
 * 顯微鏡系統核心邏輯
 * 包含：物理尺寸校正、數位縮放、測量算法與影像擷取
 */

const TARGET_PT = 51.95;
const TARGET_MM = 10;
const DEFAULT_PT_TO_MM = TARGET_MM / TARGET_PT; 
const DEFAULT_K_BASE = TARGET_PT / (TARGET_MM * 1000); 

let digitalZoom = 1;
let brightness = 100;
let ptToMm = DEFAULT_PT_TO_MM; 
let kBase = DEFAULT_K_BASE; 
const SCREEN_LINE_PT = 50 / DEFAULT_PT_TO_MM; 

let currentMode = 'idle', activePoint = null;
const calibPoints = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
const measurePoints = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
let containerSize = { w: 0, h: 0 }, mediaStream = null, zoomInterval = null;

// 初始化 Lucide 圖標
lucide.createIcons();

// --- 核心數學公式 ---
function getRealLengthUm(points) {
  return points ? points / (kBase * digitalZoom) : 0;
}

function getScaleBarPt(targetUm) {
  return targetUm * (kBase * digitalZoom);
}

// --- 初始化與事件綁定 ---
function init() {
  const choiceYes = document.getElementById('btn-choice-yes');
  const choiceNo = document.getElementById('btn-choice-no');

  choiceYes.onclick = () => {
    ptToMm = DEFAULT_PT_TO_MM; 
    kBase = DEFAULT_K_BASE;
    document.getElementById('startup-modal').style.display = 'none';
    saveSettings(); startApp();
  };

  choiceNo.onclick = () => {
    document.getElementById('startup-modal').style.display = 'none';
    setMode('screen_calibrating'); startApp();
  };
  
  // 讀取快取設定
  const savedData = localStorage.getItem('microscope-v20-core');
  if (savedData) {
    try {
      const s = JSON.parse(savedData);
      if (s.kBase) kBase = s.kBase;
      if (s.ptToMm) ptToMm = s.ptToMm;
    } catch (e) { console.error("Cache load failed", e); }
  }
}

// 啟動 App
async function startApp() {
  await startCamera(); 
  bindEvents(); 
  updateContainerSize();
  window.addEventListener('resize', updateContainerSize); 
  updateZoomUI(); 
  updateScaleBar();
}

// 啟動相機服務 (包含 Fallback 機制)
async function startCamera() {
  const errDiv = document.getElementById('camera-error');
  const errMsg = document.getElementById('camera-error-msg');
  
  const constraints = [
    { video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1440 } } },
    { video: { facingMode: 'environment' } },
    { video: true }
  ];

  for (let constraint of constraints) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraint);
      if (mediaStream) {
        document.getElementById('main-video').srcObject = mediaStream;
        document.getElementById('mag-video').srcObject = mediaStream;
        return;
      }
    } catch (e) {
      console.warn("Camera constraint failed, trying next...", e);
    }
  }

  errDiv.classList.remove('hidden');
  errMsg.textContent = "無法存取您的相機，請檢查瀏覽器授權。";
}

// 此處後續應包含 bindEvents, updateScaleBar, takeSnapshot 等其餘邏輯函數 (與原代碼 JS 內容一致)
// ... (保留原 script 內其餘所有函數)

init();