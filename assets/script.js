const S = {
    audioFile: null, coverImg: null, bgImg: null,
    coverScale: 1.0, coverYOff: 0,
    title: '', artist: '', font: 'Syne',
    titleSize: 46, titleWeight: '800', titleY: 26,
    style: 'radialBars',
    background: 'blurred',
    bgColor: '#0a0a1e',
    gc1: '#0d0221', gc2: '#1a0533', gc3: '#0a1929', gradAngle: 135,
    blurOverlay: .45, blurAmount: 40, blurMode: 'cover', bgY: 0.5,
    acc: '#a855f7',
    glow: true, dynCol: true, showTxt: true,
    res: '1080p', fps: 30,
    exporting: false,
    ambParts: false,
    ambShapes: { circ: true, star: false, heart: false },
    ambDyn: true,
    ambCol: '#ffffff',
    ambCols: { circ: '#ffffff', star: '#f59e0b', heart: '#ef4444' },
    ambOpacity: 1.0,
    ambDir: 'up'
};

const globalParts = [];

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

const RES = {
    '720p': { w: 1280, h: 720 },
    '1080p': { w: 1920, h: 1080 },
    '4k': { w: 3840, h: 2160 },
};

const audioEl = document.getElementById('audioEl');
let actx = null, analyser = null, freqD = null, timeD = null;

function initAudio() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = actx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = .8;
    const src = actx.createMediaElementSource(audioEl);
    src.connect(analyser);
    analyser.connect(actx.destination);
    freqD = new Uint8Array(analyser.frequencyBinCount);
    timeD = new Uint8Array(analyser.fftSize);
}

function getFreq() {
    if (analyser) { analyser.getByteFrequencyData(freqD); analyser.getByteTimeDomainData(timeD); }
}

const pc = document.getElementById('previewCanvas');
const pctx = pc.getContext('2d');
const ec = document.getElementById('exportCanvas');
const ectx = ec.getContext('2d');

let bgCache = null;

function invalidateBgCache() { bgCache = null; }

function getBlurredBg(w, h) {
    const img = S.bgImg || S.coverImg;
    if (!img) return null;
    if (bgCache && bgCache.forImg === img && bgCache.forW === w && bgCache.forH === h && bgCache.forMode === S.blurMode && bgCache.forY === S.bgY) {
        return bgCache.canvas;
    }
    const oc = new OffscreenCanvas(w, h);
    const oc2d = oc.getContext('2d');
    oc2d.filter = `blur(${S.blurAmount}px) saturate(1.6) brightness(0.9)`;
    
    let iw, ih, ix, iy;
    if (S.blurMode === 'fit') {
        const sc = Math.min(w / img.width, h / img.height);
        iw = img.width * sc; ih = img.height * sc;
        ix = (w - iw) / 2; iy = (h - ih) / 2;
    } else if (S.blurMode === 'stretch') {
        iw = w; ih = h;
        ix = 0; iy = 0;
    } else { // cover
        const sc = Math.max(w / img.width, h / img.height); 
        iw = img.width * sc; ih = img.height * sc;
        ix = (w - iw) / 2;
        iy = (h - ih) * S.bgY;
    }
    
    oc2d.drawImage(img, ix, iy, iw, ih);
    oc2d.filter = 'none';
    oc2d.fillStyle = `rgba(5,5,18,${S.blurOverlay})`;
    oc2d.fillRect(0, 0, w, h);
    bgCache = { canvas: oc, forImg: img, forW: w, forH: h, forMode: S.blurMode, forY: S.bgY };
    return oc;
}

function resizePreview() {
    const cont = document.getElementById('ccont');
    const cw = cont.clientWidth - 40, ch = cont.clientHeight - 40;
    const aspect = 16 / 9;
    let w = cw, h = w / aspect;
    if (h > ch) { h = ch; w = h * aspect; }
    pc.width = Math.round(w);
    pc.height = Math.round(h);
}
window.addEventListener('resize', resizePreview);
resizePreview();

const NUM_BARS = 64;
const bH = new Float32Array(NUM_BARS);
const bPk = new Float32Array(NUM_BARS);
const specHist = [];
const gridHist = [];
const parts = [];
let helixOff = 0;
const beatDet = { prev: 0, thresh: 140 };

function clearStyleState() {
    specHist.length = 0; gridHist.length = 0; parts.length = 0;
    bH.fill(0); bPk.fill(0); helixOff = 0;
}

function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

function glow(c, col, sz, sc = 1) {
    if (!S.glow) return;
    c.shadowColor = col; c.shadowBlur = sz * sc;
}
function noGlow(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; }

function hueColor(i, total, l = 65) {
    return S.dynCol ? `hsl(${(i / total) * 360 | 0},80%,${l}%)` : S.acc;
}

function getCover(w, h) {
    const sz = Math.min(w, h) * .37 * S.coverScale;
    const cx = w / 2, cy = (h / 2 - h * .035) + (h * S.coverYOff);
    return { cx, cy, sz, x: cx - sz / 2, y: cy - sz / 2, r: sz / 2 };
}

function drawBg(c, w, h) {
    if (S.background === 'blurred' && (S.bgImg || S.coverImg)) {
        const cached = getBlurredBg(w, h);
        if (cached) c.drawImage(cached, 0, 0);
        else {
            c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
            c.fillRect(0, 0, w, h);
        }
    } else if (S.background === 'gradient') {
        const a = (S.gradAngle * Math.PI / 180);
        const x1 = w / 2 - Math.cos(a) * w, y1 = h / 2 - Math.sin(a) * h;
        const x2 = w / 2 + Math.cos(a) * w, y2 = h / 2 + Math.sin(a) * h;
        const g = c.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, S.gc1); g.addColorStop(.5, S.gc2); g.addColorStop(1, S.gc3);
        c.fillStyle = g; c.fillRect(0, 0, w, h);
    } else {
        c.fillStyle = S.bgColor;
        c.fillRect(0, 0, w, h);
    }
}

const CIRC_STYLES = new Set(['radialBars', 'morphBlob', 'kaleidoscope', 'particles']);

function drawCover(c, w, h) {
    if (!S.coverImg) return;
    const { cx, cy, sz, x, y } = getCover(w, h);
    const sc = w / 1920;
    const r = Math.max(8, 14 * sc);
    const isCirc = CIRC_STYLES.has(S.style);

    c.save();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    c.shadowColor = isLight ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.85)';
    c.shadowBlur = isLight ? 30 * sc : 70 * sc;
    c.shadowOffsetY = isLight ? 5 * sc : 12 * sc;
    c.beginPath();
    if (isCirc) c.arc(cx, cy, sz / 2, 0, Math.PI * 2);
    else rrect(c, x, y, sz, sz, r);
    c.fillStyle = '#000';
    c.fill();
    c.restore();

    c.save();
    c.beginPath();
    if (isCirc) c.arc(cx, cy, sz / 2, 0, Math.PI * 2);
    else rrect(c, x, y, sz, sz, r);
    c.clip();

    c.drawImage(S.coverImg, x, y, sz, sz);

    const shine = c.createLinearGradient(x, y, x, y + sz);
    shine.addColorStop(0, 'rgba(255,255,255,.1)');
    shine.addColorStop(.45, 'rgba(255,255,255,0)');
    c.fillStyle = shine; c.fillRect(x, y, sz, sz);
    c.restore();

    c.save();
    c.beginPath();
    if (isCirc) c.arc(cx, cy, sz / 2, 0, Math.PI * 2);
    else rrect(c, x, y, sz, sz, r);
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.5;
    c.stroke(); c.restore();
}

