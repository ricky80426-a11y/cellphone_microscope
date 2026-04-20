// ==========================================
// 嚴謹的物理光學引擎 (修正版)
// ==========================================

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

// 使用 DOMContentLoaded 確保 HTML 元素都加載完了才執行 JS
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    // 1. 初始化圖標
    try { lucide.createIcons(); } catch(e) { console.error("Lucide failed"); }

    // 2. 綁定啟動按鈕
    const btnYes = document.getElementById('btn-choice-yes');
    const btnNo = document.getElementById('btn-choice-no');

    if(btnYes) {
        btnYes.onclick = () => {
            ptToMm = DEFAULT_PT_TO_MM; 
            kBase = DEFAULT_K_BASE;
            document.getElementById('startup-modal').style.display = 'none';
            saveSettings(); 
            startApp();
        };
    }

    if(btnNo) {
        btnNo.onclick = () => {
            document.getElementById('startup-modal').style.display = 'none';
            startApp().then(() => setMode('screen_calibrating'));
        };
    }
    
    // 載入快取
    const savedData = localStorage.getItem('microscope-v20-core');
    if (savedData) {
        try {
            const s = JSON.parse(savedData);
            if (s.kBase) kBase = s.kBase;
            if (s.ptToMm) ptToMm = s.ptToMm;
        } catch (e) {}
    }
}

async function startApp() {
    await startCamera(); 
    bindEvents(); 
    updateContainerSize();
    window.addEventListener('resize', updateContainerSize); 
    updateZoomUI(); 
    updateScaleBar();
}

async function startCamera() {
    const errDiv = document.getElementById('camera-error');
    const errMsg = document.getElementById('camera-error-msg');
    
    const constraints = [
        { video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1440 } } },
        { video: { facingMode: 'environment' } },
        { video: true }
    ];

    for (let config of constraints) {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia(config);
            if (mediaStream) {
                document.getElementById('main-video').srcObject = mediaStream;
                document.getElementById('mag-video').srcObject = mediaStream;
                errDiv.classList.add('hidden');
                return;
            }
        } catch (e) { console.warn("Trying next camera config..."); }
    }
    
    errDiv.classList.remove('hidden');
    errMsg.textContent = "無法取得相機權限，請確認網址為 HTTPS 並允許開啟相機。";
}

function bindEvents() {
    // --- 縮放功能 (使用 addEventListener 避免覆蓋) ---
    const handleZoom = (d) => { 
        setZoom(digitalZoom + d); 
        if(!zoomInterval) zoomInterval = setInterval(() => setZoom(digitalZoom + d), 80); 
    };
    const stopZoom = () => { 
        clearInterval(zoomInterval); 
        zoomInterval = null; 
    };

    const zIn = document.getElementById('btn-zoom-in');
    const zOut = document.getElementById('btn-zoom-out');

    // 支援觸控與滑鼠
    const addZoomEvents = (el, delta) => {
        el.addEventListener('touchstart', (e) => { e.preventDefault(); handleZoom(delta); });
        el.addEventListener('mousedown', (e) => { handleZoom(delta); });
    };
    addZoomEvents(zIn, 0.1);
    addZoomEvents(zOut, -0.1);

    // 全域放開事件
    window.addEventListener('mouseup', stopZoom);
    window.addEventListener('touchend', stopZoom);

    // --- 亮度控制 ---
    document.getElementById('brightness-slider').oninput = (e) => {
        brightness = e.target.value; 
        document.getElementById('brightness-label').textContent = `${brightness}%`;
        const filter = `brightness(${brightness}%)`;
        document.getElementById('video-wrapper').style.filter = filter;
        document.getElementById('mag-video').style.filter = filter;
    };

    // --- 模式切換 ---
    document.getElementById('btn-start-calib').onclick = () => setMode('calibrating');
    document.getElementById('btn-start-measure').onclick = () => setMode('measuring');
    document.getElementById('btn-cal-cancel').onclick = () => setMode('idle');
    document.getElementById('btn-scr-cancel').onclick = () => setMode('idle');
    document.getElementById('btn-meas-close').onclick = () => setMode('idle');
    document.getElementById('btn-shutter').onclick = takeSnapshot;
    document.getElementById('btn-close-preview').onclick = () => document.getElementById('preview-modal').classList.add('hidden');

    // --- 校正儲存 ---
    document.getElementById('btn-cal-save').onclick = () => {
        const val = parseFloat(document.getElementById('calib-opt-input').value);
        const unit = document.getElementById('calib-opt-unit').value;
        if (isNaN(val) || val <= 0) return;
        const targetUm = (unit === 'um') ? val : val * 1000;
        const distPt = Math.hypot(calibPoints.p1.x - calibPoints.p2.x, calibPoints.p1.y - calibPoints.p2.y);
        kBase = (distPt / digitalZoom) / targetUm;
        saveSettings(); setMode('idle');
    };

    document.getElementById('btn-scr-save').onclick = () => {
        const valMm = parseFloat(document.getElementById('calib-scr-input').value);
        if (isNaN(valMm) || valMm <= 0) return;
        ptToMm = valMm / SCREEN_LINE_PT; 
        saveSettings(); setMode('idle');
    };

    // --- 拖點功能 ---
    const startDrag = (pId, e) => {
        e.preventDefault();
        activePoint = pId;
        document.getElementById('loupe').style.display = 'block';
    };

    const dragPoints = [
        {id: 'calib-point-1', pid: 'c1'}, {id: 'calib-point-2', pid: 'c2'},
        {id: 'measure-point-1', pid: 'm1'}, {id: 'measure-point-2', pid: 'm2'}
    ];

    dragPoints.forEach(p => {
        const el = document.getElementById(p.id);
        el.addEventListener('touchstart', (e) => startDrag(p.pid, e));
        el.addEventListener('mousedown', (e) => startDrag(p.pid, e));
    });

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, {passive: false});
    window.addEventListener('mouseup', () => { activePoint = null; document.getElementById('loupe').style.display = 'none'; });
    window.addEventListener('touchend', () => { activePoint = null; document.getElementById('loupe').style.display = 'none'; });
}

function handleMove(e) {
    if (!activePoint) return;
    const touch = e.touches ? e.touches[0] : e;
    const nx = Math.max(0, Math.min(touch.clientX, containerSize.w));
    const ny = Math.max(0, Math.min(touch.clientY, containerSize.h));

    if (activePoint === 'c1') calibPoints.p1 = {x:nx, y:ny};
    if (activePoint === 'c2') calibPoints.p2 = {x:nx, y:ny};
    if (activePoint === 'm1') measurePoints.p1 = {x:nx, y:ny};
    if (activePoint === 'm2') measurePoints.p2 = {x:nx, y:ny};

    if (currentMode === 'calibrating') updateCalibPointsUI();
    if (currentMode === 'measuring') updateMeasurePointsUI();
    updateLoupe();
}

// ...其餘更新 UI、截圖、縮放等函式保持不變，但建議將所有「.onclick」改為「.addEventListener」比較穩健...