function drawText(c, w, h) {
    if (!S.showTxt) return;
    if (!S.title && !S.artist) return;
    const { cy, sz } = getCover(w, h);
    const sc = w / 1920;
    const bot = cy + sz / 2;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'top';

    if (S.title) {
        const fs = S.titleSize * sc;
        c.font = `${S.titleWeight} ${fs}px "${S.font}", sans-serif`;
        if (S.glow) { c.shadowColor = S.acc; c.shadowBlur = 22 * sc; }
        c.fillStyle = '#fff';
        c.fillText(S.title, w / 2, bot + S.titleY * sc);
        c.shadowBlur = 0;
    }
    if (S.artist) {
        const fs = 26 * sc;
        c.font = `300 ${fs}px "DM Mono",monospace`;
        c.fillStyle = 'rgba(190,200,255,.65)';
        c.fillText(S.artist, w / 2, bot + 84 * sc);
    }
    c.restore();
}

function drawRadialBars(c, w, h) {
    const { cx, cy, r: coverR } = getCover(w, h);
    const sc = w / 1920;
    const inner = coverR + 18 * sc, maxLen = 150 * sc, bars = 200;
    c.save();
    for (let i = 0; i < bars; i++) {
        const ang = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const fi = Math.floor((i / bars) * freqD.length * .65);
        const v = freqD[fi] / 255;
        const len = v * maxLen + 3 * sc;
        const col = hueColor(i, bars);
        glow(c, col, 14, sc);
        c.beginPath();
        c.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        c.lineTo(cx + Math.cos(ang) * (inner + len), cy + Math.sin(ang) * (inner + len));
        c.strokeStyle = col; c.lineWidth = 3 * sc; c.lineCap = 'round';
        c.stroke();
    }
    noGlow(c); c.restore();
}

function drawMorphBlob(c, w, h) {
    const { cx, cy, r: coverR } = getCover(w, h);
    const sc = w / 1920;
    const base = coverR + 28 * sc, maxEx = 110 * sc, pts = 256;

    c.save();
    c.beginPath();
    for (let i = 0; i <= pts; i++) {
        const ang = (i / pts) * Math.PI * 2;
        const fi = Math.floor((i / pts) * (freqD.length * .5));
        const v = freqD[fi] / 255;
        const rad = base + v * maxEx;
        if (i === 0) c.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        else c.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    c.closePath();
    glow(c, S.acc, 28, sc);
    c.strokeStyle = S.acc; c.lineWidth = 3 * sc; c.stroke();

    const radG = c.createRadialGradient(cx, cy, base * .4, cx, cy, base + maxEx);
    radG.addColorStop(0, S.acc + '22'); radG.addColorStop(1, S.acc + '00');
    c.fillStyle = radG; c.fill();

    c.beginPath();
    for (let i = 0; i <= pts; i++) {
        const ang = (i / pts) * Math.PI * 2 + .5;
        const fi = Math.floor((i / pts) * (freqD.length * .3) + freqD.length * .1);
        const v = freqD[fi] / 255;
        const rad = base - 16 * sc + v * maxEx * .55;
        if (i === 0) c.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        else c.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    c.closePath();
    c.strokeStyle = '#06b6d4aa'; c.lineWidth = 2 * sc; c.stroke();

    noGlow(c); c.restore();
}

function drawMirrorBars(c, w, h) {
    const sc = w / 1920;
    const bars = 120, maxH = h * .34;
    const sw = w * .88 / bars, sx = w * .06, cy = h * .52 + (h * S.coverYOff);
    c.save();
    for (let i = 0; i < bars; i++) {
        const fi = Math.floor((i / bars) * freqD.length * .72);
        const v = freqD[fi] / 255;
        const bh = v * maxH;
        const x = sx + i * sw;
        const col = hueColor(i, bars);
        glow(c, col, 10, sc);
        c.fillStyle = col;
        c.fillRect(x, cy - bh, sw * .72, bh);
        c.globalAlpha = .4;
        c.fillRect(x, cy, sw * .72, bh);
        c.globalAlpha = 1;
    }
    noGlow(c); c.restore();
}

function drawSideBars(c, w, h) {
    const { cx, cy, sz } = getCover(w, h);
    const sc = w / 1920;
    const cvL = cx - sz / 2, cvR = cx + sz / 2, cvT = cy - sz / 2;
    const sidePad = 18 * sc, panelH = sz, nb = 32;
    const barH = (panelH / nb) * 0.72, barGap = panelH / nb;
    const maxBarW = (cvL - sidePad) * 0.88, maxBarWR = (w - cvR - sidePad) * 0.88;
    const minBarW = 4 * sc, cornerR = Math.min(barH / 2, 3 * sc);

    c.save(); noGlow(c);
    for (let i = 0; i < nb; i++) {
        const fi = Math.floor(((nb - 1 - i) / nb) * freqD.length * 0.60);
        const v = freqD[fi] / 255;
        const barY = cvT + i * barGap + (barGap - barH) / 2;
        let col, colFade;
        if (S.dynCol) {
            const hue = (i / nb) * 360 | 0;
            col = `hsl(${hue},80%,65%)`; colFade = `hsla(${hue},80%,65%,0.12)`;
        } else {
            col = S.acc; colFade = S.acc + '1f';
        }
        const bwL = Math.max(minBarW, v * maxBarW);
        const xL = cvL - sidePad - bwL;
        if (S.glow) { c.shadowColor = col; c.shadowBlur = 8 * sc; }
        const gL = c.createLinearGradient(xL, 0, xL + bwL, 0);
        gL.addColorStop(0, colFade); gL.addColorStop(1, col);
        c.fillStyle = gL; rrect(c, xL, barY, bwL, barH, cornerR); c.fill();

        const bwR = Math.max(minBarW, v * maxBarWR);
        const xR = cvR + sidePad;
        const gR = c.createLinearGradient(xR, 0, xR + bwR, 0);
        gR.addColorStop(0, col); gR.addColorStop(1, colFade);
        c.fillStyle = gR; rrect(c, xR, barY, bwR, barH, cornerR); c.fill();
    }
    noGlow(c); c.restore();
}

function spawnParts(cx, cy, intensity) {
    const n = Math.floor(intensity / 8) | 0;
    for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 4 * (intensity / 255);
        parts.push({
            x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            life: 1, dec: .013 + Math.random() * .018,
            sz: 1.5 + Math.random() * 3.5, hue: Math.random() * 70 + 260
        });
    }
}

function drawParticles(c, w, h) {
    const { cx, cy, r: coverR } = getCover(w, h);
    const sc = w / 1920;
    let bass = 0;
    for (let i = 0; i < 12; i++) bass += freqD[i];
    bass /= 12;
    if (bass > beatDet.thresh && bass > beatDet.prev + 25) spawnParts(cx, cy, bass);
    beatDet.prev = bass;

    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy *= .97; p.life -= p.dec;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        c.save();
        glow(c, `hsl(${p.hue},90%,70%)`, 7, sc);
        c.globalAlpha = p.life;
        c.beginPath(); c.arc(p.x, p.y, p.sz * sc, 0, Math.PI * 2);
        c.fillStyle = `hsl(${p.hue},90%,70%)`; c.fill();
        c.restore();
    }
    c.globalAlpha = 1;
    const avg = freqD.slice(0, 60).reduce((a, b) => a + b, 0) / 60 / 255;
    glow(c, S.acc, 25 * avg, sc);
    c.beginPath(); c.arc(cx, cy, coverR + 14 * sc + avg * 32 * sc, 0, Math.PI * 2);
    c.strokeStyle = S.acc + '90'; c.lineWidth = 3 * sc; c.stroke();
    noGlow(c);
}

function drawNeonArc(c, w, h) {
    const sc = w / 1920;
    const cy = h * .64 + (h * S.coverYOff), amp = h * .22, pts = timeD.length, step = 4;
    c.save();
    const passes = S.glow ? 3 : 1;
    const alphas = [.08, .25, 1], widths = [14, 6, 2];
    for (let p = 0; p < passes; p++) {
        c.beginPath();
        for (let i = 0; i < pts; i += step) {
            const x = (i / pts) * w, v = (timeD[i] - 128) / 128;
            const fv = freqD[Math.floor((i / pts) * freqD.length * .5)] / 255;
            const y = cy + v * amp * (.5 + fv * .5);
            i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        const al = S.glow ? alphas[p] : 1, lw = S.glow ? widths[p] : 2;
        c.strokeStyle = S.acc + Math.round(al * 255).toString(16).padStart(2, '0');
        c.lineWidth = lw * sc; c.lineCap = 'round'; c.lineJoin = 'round';
        if (S.glow) { c.shadowColor = S.acc; c.shadowBlur = 18 * sc; }
        c.stroke();
    }
    c.beginPath();
    for (let i = 0; i < pts; i += step) {
        const x = (i / pts) * w, v = (timeD[i] - 128) / 128, y = cy - v * amp * .35;
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = '#06b6d450'; c.lineWidth = 1.5 * sc; c.shadowBlur = 0; c.stroke();
    noGlow(c); c.restore();
}

function drawKaleidoscope(c, w, h) {
    const { cx, cy, r: coverR } = getCover(w, h);
    const sc = w / 1920;
    const inner = coverR + 10 * sc, maxLen = 155 * sc, sym = 8, bps = 22;
    c.save();
    for (let s = 0; s < sym; s++) {
        const sAng = (s / sym) * Math.PI * 2;
        for (let i = 0; i < bps; i++) {
            const lAng = (i / bps) * (Math.PI * 2 / sym), ang = sAng + lAng - Math.PI / 2;
            const fi = Math.floor((i / bps) * freqD.length * .5), v = freqD[fi] / 255, len = v * maxLen + 4 * sc;
            const hue = S.dynCol ? (s / sym) * 360 + (i / bps) * 45 : 0;
            const col = S.dynCol ? `hsl(${hue | 0},80%,65%)` : S.acc;
            glow(c, col, 11, sc);
            c.beginPath();
            c.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
            c.lineTo(cx + Math.cos(ang) * (inner + len), cy + Math.sin(ang) * (inner + len));
            c.strokeStyle = col; c.lineWidth = 2.5 * sc; c.lineCap = 'round'; c.stroke();
        }
    }
    noGlow(c); c.restore();
}

function drawFloatingBlocks(c, w, h) {
    const sc = w / 1920;
    const maxH = h * .66, total = w * .88, sx = w * .06, baseY = h * .88 + (h * S.coverYOff);
    const bw = (total / NUM_BARS) * .72, bsp = total / NUM_BARS, pkH = 4 * sc;
    c.save();
    for (let i = 0; i < NUM_BARS; i++) {
        const fi = Math.floor((i / NUM_BARS) * freqD.length * .75);
        const target = (freqD[fi] / 255) * maxH;
        bH[i] = Math.max(bH[i] - 3.5 * sc, target, 0);
        if (target > bH[i]) bH[i] = target;
        if (bH[i] > bPk[i]) bPk[i] = bH[i];
        else bPk[i] = Math.max(bPk[i] - .7 * sc, 0);
        const x = sx + i * bsp;
        let col, colFade;
        if (S.dynCol) {
            const hue = (i / NUM_BARS) * 360 | 0;
            col = `hsl(${hue},80%,65%)`; colFade = `hsla(${hue},80%,65%,0.19)`;
        } else {
            col = S.acc; colFade = S.acc + '30';
        }
        const g = c.createLinearGradient(x, baseY - bH[i], x, baseY);
        g.addColorStop(0, col); g.addColorStop(1, colFade);
        glow(c, col, 7, sc);
        c.fillStyle = g; c.fillRect(x, baseY - bH[i], bw, bH[i]);
        if (bPk[i] > 5) {
            c.fillStyle = 'rgba(255,255,255,.85)';
            c.fillRect(x, baseY - bPk[i] - pkH, bw, pkH);
        }
    }
    noGlow(c); c.restore();
}

function drawSpectrogram(c, w, h) {
    specHist.push(new Uint8Array(freqD));
    if (specHist.length > 300) specHist.shift();
    const len = specHist.length, sw = w / 300, nf = Math.floor(freqD.length * .55);
    c.save();
    for (let t = 0; t < len; t++) {
        const frame = specHist[t], x = (t / 300) * w;
        for (let f = 0; f < nf; f++) {
            const v = frame[f] / 255, y = h - (f / nf) * h;
            let r, g, b;
            if (v < .25) { r = 0; g = 0; b = v * 4 * 255; }
            else if (v < .5) { const tt = (v - .25) * 4; r = tt * 168; g = 0; b = (1 - tt * .5) * 255; }
            else if (v < .75) { const tt = (v - .5) * 4; r = 168 + tt * 87; g = tt * 100; b = 128 - tt * 128; }
            else { const tt = (v - .75) * 4; r = 255; g = 100 + tt * 155; b = tt * 255; }
            c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
            c.fillRect(x, y - h / nf, Math.ceil(sw) + 1, Math.ceil(h / nf) + 1);
        }
    }
    const sx = (len / 300) * w;
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, h); c.stroke();
    c.restore();
}

function drawDNAHelix(c, w, h) {
    const sc = w / 1920;
    helixOff += .028;
    const pts = 120, hlx = w * .72, sx = w * .14, cy = h * .5 + (h * S.coverYOff), amp = h * .17;
    c.save();
    for (let i = 0; i < pts; i++) {
        const x = sx + (i / pts) * hlx, ang = (i / pts) * Math.PI * 4 + helixOff;
        const fi = Math.floor((i / pts) * freqD.length * .5), fv = freqD[fi] / 255;
        const a1 = cy + Math.sin(ang) * amp * (0.5 + fv * .5), a2 = cy + Math.sin(ang + Math.PI) * amp * (0.5 + fv * .5);
        c.strokeStyle = `rgba(255,255,255,${.15 + fv * .25})`;
        c.lineWidth = 1.5 * sc;
        c.beginPath(); c.moveTo(x, a1); c.lineTo(x, a2); c.stroke();
        const ds = 3.5 * sc * (0.6 + fv * .4);
        const h1 = S.dynCol ? `hsl(${(i / pts * 180 + 200) | 0},80%,65%)` : S.acc;
        const h2 = S.dynCol ? `hsl(${(i / pts * 180 + 20) | 0},80%,65%)` : '#06b6d4';
        glow(c, h1, 6, sc);
        c.fillStyle = h1; c.beginPath(); c.arc(x, a1, ds, 0, Math.PI * 2); c.fill();
        c.fillStyle = h2; c.beginPath(); c.arc(x, a2, ds, 0, Math.PI * 2); c.fill();
    }
    for (let st = 0; st < 2; st++) {
        const ph = st === 0 ? 0 : Math.PI;
        c.beginPath();
        for (let i = 0; i < pts; i++) {
            const x = sx + (i / pts) * hlx, ang = (i / pts) * Math.PI * 4 + helixOff + ph;
            const fi = Math.floor((i / pts) * freqD.length * .5), fv = freqD[fi] / 255;
            const y = cy + Math.sin(ang) * amp * (0.5 + fv * .5);
            i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        const col = st === 0 ? S.acc : '#06b6d4';
        glow(c, col, 14, sc);
        c.strokeStyle = col; c.lineWidth = 4 * sc; c.lineCap = 'round'; c.lineJoin = 'round';
        c.stroke();
    }
    noGlow(c); c.restore();
}

function draw3DGrid(c, w, h) {
    gridHist.unshift(new Uint8Array(freqD));
    if (gridHist.length > 50) gridHist.pop();
    const sc = w / 1920, rows = gridHist.length, cols = 48, hz = h * 0.45 + (h * S.coverYOff), maxBH = h * 0.28;
    c.save();
    const pts = [];
    for (let r = 0; r < rows; r++) {
        const rp = r / (rows - 1), py = hz + rp * rp * (h - hz), scaleX = 0.15 + rp * 0.85;
        const frame = gridHist[r];
        pts[r] = [];
        for (let col = 0; col < cols; col++) {
            const cp = (col / (cols - 1)) - 0.5, px = w/2 + cp * w * 1.6 * scaleX;
            const fi = Math.floor((Math.abs(cp) * 2) * frame.length * 0.5), v = (frame[fi] || 0) / 255;
            const hOffset = v * maxBH * scaleX * (1.2 - Math.abs(cp) * 1.5);
            pts[r].push({x: px, y: py - Math.max(0, hOffset)});
        }
    }
    for (let r = 0; r < rows; r++) {
        const rp = r / (rows - 1);
        c.beginPath();
        for (let col = 0; col < cols; col++) {
            const p = pts[r][col];
            if (col === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.strokeStyle = S.acc; c.globalAlpha = Math.pow(rp, 1.5) * 0.8;
        c.lineWidth = (1 + rp * 2) * sc; c.stroke();
    }
    for (let col = 0; col < cols; col++) {
        c.beginPath();
        for (let r = 0; r < rows; r++) {
            const p = pts[r][col];
            if (r === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.strokeStyle = S.acc; c.globalAlpha = 0.4; c.lineWidth = 1 * sc; c.stroke();
    }
    c.restore();
}

function drawAmbientParticles(c, w, h) {
    if (!S.ambParts) return;
    const sc = w / 1920, shapes = [];
    if (S.ambShapes.circ) shapes.push('circ');
    if (S.ambShapes.star) shapes.push('star');
    if (S.ambShapes.heart) shapes.push('heart');

    if (shapes.length > 0 && Math.random() < 0.12) {
        const hue = Math.random() * 360;
        let x, y, vx, vy;
        const d = S.ambDir, speed = (1 + Math.random() * 2) * sc, spread = (Math.random() - 0.5) * 1.5 * sc;
        if (d === 'up') { x = Math.random() * w; y = h + 50; vx = spread; vy = -speed; }
        else if (d === 'down') { x = Math.random() * w; y = -50; vx = spread; vy = speed; }
        else if (d === 'left') { x = w + 50; y = Math.random() * h; vx = -speed; vy = spread; }
        else if (d === 'right') { x = -50; y = Math.random() * h; vx = speed; vy = spread; }
        else {
            const side = Math.floor(Math.random() * 4);
            if (side === 0) { x = Math.random() * w; y = h + 50; vx = spread; vy = -speed; }
            else if (side === 1) { x = Math.random() * w; y = -50; vx = spread; vy = speed; }
            else if (side === 2) { x = w + 50; y = Math.random() * h; vx = -speed; vy = spread; }
            else { x = -50; y = Math.random() * h; vx = speed; vy = spread; }
        }
        globalParts.push({
            x, y, vx, vy, size: (4 + Math.random() * 10) * sc, rot: Math.random() * Math.PI * 2,
            rotV: (Math.random() - 0.5) * 0.05, hue, shape: shapes[Math.floor(Math.random() * shapes.length)],
            life: 1, decay: 0.001 + Math.random() * 0.002
        });
    }

    c.save();
    for (let i = globalParts.length - 1; i >= 0; i--) {
        const p = globalParts[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.life -= p.decay;
        if (p.life <= 0 || p.y < -100) { globalParts.splice(i, 1); continue; }
        const alpha = p.life * S.ambOpacity;
        let col;
        if (S.ambDyn) col = `hsla(${p.hue}, 80%, 70%, ${alpha})`;
        else col = hexToRgba(S.ambCols[p.shape] || '#ffffff', alpha);
        c.fillStyle = col; if (S.glow) { c.shadowColor = col; c.shadowBlur = 10 * sc; }
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.beginPath();
        if (p.shape === 'circ') c.arc(0, 0, p.size, 0, Math.PI * 2);
        else if (p.shape === 'star') {
            for (let j = 0; j < 5; j++) {
                c.lineTo(Math.cos((18 + j * 72) / 180 * Math.PI) * p.size, -Math.sin((18 + j * 72) / 180 * Math.PI) * p.size);
                c.lineTo(Math.cos((54 + j * 72) / 180 * Math.PI) * (p.size * 0.4), -Math.sin((54 + j * 72) / 180 * Math.PI) * (p.size * 0.4));
            }
        } else if (p.shape === 'heart') {
            const r = p.size; c.moveTo(0, r);
            c.bezierCurveTo(-r, r * 0.3, -r * 1.5, -r, 0, -r * 0.5);
            c.bezierCurveTo(r * 1.5, -r, r, r * 0.3, 0, r);
        }
        c.closePath(); c.fill(); c.restore();
    }
    c.restore();
}

const BEHIND_STYLES = new Set(['mirrorBars', 'neonArc', 'spectrogram', 'grid3d', 'floatingBlocks']);

function renderFrame(canvas, ctx, w, h) {
    drawBg(ctx, w, h);
    drawAmbientParticles(ctx, w, h);
    const s = S.style;
    if (BEHIND_STYLES.has(s)) { drawStyle(ctx, w, h, s); drawCover(ctx, w, h); }
    else { drawCover(ctx, w, h); drawStyle(ctx, w, h, s); }
    drawText(ctx, w, h);
}

function drawStyle(ctx, w, h, s) {
    if (!freqD) return;
    switch (s) {
        case 'radialBars': drawRadialBars(ctx, w, h); break;
        case 'morphBlob': drawMorphBlob(ctx, w, h); break;
        case 'mirrorBars': drawMirrorBars(ctx, w, h); break;
        case 'sideBars': drawSideBars(ctx, w, h); break;
        case 'particles': drawParticles(ctx, w, h); break;
        case 'neonArc': drawNeonArc(ctx, w, h); break;
        case 'kaleidoscope': drawKaleidoscope(ctx, w, h); break;
        case 'floatingBlocks': drawFloatingBlocks(ctx, w, h); break;
        case 'spectrogram': drawSpectrogram(ctx, w, h); break;
        case 'dnaHelix': drawDNAHelix(ctx, w, h); break;
        case 'grid3d': draw3DGrid(ctx, w, h); break;
    }
}

function loop() {
    requestAnimationFrame(loop);
    getFreq();
    renderFrame(pc, pctx, pc.width, pc.height);
    if (audioEl.duration) {
        const p = audioEl.currentTime / audioEl.duration;
        pfill.style.width = (p * 100) + '%';
        curT.textContent = fmtT(audioEl.currentTime);
        totT.textContent = fmtT(audioEl.duration);
    }
}

function fmtT(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

loop();

async function doExport() {
    if (!S.audioFile || S.exporting) return;
    S.exporting = true;
    const exov = document.getElementById('exov'), exSub = document.getElementById('exSub'), exPct = document.getElementById('exPct'), exFill = document.getElementById('exFill');
    exov.classList.add('vis');
    const { w, h } = RES[S.res];
    ec.width = w; ec.height = h; ec.style.display = 'block';
    function setProgress(pct, msg) {
        exFill.style.width = pct + '%'; exPct.textContent = pct + '%';
        if (msg) exSub.textContent = msg;
    }
    try {
        let useWebCodecs = false;
        if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
            const vConfig = { codec: 'avc1.42E034', width: w, height: h, bitrate: 5_000_000, framerate: S.fps, latencyMode: 'realtime' };
            const vSup = await VideoEncoder.isConfigSupported(vConfig);
            if (vSup.supported) useWebCodecs = true;
        }
        if (useWebCodecs) {
            try {
                await exportWebCodecs(w, h, setProgress);
            } catch (err) {
                console.error('WebCodecs failed, falling back:', err);
                await exportMediaRecorder(w, h, setProgress);
            }
        } else {
            await exportMediaRecorder(w, h, setProgress);
        }
    } catch (e) { console.error(e); exSub.textContent = 'Error: ' + e.message; await sleep(2500); }
    ec.style.display = 'none'; exov.classList.remove('vis'); S.exporting = false;
}

async function exportWebCodecs(w, h, setProgress) {
    const exSub = document.getElementById('exSub');
    try {
        setProgress(0, 'Loading MP4 encoder…');
        const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm');

        setProgress(2, 'Decoding audio for export…');
        const arrayBuf = await S.audioFile.arrayBuffer();
        const audioBuffer = await actx.decodeAudioData(arrayBuf);
        const dur = audioBuffer.duration;

        const target = new ArrayBufferTarget();

        const vBitrate = w >= 3840 ? 40_000_000 : w >= 1920 ? 10_000_000 : 5_000_000;
        const vConfig = { codec: 'avc1.42E034', width: w, height: h, bitrate: vBitrate, framerate: S.fps, latencyMode: 'realtime' };
        const vSup = await VideoEncoder.isConfigSupported(vConfig);
        if (!vSup.supported) throw new Error("Video codec not supported by WebCodecs");

        let aCodec = 'mp4a.40.2';
        let aMuxerCodec = 'aac';
        let aConfig = { codec: aCodec, sampleRate: audioBuffer.sampleRate, numberOfChannels: 2, bitrate: 192000 };
        let aSup = await AudioEncoder.isConfigSupported(aConfig);
        if (!aSup.supported) {
            aCodec = 'opus';
            aMuxerCodec = 'opus';
            aConfig.codec = aCodec;
            aSup = await AudioEncoder.isConfigSupported(aConfig);
            if (!aSup.supported) throw new Error("Audio codec not supported by WebCodecs");
        }

        const muxer = new Muxer({
            target,
            video: { codec: 'avc', width: w, height: h },
            audio: { codec: aMuxerCodec, sampleRate: audioBuffer.sampleRate, numberOfChannels: 2 },
            firstTimestampBehavior: 'offset', fastStart: 'in-memory'
        });

        let isFinished = false;
        const vEnc = new VideoEncoder({ 
            output: (ch, m) => { if (!isFinished) muxer.addVideoChunk(ch, m); }, 
            error: e => { console.error('VEnc:', e); isFinished = true; } 
        });
        vEnc.configure(vConfig);

        const aEnc = new AudioEncoder({ 
            output: (ch, m) => { if (!isFinished) muxer.addAudioChunk(ch, m); }, 
            error: e => { console.error('AEnc:', e); isFinished = true; } 
        });
        aEnc.configure(aConfig);

        const totalFrames = Math.floor(dur * S.fps);
        const fInt = 1e6 / S.fps;

        setProgress(5, 'Analyzing audio spectrum…');
        const samples = audioBuffer.getChannelData(0);
        const fftSize = 4096;
        const binCount = fftSize / 2;
        const freqFrames = [];
        const timeFrames = [];
        const blackman = new Float32Array(fftSize);
        const a0 = 0.42, a1 = 0.5, a2 = 0.08;
        for (let i = 0; i < fftSize; i++) {
            blackman[i] = a0 - a1 * Math.cos(2 * Math.PI * i / (fftSize - 1)) + a2 * Math.cos(4 * Math.PI * i / (fftSize - 1));
        }

        // Simple FFT implementation
        function performFFT(real, imag) {
            const n = real.length;
            for (let i = 1, j = 0; i < n; i++) {
                let bit = n >> 1;
                for (; j & bit; bit >>= 1) j ^= bit;
                j ^= bit;
                if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
            }
            for (let len = 2; len <= n; len <<= 1) {
                const ang = -2 * Math.PI / len;
                const wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
                for (let i = 0; i < n; i += len) {
                    let w_r = 1, w_i = 0;
                    for (let j = 0; j < len / 2; j++) {
                        const u_r = real[i + j], u_i = imag[i + j];
                        const v_r = real[i + j + len / 2] * w_r - imag[i + j + len / 2] * w_i;
                        const v_i = real[i + j + len / 2] * w_i + imag[i + j + len / 2] * w_r;
                        real[i + j] = u_r + v_r; imag[i + j] = u_i + v_i;
                        real[i + j + len / 2] = u_r - v_r; imag[i + j + len / 2] = u_i - v_i;
                        const next_w_r = w_r * wlen_r - w_i * wlen_i;
                        w_i = w_r * wlen_i + w_i * wlen_r; w_r = next_w_r;
                    }
                }
            }
        }

        let prevFreq = new Float32Array(binCount);
        const smoothing = 0.8;

        for (let fc = 0; fc < totalFrames; fc++) {
            if (fc % 100 === 0) setProgress(Math.round((fc / totalFrames) * 15) + 5, 'Analyzing spectrum…');
            const time = fc / S.fps;
            const startIdx = Math.floor(time * audioBuffer.sampleRate);
            const real = new Float32Array(fftSize);
            const imag = new Float32Array(fftSize);
            const td = new Uint8Array(fftSize);
            
            for (let i = 0; i < fftSize; i++) {
                const s = samples[startIdx + i] || 0;
                td[i] = Math.min(255, Math.max(0, (s + 1) * 128));
                real[i] = s * blackman[i];
            }
            performFFT(real, imag);
            
            const f = new Uint8Array(binCount);
            for (let i = 0; i < binCount; i++) {
                const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / fftSize;
                let db = 20 * Math.log10(mag + 1e-9);
                // Adjusting range to match common browser Analyser behavior
                let val = (db + 95) * (255 / 65);
                val = Math.max(0, Math.min(255, val));
                prevFreq[i] = prevFreq[i] * smoothing + val * (1 - smoothing);
                f[i] = prevFreq[i];
            }
            freqFrames[fc] = f;
            timeFrames[fc] = td;
        }

        setProgress(20, 'Encoding frames…');
        
        for (let fc = 0; fc < totalFrames; fc++) {
            if (!S.exporting || isFinished) break;
            
            freqD = freqFrames[fc] || freqFrames[fc - 1] || new Uint8Array(offAna.frequencyBinCount);
            timeD = timeFrames[fc] || timeFrames[fc - 1] || new Uint8Array(offAna.fftSize).fill(128);
            renderFrame(ec, ectx, w, h);
            
            let vf = new VideoFrame(ec, { timestamp: Math.round(fc * fInt), duration: Math.round(fInt) });
            if (vEnc.state === 'configured') vEnc.encode(vf, { keyFrame: fc % (S.fps * 2) === 0 });
            vf.close();

            const numChans = audioBuffer.numberOfChannels;
            const startSample = Math.min(Math.round(fc * audioBuffer.sampleRate / S.fps), audioBuffer.length);
            const endSample = Math.min(Math.round((fc + 1) * audioBuffer.sampleRate / S.fps), audioBuffer.length);
            const numFrames = endSample - startSample;
            
            if (numFrames > 0) {
                const L = audioBuffer.getChannelData(0).subarray(startSample, endSample);
                const R = audioBuffer.getChannelData(numChans > 1 ? 1 : 0).subarray(startSample, endSample);
                const interleaved = new Float32Array(numFrames * 2);
                for (let i = 0; i < numFrames; i++) {
                    interleaved[i * 2] = L[i];
                    interleaved[i * 2 + 1] = R[i];
                }
                const audioTs = (startSample / audioBuffer.sampleRate) * 1e6;
                const ad = new AudioData({
                    format: 'f32', sampleRate: audioBuffer.sampleRate,
                    numberOfFrames: numFrames, numberOfChannels: 2,
                    timestamp: Math.round(audioTs), data: interleaved
                });
                if (aEnc.state === 'configured') aEnc.encode(ad);
                ad.close();
            }

            if (fc % 15 === 0) {
                setProgress(Math.round((fc / totalFrames) * 92) + 5);
                await sleep(0);
            }
            
            if (vEnc.state === 'configured' && vEnc.encodeQueueSize > 40) {
                while (vEnc.state === 'configured' && vEnc.encodeQueueSize > 10) await sleep(20);
            }
        }

        if (S.exporting) {
            if (vEnc.state !== 'configured' || aEnc.state !== 'configured') {
                throw new Error("Encoder failed during encoding");
            }
            setProgress(98, 'Finalizing MP4…');
            await vEnc.flush();
            await aEnc.flush();
            isFinished = true;
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: 'video/mp4' });
            dlBlob(blob, `${S.title || 'wavr'}_${S.res}.mp4`);
            setProgress(100, 'Download started! ✓');
            await sleep(1500);
        }
    } catch (e) {
        console.error('Export Failed:', e);
        exSub.textContent = 'Export Failed: ' + e.message;
        await sleep(3000);
    }
    ec.style.display = 'none'; exov.classList.remove('vis'); S.exporting = false;
}

async function exportMediaRecorder(w, h, setP) {
    setP(1, 'Starting recording…');
    const cs = ec.captureStream(S.fps), aDst = actx.createMediaStreamDestination();
    analyser.connect(aDst);
    const stream = new MediaStream([...cs.getVideoTracks(), ...aDst.stream.getAudioTracks()]);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: w >= 3840 ? 40_000_000 : 10_000_000 });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        dlBlob(blob, `${S.title || 'wavr'}_${S.res}.webm`);
        setP(100, 'Download started! (WebM format) ✓');
    };
    rec.start(100); audioEl.currentTime = 0; await audioEl.play(); setP(3, 'Recording…');

    await new Promise(resolve => {
        function frame() {
            if (!S.exporting) { rec.stop(); analyser.disconnect(aDst); return resolve(); }
            getFreq();
            renderFrame(ec, ectx, w, h);
            const p = audioEl.currentTime / audioEl.duration; setP(Math.min(97, Math.round(p * 95) + 3));
            if (audioEl.ended || audioEl.currentTime >= audioEl.duration - .1) {
                rec.stop(); analyser.disconnect(aDst); setTimeout(resolve, 1800); return;
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        audioEl.addEventListener('ended', () => { if (rec.state !== 'inactive') { rec.stop(); analyser.disconnect(aDst); } }, { once: true });
    });
}

function dlBlob(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(u), 6000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadAudio(file) {
    S.audioFile = file; audioEl.src = URL.createObjectURL(file);
    document.getElementById('audioNm').textContent = file.name; document.getElementById('audioNm').style.display = 'block';
    initAudio(); if (!freqD) { freqD = new Uint8Array(2048); timeD = new Uint8Array(2048); }
    audioEl.addEventListener('loadedmetadata', () => {
        playBtn.disabled = false; exportBtn.disabled = false;
        document.getElementById('emptyState').classList.add('gone');
    }, { once: true });
    if (appShell.classList.contains('menu-open')) toggleMenu();
}

document.getElementById('audioIn').addEventListener('change', e => { if (e.target.files[0]) loadAudio(e.target.files[0]); });
dragSetup(document.getElementById('audioDrop'), f => f.type.startsWith('audio/'), loadAudio);

function loadCover(file) {
    document.getElementById('coverNm').textContent = file.name; document.getElementById('coverNm').style.display = 'block';
    const img = new Image();
    img.onload = () => { S.coverImg = img; invalidateBgCache(); };
    img.src = URL.createObjectURL(file);
}

document.getElementById('coverIn').addEventListener('change', e => { if (e.target.files[0]) loadCover(e.target.files[0]); });
dragSetup(document.getElementById('coverDrop'), f => f.type.startsWith('image/'), loadCover);

function loadBgImg(file) {
    const nm = document.getElementById('bgImgNm');
    nm.textContent = file.name; nm.style.display = 'block';
    document.getElementById('bgImgReset').style.display = 'flex';
    const img = new Image();
    img.onload = () => { S.bgImg = img; invalidateBgCache(); };
    img.src = URL.createObjectURL(file);
}
document.getElementById('bgImgIn').addEventListener('change', e => { if (e.target.files[0]) loadBgImg(e.target.files[0]); });
dragSetup(document.getElementById('bgImgDrop'), f => f.type.startsWith('image/'), loadBgImg);
document.getElementById('bgImgReset').addEventListener('click', () => {
    S.bgImg = null;
    document.getElementById('bgImgNm').style.display = 'none';
    document.getElementById('bgImgReset').style.display = 'none';
    invalidateBgCache();
});

function dragSetup(el, check, handler) {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => {
        e.preventDefault(); el.classList.remove('over');
        const f = e.dataTransfer.files[0]; if (f && check(f)) handler(f);
    });
}

document.getElementById('titleIn').addEventListener('input', e => S.title = e.target.value);
document.getElementById('fontIn').addEventListener('change', e => S.font = e.target.value);
document.getElementById('artistIn').addEventListener('input', e => S.artist = e.target.value);
document.getElementById('titleSizeIn').addEventListener('input', e => S.titleSize = +e.target.value);
document.getElementById('titleWeightIn').addEventListener('change', e => S.titleWeight = e.target.value);
document.getElementById('titleYIn').addEventListener('input', e => S.titleY = +e.target.value);
document.getElementById('coverScaleIn').addEventListener('input', e => { S.coverScale = e.target.value / 100; invalidateBgCache(); });
document.getElementById('coverYIn').addEventListener('input', e => { S.coverYOff = e.target.value / 100; invalidateBgCache(); });

document.querySelectorAll('.sc').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('.sc').forEach(e => e.classList.remove('on'));
        el.classList.add('on'); S.style = el.dataset.style; clearStyleState();
        if (appShell.classList.contains('menu-open')) toggleMenu();
    });
});

document.querySelectorAll('.bgtb').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('.bgtb').forEach(e => e.classList.remove('on'));
        el.classList.add('on'); S.background = el.dataset.bg;
        document.getElementById('bgBlurred').style.display = S.background === 'blurred' ? '' : 'none';
        document.getElementById('bgGradient').style.display = S.background === 'gradient' ? '' : 'none';
        document.getElementById('bgSolid').style.display = S.background === 'color' ? '' : 'none';
    });
});

document.getElementById('blurOverlay').addEventListener('input', e => { S.blurOverlay = e.target.value / 100; invalidateBgCache(); });
document.getElementById('blurAmount').addEventListener('input', e => { S.blurAmount = +e.target.value; invalidateBgCache(); });
document.getElementById('blurMode').addEventListener('change', e => { S.blurMode = e.target.value; invalidateBgCache(); });
document.getElementById('gc1').addEventListener('input', e => S.gc1 = e.target.value);
document.getElementById('gc2').addEventListener('input', e => S.gc2 = e.target.value);
document.getElementById('gc3').addEventListener('input', e => S.gc3 = e.target.value);
document.getElementById('solidCol').addEventListener('input', e => S.bgColor = e.target.value);
document.getElementById('gradAngle').addEventListener('input', e => {
    S.gradAngle = +e.target.value; document.getElementById('gradAngleLbl').textContent = e.target.value + '°';
});

document.querySelectorAll('.asw').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('.asw').forEach(e => e.classList.remove('on'));
        el.classList.add('on'); S.acc = el.dataset.c; document.getElementById('custAcc').value = S.acc;
    });
});
document.getElementById('custAcc').addEventListener('input', e => { S.acc = e.target.value; document.querySelectorAll('.asw').forEach(el => el.classList.remove('on')); });

document.getElementById('glowTog').addEventListener('change', e => S.glow = e.target.checked);
document.getElementById('dynCol').addEventListener('change', e => S.dynCol = e.target.checked);
document.getElementById('showTxt').addEventListener('change', e => S.showTxt = e.target.checked);

document.querySelectorAll('[data-res]').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('[data-res]').forEach(e => e.classList.remove('on'));
        el.classList.add('on'); S.res = el.dataset.res;
    });
});

document.querySelectorAll('[data-fps]').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('[data-fps]').forEach(e => e.classList.remove('on'));
        el.classList.add('on'); S.fps = +el.dataset.fps;
    });
});

document.getElementById('ambTog').addEventListener('change', e => { S.ambParts = e.target.checked; document.getElementById('ambOpts').style.display = S.ambParts ? 'flex' : 'none'; });
document.getElementById('shpCirc').addEventListener('change', e => S.ambShapes.circ = e.target.checked);
document.getElementById('shpStar').addEventListener('change', e => S.ambShapes.star = e.target.checked);
document.getElementById('shpHeart').addEventListener('change', e => S.ambShapes.heart = e.target.checked);
document.getElementById('ambDyn').addEventListener('change', e => {
    S.ambDyn = e.target.checked; document.querySelectorAll('.amb-cp').forEach(cp => cp.style.display = S.ambDyn ? 'none' : 'block');
});
document.getElementById('ambColCirc').addEventListener('input', e => S.ambCols.circ = e.target.value);
document.getElementById('ambColStar').addEventListener('input', e => S.ambCols.star = e.target.value);
document.getElementById('ambColHeart').addEventListener('input', e => S.ambCols.heart = e.target.value);
document.getElementById('ambOpacity').addEventListener('input', e => S.ambOpacity = e.target.value / 100);
document.getElementById('ambDir').addEventListener('change', e => S.ambDir = e.target.value);

const themeTog = document.getElementById('themeTog');
themeTog.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeTog.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    
    // Auto-update canvas colors for the theme if they are at defaults
    if (newTheme === 'light') {
        if (S.bgColor === '#0a0a1e') S.bgColor = '#f1f5f9';
        if (S.gc1 === '#0d0221') S.gc1 = '#e2e8f0';
        if (S.gc2 === '#1a0533') S.gc2 = '#cbd5e1';
        if (S.gc3 === '#0a1929') S.gc3 = '#94a3b8';
    } else {
        if (S.bgColor === '#f1f5f9') S.bgColor = '#0a0a1e';
        if (S.gc1 === '#e2e8f0') S.gc1 = '#0d0221';
        if (S.gc2 === '#cbd5e1') S.gc2 = '#1a0533';
        if (S.gc3 === '#94a3b8') S.gc3 = '#0a1929';
    }

    // Sync UI pickers
    document.getElementById('solidCol').value = S.bgColor;
    document.getElementById('gc1').value = S.gc1;
    document.getElementById('gc2').value = S.gc2;
    document.getElementById('gc3').value = S.gc3;

    invalidateBgCache();
});

// Mobile & Desktop Menu
const appShell = document.getElementById('appShell');
const menuTog = document.getElementById('menuTog');
const menuOvl = document.getElementById('menuOvl');

function toggleMenu() {
    const icon = menuTog.querySelector('i');
    if (window.innerWidth <= 850) {
        appShell.classList.toggle('menu-open');
        appShell.classList.remove('menu-closed');
        icon.className = appShell.classList.contains('menu-open') ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    } else {
        appShell.classList.toggle('menu-closed');
        appShell.classList.remove('menu-open');
        icon.className = appShell.classList.contains('menu-closed') ? 'fa-solid fa-bars' : 'fa-solid fa-xmark';
    }
    // Resize preview after layout change
    setTimeout(resizePreview, 310);
}
menuTog.addEventListener('click', toggleMenu);
menuOvl.addEventListener('click', toggleMenu);

const playBtn = document.getElementById('playBtn');
const exportBtn = document.getElementById('exportBtn');
const pfill = document.getElementById('pfill');
const curT = document.getElementById('curT');
const totT = document.getElementById('totT');

playBtn.addEventListener('click', () => {
    if (!actx) initAudio(); actx.resume();
    if (audioEl.paused) { audioEl.play(); playBtn.textContent = '⏸'; }
    else { audioEl.pause(); playBtn.textContent = '▶'; }
});

audioEl.addEventListener('ended', () => { playBtn.textContent = '▶'; });

document.getElementById('pbar').addEventListener('click', e => {
    if (!audioEl.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audioEl.currentTime = ((e.clientX - r.left) / r.width) * audioEl.duration;
});

exportBtn.addEventListener('click', doExport);

document.getElementById('exCancel').addEventListener('click', () => {
    S.exporting = false; audioEl.pause(); document.getElementById('exov').classList.remove('vis');
});

if (!freqD) { freqD = new Uint8Array(2048); timeD = new Uint8Array(2048); }

// Canvas Interaction: Dragging Background, Cover Art, or Resizing
let dragType = null; // 'bg', 'cover', 'resize'
let startMx, startMy, startV1, startV2;

pc.addEventListener('mousedown', e => {
    const rect = pc.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (pc.width / rect.width);
    const my = (e.clientY - rect.top) * (pc.height / rect.height);
    const { cx, cy, sz } = getCover(pc.width, pc.height);
    const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

    if (d < sz / 2) {
        dragType = 'cover';
        startMy = e.clientY;
        startV1 = S.coverYOff;
        pc.style.cursor = 'grabbing';
    } else if (d < sz / 2 + 40) {
        dragType = 'resize';
        startMx = e.clientX;
        startMy = e.clientY;
        startV1 = S.coverScale;
        startV2 = d; // Initial distance for ratio-based scaling
        pc.style.cursor = 'nwse-resize';
    } else if (S.background === 'blurred' && (S.bgImg || S.coverImg) && S.blurMode === 'cover') {
        dragType = 'bg';
        startMy = e.clientY;
        startV1 = S.bgY;
        pc.style.cursor = 'grabbing';
    }
});

window.addEventListener('mousemove', e => {
    if (!dragType) return;
    const rect = pc.getBoundingClientRect();
    
    if (dragType === 'cover') {
        const dy = e.clientY - startMy;
        const hReal = RES[S.res].h;
        const screenToReal = hReal / rect.height;
        S.coverYOff = Math.max(-0.8, Math.min(0.8, startV1 + (dy * screenToReal / hReal)));
        document.getElementById('coverYIn').value = Math.round(S.coverYOff * 100);
        invalidateBgCache();
    } else if (dragType === 'resize') {
        const mx = (e.clientX - rect.left) * (pc.width / rect.width);
        const my = (e.clientY - rect.top) * (pc.height / rect.height);
        const { cx, cy } = getCover(pc.width, pc.height);
        const currD = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
        const ratio = currD / startV2;
        S.coverScale = Math.max(0.1, Math.min(5, startV1 * ratio));
        document.getElementById('coverScaleIn').value = Math.round(S.coverScale * 100);
        invalidateBgCache();
    } else if (dragType === 'bg') {
        const dy = e.clientY - startMy;
        const resH = RES[S.res].h;
        const screenToReal = resH / rect.height;
        const img = S.bgImg || S.coverImg;
        const scale = Math.max(RES[S.res].w / img.width, resH / img.height);
        const ih = img.height * scale;
        const extraH = ih - resH;
        if (extraH > 0) {
            const offsetPct = (dy * screenToReal) / extraH;
            S.bgY = Math.max(0, Math.min(1, startV1 - offsetPct));
            const bgYIn = document.getElementById('bgYIn');
            if (bgYIn) bgYIn.value = Math.round(S.bgY * 100);
            invalidateBgCache();
        }
    }
});

window.addEventListener('mouseup', () => {
    if (dragType) {
        dragType = null;
        pc.style.cursor = '';
    }
});

pc.addEventListener('mouseenter', () => {
    // Proactive cursor hints
    const { sz } = getCover(pc.width, pc.height);
    // This will be updated on mousemove for precision, but set a default here
});

pc.addEventListener('mousemove', e => {
    if (dragType) return;
    const rect = pc.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (pc.width / rect.width);
    const my = (e.clientY - rect.top) * (pc.height / rect.height);
    const { cx, cy, sz } = getCover(pc.width, pc.height);
    const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

    if (d < sz / 2) pc.style.cursor = 'grab';
    else if (d < sz / 2 + 40) pc.style.cursor = 'nwse-resize';
    else if (S.background === 'blurred' && (S.bgImg || S.coverImg) && S.blurMode === 'cover') pc.style.cursor = 'grab';
    else pc.style.cursor = '';
});

pc.addEventListener('mouseleave', () => {
    if (!dragType) pc.style.cursor = '';
});

// Event listener for the new slider
document.getElementById('bgYIn').addEventListener('input', e => {
    S.bgY = e.target.value / 100;
    invalidateBgCache();
});
