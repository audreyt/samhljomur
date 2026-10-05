// site/video.html — the music video player. Canvas 16:9, deterministic
// renderAt(t) (seeded; no Math.random). Data + fonts inlined; audio file is
// the only external asset (inlined in video-standalone.html).

import { readFileSync } from "node:fs";
import { bi } from "./strings";
import { fontCss } from "./site-common";
import { Stage4Out } from "./stage4";
import { Timeline } from "./stage6";

interface VideoOpts {
  standalone?: boolean; // inline audio as data URI
  audioSrc?: string;
}

export function videoHtml(
  lyrics: Stage4Out,
  tl: Timeline,
  opts: VideoOpts = {},
): string {
  // ---- per-line payload: timeline times joined with lyric line details ----
  const lines: any[] = [];
  for (const ch of tl.chunks) {
    const mov = lyrics.movements[ch.movement - 1];
    for (const lt of ch.lines) {
      const src = mov.lines[lt.n - 1];
      lines.push({
        m: ch.movement,
        c: ch.chunk,
        n: lt.n,
        kind: src.kind,
        text: src.text,
        sung: src.sung,
        gloss_en: (src.gloss?.en ?? "").replace(/\s*[—–]\s*/g, ", "),
        gloss_zh: src.gloss?.zh ?? "",
        gloss_zh_edited: !!src.gloss?.zh_edited,
        gloss_edited: !!src.gloss?.edited,

        source: src.source,
        url: src.url ?? null,
        lat: src.lat ?? null,
        lng: src.lng ?? null,
        tone: src.tone ?? null,
        theme: src.theme ?? null,
        count: src.count ?? null,
        seconds: src.seconds ?? null,
        composite: src.composite ?? null,
        editorial: src.editorial ?? null,
        label: src.label ?? null,
        fidelity: lt.fidelity,
        start_s: lt.start_s,
        end_s: lt.end_s,
        clef: src.clef
          ? {
              singable: (src.clef.singable as any)?.score ?? null,
              image: (src.clef.image as any)?.score ?? null,
              warmth: (src.clef.warmth as any)?.score ?? null,
              opener: (src.clef.opener as any)?.score ?? null,
              closer: (src.clef.closer as any)?.score ?? null,
              privacy: (src.clef.privacy as any)?.noul ?? null,
              spelling: (src.clef.spelling as any)?.noul ?? null,
            }
          : null,
        parts: src.parts?.map((p) => ({
          text: p.text,
          gloss_en: p.gloss_en == null ? "" : p.gloss_en.replace(/\s*[—–]\s*/g, ", "),
          gloss_zh: p.gloss_zh ?? "",
          source: p.source,
        })),
      });
    }
  }
  const movements = lyrics.movements.map((m) => {
    const cs = tl.chunks.filter((c) => c.movement === m.n);
    return {
      n: m.n,
      is: m.title_is,
      en: m.title_en,
      start_s: cs.length ? Math.min(...cs.map((c) => c.start_s)) : 0,
      end_s: cs.length ? Math.max(...cs.map((c) => c.end_s)) : 0,
      bridge_start_s: (() => {
        const bridgeChunks = cs.filter((c) => c.section === "bridge");
        return bridgeChunks.length
          ? Math.min(...bridgeChunks.map((c) => c.start_s))
          : null;
      })(),
    };
  });
  // place dots for the map (sung place lines only, deduped by id)
  const places: { x: number; y: number; label: string; n: number }[] = [];
  const seenP = new Set<string>();
  for (const l of lines) {
    if (l.lat == null || l.lng == null || seenP.has(l.source)) continue;
    seenP.add(l.source);
    const COS = Math.cos((65 * Math.PI) / 180);
    places.push({
      x: l.lng * COS,
      y: -l.lat,
      label: l.text.split(". ")[0],
      n: l.n,
    });
  }
  // topic stars for m6
  const topicsData = (
    JSON.parse(readFileSync("out/judgments.json", "utf8")).topics as any[]
  )
    .filter((t) => t.count >= 20)
    .sort((a, b) => b.count - a.count || a.rowIndex - b.rowIndex)
    .map((t) => ({ word: t.word, count: t.count }));
  const coast = JSON.parse(
    readFileSync("assets/geo/iceland-50m.json", "utf8"),
  ).coordinates[0];

  const data = {
    lines,
    movements,
    chunks: tl.chunks.map((c) => ({
      m: c.movement,
      c: c.chunk,
      start_s: c.start_s,
      end_s: c.end_s,
      section: c.section ?? "main",
    })),
    places,
    topics: topicsData,
    coast,
    total_s: tl.total_duration_s,
    placeholder: tl.placeholder,
    fidelity_take: tl.chosen_seed,
  };

  const audioTag = opts.standalone
    ? `<audio id="au" preload="auto" src="data:audio/mpeg;base64,${readFileSync("site/media/medley.mp3").toString("base64")}"></audio>`
    : `<audio id="au" preload="auto" src="${opts.audioSrc ?? "media/medley.mp3"}"></audio>`;

  const S = (k: string) => bi(k);

  return `<!doctype html>
<html lang="is"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Myndband · Samhljómur</title>
<style>${fontCss()}</style>
<style>
:root{--bg:#0B1426;--ink:#EDEAE2;--dim:#8b94a8}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#060a14}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);display:flex;flex-direction:column;align-items:center}
#stage{position:relative;width:min(100vw,177.78vh);aspect-ratio:16/9;background:var(--bg)}
canvas{display:block;width:100%;height:100%}
#chrome{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
#top{display:flex;justify-content:space-between;padding:14px 18px;pointer-events:auto}
#top .wm{font-family:Fraunces,serif;font-weight:600;font-size:15px;letter-spacing:.06em;opacity:.85}
#top .btns{display:flex;gap:8px}
.ctl{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(11,20,38,.55);backdrop-filter:blur(6px);color:var(--ink);border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px}
.ctl:hover{border-color:#8fd8c4}
#bottom{padding:12px 18px 14px;pointer-events:auto}
#barwrap{display:flex;align-items:center;gap:12px}
#play{min-width:64px}
#bar{flex:1;height:26px;position:relative;cursor:pointer}
#bar .track{position:absolute;left:0;right:0;top:11px;height:4px;border-radius:2px;background:rgba(255,255,255,.14)}
#bar .fill{position:absolute;left:0;top:11px;height:4px;border-radius:2px;background:linear-gradient(90deg,#8fd8c4,#c9a1e8)}
#bar .tick{position:absolute;top:8px;width:2px;height:10px;background:rgba(255,255,255,.35);border-radius:1px}
#t{min-width:92px;text-align:right;font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
#inspect{position:absolute;top:0;right:0;bottom:0;width:min(360px,86%);background:rgba(8,13,25,.88);backdrop-filter:blur(10px);border-left:1px solid rgba(255,255,255,.12);padding:18px;overflow-y:auto;transform:translateX(100%);transition:transform .25s;font-size:13px;pointer-events:auto}
#inspect.open{transform:none}
#inspect h3{font-family:Fraunces,serif;font-weight:600;margin-bottom:8px}
#inspect .row{margin:6px 0;color:#c7ccd9}
#inspect .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
#inspect .is-line{font-family:Fraunces,serif;font-size:17px;margin:8px 0}
#inspect .en-line{color:var(--dim);font-size:13px}
#inspect a{color:#8fd8c4}
body.rendering #chrome{display:none}
#pre{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(6,10,20,.55);backdrop-filter:blur(3px);pointer-events:auto;transition:opacity .4s}
#pre.gone{opacity:0;pointer-events:none}
#pre .big{font-family:Fraunces,serif;font-size:clamp(28px,5vw,54px);font-weight:600}
#pre .sub{color:#c7ccd9;max-width:52ch;text-align:center;font-size:14px}
#playbig{cursor:pointer;border:1px solid rgba(255,255,255,.3);background:rgba(143,216,196,.12);color:var(--ink);border-radius:12px;padding:14px 34px;font:inherit;font-size:17px}
#playbig:hover{border-color:#8fd8c4;background:rgba(143,216,196,.22)}
</style></head>
<body>
<div id="stage">
<canvas id="cv" width="1920" height="1080"></canvas>
<div id="chrome">
  <div id="top"><span class="wm">SAMHLJÓMUR</span>
    <div class="btns">
      <button class="ctl langbtn" data-lang="is" onclick="setVlang('is')">Íslenska</button>
      <button class="ctl langbtn" data-lang="en" onclick="setVlang('en')">English</button>
      <button class="ctl langbtn" data-lang="zh" onclick="setVlang('zh')">華文</button>
      <button class="ctl" id="insp">${S("inspect").is}</button>
    </div>
  </div>
  <div id="bottom">
    <div id="barwrap">
      <button class="ctl" id="play">▶ <span id="pl">${S("play").is}</span></button>
      <div id="bar"><div class="track"></div><div class="fill" id="fill"></div><div id="ticks"></div></div>
      <span id="t">0:00 / 0:00</span>
    </div>
  </div>
</div>
<div id="inspect"></div>
<div id="pre">
  <div class="big">Samhljómur</div>
  <div class="sub">${S("tagline").is}<br>${S("disclaimer").is}</div>
  <button id="playbig">${S("press_play").is}</button>
</div>
</div>
${audioTag}
<script>
const DATA=${JSON.stringify(data)};
const STR=${JSON.stringify({
    lang_switch: S("lang_switch"),
    play: S("play"),
    pause: S("pause"),
    inspect: S("inspect"),
    gloss_label: S("gloss_label"),

    gloss_edited: S("gloss_edited"),
    tagline_label: S("tagline_label"),
    tagline: S("tagline"),
    press_play: S("press_play"),
    insp_source: S("insp_source"),
    insp_clef: S("insp_clef"),
    insp_singable: S("insp_singable"),
    insp_image: S("insp_image"),
    insp_warmth: S("insp_warmth"),
    insp_tone: S("insp_tone"),
    insp_seconds: S("insp_seconds"),
    insp_opener: S("insp_opener"),
    insp_closer: S("insp_closer"),
    insp_privacy: S("insp_privacy"),
    insp_fidelity: S("insp_fidelity"),
    insp_editorial: S("insp_editorial"),
    said_by: S("said_by"),
    attribution: S("attribution"),
    disclaimer: S("disclaimer"),
    override_title: S("override_title"),
    override_count: S("override_count"),
    m: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((i) => [i, S("m" + i)]),
    ),
    m4_bridge: S("m4_bridge"),
    tone_joyful: S("tone_joyful"),
    tone_tender: S("tone_tender"),
    tone_proud: S("tone_proud"),
    tone_wry: S("tone_wry"),
    tone_critical: S("tone_critical"),
    tone_calm: S("tone_calm"),
    tone_unclear: S("tone_unclear"),
  })};
${RENDER_JS}
</script>
</body></html>`;
}

// The entire deterministic renderer + player, as an inline <script>.
const RENDER_JS = String.raw`
const cv=document.getElementById('cv'),g=cv.getContext('2d');
const W=1920,H=1080;
// ---- seeded rng (mulberry32); everything visual derives from these ----
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R0=rng(0x5eed);
// stars
const STARS=[];for(let i=0;i<160;i++)STARS.push({x:R0()*W,y:R0()*H*0.62,r:.4+R0()*1.5,ph:R0()*6.28,sp:.2+R0()*.8,a:.12+R0()*.4});
// aurora ribbons (per movement palette; hue lerped at boundaries)
const PAL={1:{h:205,h2:220,i:.22},2:{h:38,h2:20,i:.17},3:{h:125,h2:150,i:.26},4:{h:45,h2:8,i:.18},5:{h:140,h2:315,i:.42},6:{h:255,h2:285,i:.2}};
const RIBBONS=[];{const r=rng(0xa0b0a);for(let i=0;i<7;i++)RIBBONS.push({cx:.08+r()*.84,wd:.05+r()*.10,amp:60+r()*160,ph:r()*6.28,f1:.9+r()*2.2,f2:2+r()*4,lean:(r()-.5)*.3});}
// rain for m1
const RAIN=[];{const r=rng(0xea1a1);for(let i=0;i<220;i++)RAIN.push({x:r()*W,y:r()*H,l:8+r()*26,v:(380+r()*460),o:.05+r()*.18,w:.5+r()*.9});}
const DRIPS=[];{const r=rng(0xd1e95);for(let i=0;i<26;i++)DRIPS.push({x:r()*W,y:r()*H*.5,r2:1.4+r()*3.2,v:18+r()*40,o:.10+r()*.22});}
// m2: whole verbatim matur answers fall and settle (size by count); shelf
// packing keeps each on its own padded slot, newest ~8 stay visible
const FLAKES=[];{const r=rng(0xf00d);
  const lines=DATA.lines.filter(l=>l.m===2&&l.kind==='line');
  lines.forEach((l,i)=>{
    const cnt=l.count||1;
    FLAKES.push({w:l.text,x:.06+r()*.88,delay:i/(Math.max(1,lines.length-1))*.55+r()*.08,
      sz:16+4*Math.sqrt(cnt)+r()*3,o:.55+r()*.4,rot:(r()-.5)*.1,line:l});
  });
  // shelf-pack deferred to first draw — measureText needs Fraunces loaded
  FLAKES.sort((a,b)=>a.delay-b.delay);
  FLAKES.forEach((f,i)=>{f.order=i;});
}
function packFlakes(){
  if(FLAKES[0]&&FLAKES[0].rx!=null)return;
  // pass 1: widths + row assignment (wrap at right margin)
  let cx=W*.08,row=0;const rows=[[]];
  FLAKES.forEach(f=>{
    g.font='600 '+f.sz+'px Fraunces,serif';
    const w=g.measureText(f.w).width+30;
    if(cx+w>W*.92){row++;rows.push([]);cx=W*.08;}
    f.w2=w;f.row=row;f.rx=cx+w/2;cx+=w;rows[row].push(f);
  });
  // pass 2: pitch covers each row's box height plus the 8px settle drop
  let y=H*.38;
  rows.forEach(r=>{
    const mx=Math.max(...r.map(f=>f.sz));
    r.forEach(f=>{f.ry=y+mx*1.05;});
    y+=mx*1.6+8;
  });
}
// m4 yoke stitches: concentric circles of lopapeysa colourwork motifs
const YOKE=[];{const r=rng(0x10fa);
  // rings: neck rib outwards; motif cycles diamond/zigzag/star/dots
  const rr=78;let idx=0,ring=0;
  const MAXR=300;
  for(let rad=70;rad<=MAXR;rad+=34,ring++){
    const n=Math.max(10,Math.round(rad*6.2832/15));
    const motif=ring%4; // 0 diamonds, 1 zigzag, 2 star, 3 dots
    for(let k=0;k<n;k++){const a=k/n*6.2832;
      // colourwork palette index: 0 oatmeal, 1 red, 2 charcoal, 3 white
      const col=(ring%3===2)?1:(r()<.14?3:r()<.30?2:0);
      YOKE.push({ring,a,rr:rad,motif,col,ord:idx++});}}
  YOKE.sort((x,y)=>x.ord-y.ord);}
// m6 topic stars
const TSTARS=[];{const r=rng(0x57a5);DATA.topics.forEach((t,i)=>{
  const golden=i*2.39996;const rad=60+Math.sqrt(i)*120;
  TSTARS.push({w:t.word,c:t.count,x:W/2+Math.cos(golden)*rad*1.5,y:H*.42+Math.sin(golden)*rad*.62,s:10+Math.sqrt(t.count)*3.4,ph:r()*6.28});});}
// coastline projection helpers
const COS65=Math.cos(65*Math.PI/180);
function coastPts(){const pts=DATA.coast.map(c=>[c[0]*COS65,-c[1]]);
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const mnx=Math.min(...xs),mxx=Math.max(...xs),mny=Math.min(...ys),mxy=Math.max(...ys);
  return {pts,mnx,mxx,mny,mxy};}
const CP=coastPts();
function mapBox(){ // map: upper field, ~1.4x larger, clear of the lyric zone
  const bw=W*.56,bh=H*.46;
  const s=Math.min(bw/(CP.mxx-CP.mnx),bh/(CP.mxy-CP.mny));
  const ox=W*.5-(CP.mnx+CP.mxx)/2*s, oy=H*.26-(CP.mny+CP.mxy)/2*s;
  return {s,ox,oy};}
// movement lookup
function movAt(t){for(const m of DATA.movements)if(t<m.end_s)return m;return DATA.movements[DATA.movements.length-1]}
// display windows (lead rule): line i visible from start_i-0.4 until
// min(next.start-0.15, start_i+max(sungSpan_i, clefSeconds_i)+1.5); the last
// line of a chunk may hold to the chunk end; topics/tagline use 4.5 s.
for(const ch of DATA.chunks){
  const arr=DATA.lines.filter(l=>l.m===ch.m&&l.c===ch.c).sort((a,b)=>a.n-b.n);
  arr.forEach((l,i)=>{
    const nextStart=i<arr.length-1?arr[i+1].start_s:ch.end_s;
    l.sec=l.seconds==null?4.5:l.seconds;
    l.vs=l.start_s-0.4;
    l.ve=Math.min(i<arr.length-1?nextStart-0.15:nextStart,
                 l.start_s+Math.max(l.end_s-l.start_s,l.sec)+1.5);
    l.chunkStart=ch.start_s;l.chunkEnd=ch.end_s;
  });
}
function lineAt(t){for(const l of DATA.lines){if(t>=l.vs&&t<l.ve)return l}return null}
function sungLineAt(t){let prev=null;for(const l of DATA.lines){if(t>=l.start_s&&t<l.end_s)return l;if(t<l.start_s)break;prev=l}return prev}
// title card visible during a chunk's lead-in — only on each movement's
// FIRST chunk; continuation chunks leave the art alone
const FIRSTC={};for(const ch of DATA.chunks){if(!(ch.m in FIRSTC)||ch.c<FIRSTC[ch.m])FIRSTC[ch.m]=ch.c}
function cardAt(t){for(const ch of DATA.chunks){
  if(ch.c!==FIRSTC[ch.m])continue;
  const first=DATA.lines.find(l=>l.m===ch.m&&l.c===ch.c);
  if(t>=ch.start_s&&first&&t<first.vs)return ch}return null}
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,u)=>a+(b-a)*u;
function smooth(a,b,t){return clamp((t-a)/(b-a),0,1)}
function hueLerp(h1,h2,u){let d=h2-h1;if(d>180)d-=360;if(d<-180)d+=360;return(h1+d*u+360)%360}
function palAt(t){const m=movAt(t);const i=DATA.movements.indexOf(m);
  // blend palettes across a 1.6s boundary
  const FADE=1.6;let p=PAL[m.n];
  if(i>0&&t-m.start_s<FADE){const q=PAL[DATA.movements[i-1].n];const u=ease((t-m.start_s)/FADE);
    return{h:hueLerp(q.h,p.h,u),h2:hueLerp(q.h2,p.h2,u),i:lerp(q.i,p.i,u)}}
  if(i<DATA.movements.length-1&&m.end_s-t<FADE){const q=PAL[DATA.movements[i+1].n];const u=ease((m.end_s-t)/FADE);return{h:p.h,h2:p.h2,i:lerp(q.i,p.i,u)}}
  return p}
function fmt(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}

function drawSky(t){
  const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#0B1426');gr.addColorStop(.62,'#0e1930');gr.addColorStop(1,'#0a1120');g.fillStyle=gr;g.fillRect(0,0,W,H);
  for(const s of STARS){const tw=.5+.5*Math.sin(t*s.sp+s.ph);g.globalAlpha=s.a*tw;g.fillStyle='#dfe8ff';g.beginPath();g.arc(s.x,s.y,s.r,0,6.2832);g.fill()}
  g.globalAlpha=1;
}
// aurora: offscreen layer, long ribbons with a drifting baseline curve; many
// thin rays per ribbon, bright at the lower edge fading upward, additive,
// shimmer travelling along the ribbon, softened with a blur pass.
const AC=document.createElement('canvas');AC.width=W;AC.height=Math.ceil(H*.6);
const ag=AC.getContext('2d');
function drawAurora(t,pal){
  ag.clearRect(0,0,AC.width,AC.height);
  for(const rb of RIBBONS){
    const rays=120;
    const drift=Math.sin(t*.045+rb.ph)*60+Math.sin(t*.021+rb.ph*2)*40;
    for(let i=0;i<rays;i++){
      const u=i/(rays-1);
      const x=(rb.cx+(u-.5)*rb.wd)*W+drift+rb.lean*u*W*.06;
      const base=AC.height*.72+Math.sin(u*rb.f1*6.28+rb.ph+t*.06)*rb.amp*.30
        +Math.sin(u*rb.f2*6.28-t*.11+rb.ph*2)*rb.amp*.16;
      const len=rb.amp*1.35*(0.55+0.45*Math.sin(u*7.3+t*.21+rb.ph));
      const pleat=Math.pow(.5+.5*Math.sin(u*rb.f2*12.56-t*.9+rb.ph*3),1.6);
      const a=pal.i*pleat*(0.55+0.45*Math.sin(t*.3+rb.ph+u*2));
      if(a<0.004)continue;
      const hue=(pal.h+(pal.h2-pal.h)*u+360)%360;
      const grd=ag.createLinearGradient(0,base-len,0,base);
      grd.addColorStop(0,'hsla('+hue+',70%,60%,0)');
      grd.addColorStop(.55,'hsla('+hue+',72%,56%,'+(a*.45)+')');
      grd.addColorStop(.85,'hsla('+hue+',74%,60%,'+(a*.9)+')');
      grd.addColorStop(1,'hsla('+hue+',78%,66%,'+a+')');
      ag.fillStyle=grd;
      ag.fillRect(x,base-len,2.6,len);
    }
  }
  g.save();g.globalCompositeOperation='lighter';
  if('filter' in g)g.filter='blur(5px)';
  g.drawImage(AC,0,0);
  g.restore();
}
// map visibility: fades out during m4 (the yoke takes the stage)
function movWeight(n,t){const m=DATA.movements[n-1];return smooth(m.start_s-1,m.start_s+1.4,t)*smooth(m.end_s+0.6,m.end_s-1.2,t)}
function drawMap(t,m){
  const {s,ox,oy}=mapBox();const strong=m.n===3?1:0;
  const vis=1-movWeight(4,t);
  const glow=strong?1:.45;
  if(vis<=0.01)return;
  g.save();g.translate(ox,oy);g.scale(s,s);g.globalAlpha=vis;
  g.beginPath();CP.pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();
  g.strokeStyle='rgba(120,220,195,'+(0.28+0.5*glow)+')';g.lineWidth=1.1/s*2.2;g.stroke();
  g.fillStyle='rgba(70,120,110,'+(0.05+0.06*glow)+')';g.fill();
  g.restore();
}
function drawRain(t,m){
  if(m.n!==1)return;const u=smooth(m.start_s,m.start_s+2,t)*smooth(m.end_s,m.end_s-1.5,t);
  g.save();g.globalAlpha=u;
  for(const r of RAIN){const y=(r.y+t*r.v)% (H*0.72);const x=r.x+y*0.045;
    g.strokeStyle='rgba(180,205,225,'+r.o+')';g.lineWidth=r.w;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+r.l*.16,y+r.l);g.stroke();}
  for(const d of DRIPS){const y=(d.y+t*d.v)% (H*0.66);
    g.fillStyle='rgba(190,215,235,'+d.o+')';g.beginPath();g.ellipse(d.x+Math.sin(y*.01)*6,y,d.r2,d.r2*1.7,0,0,6.2832);g.fill();}
  g.restore();
}
function drawFood(t,m){
  if(m.n!==2)return;packFlakes();
  const rel=t-m.start_s;const dur=m.end_s-m.start_s;
  const vis=smooth(m.start_s,m.start_s+1.2,t)*smooth(m.end_s,m.end_s-.8,t);
  g.save();
  // warm amber wash in the upper field
  const grd=g.createLinearGradient(0,H*.3,0,H*.68);grd.addColorStop(0,'rgba(150,90,28,0)');grd.addColorStop(1,'rgba(150,90,28,.13)');g.globalAlpha=vis;g.fillStyle=grd;g.fillRect(0,H*.3,W,H*.38);
  // each answer appears at its packed slot: a short 8px drop with opacity
  // ramp, never crossing other rows; oldest fades as newer ones land
  const dropDur=1.0;
  const landT=f=>f.delay*dur+dropDur;
  FLAKES.forEach(f=>{
    const start=f.delay*dur;
    if(start>rel)return;
    const u=clamp((rel-start)/dropDur,0,1);
    const e=ease(u);
    const yy=lerp(f.ry-8,f.ry,e);
    const newer=FLAKES.filter(o=>o.order>f.order&&landT(o)<rel);
    const evict=newer.length>=8?landT(newer[7]):1e9;
    const fade=1-smooth(evict,evict+1.2,rel);
    const a=f.o*u*vis*fade;
    if(a<=0.01)return;
    g.globalAlpha=a;
    g.fillStyle=f.order%4===0?'#f3ead2':'#e8c47c';
    g.font='600 '+f.sz+'px Fraunces,serif';g.textAlign='center';
    g.fillText(f.w,f.rx,yy);
  });
  g.globalAlpha=1;g.restore();
}
// debug/QA: layout boxes of every m2 item drawn at time t (alpha > 0.05)
function m2Boxes(t){
  packFlakes();
  const m=DATA.movements[1];const rel=t-m.start_s;const dur=m.end_s-m.start_s;
  const vis=smooth(m.start_s,m.start_s+1.2,t)*smooth(m.end_s,m.end_s-.8,t);
  const dropDur=1.0;const landT=f=>f.delay*dur+dropDur;const out=[];
  FLAKES.forEach(f=>{
    const start=f.delay*dur;if(start>rel)return;
    const u=clamp((rel-start)/dropDur,0,1);
    const yy=lerp(f.ry-8,f.ry,ease(u));
    const newer=FLAKES.filter(o=>o.order>f.order&&landT(o)<rel);
    const evict=newer.length>=8?landT(newer[7]):1e9;
    const fade=1-smooth(evict,evict+1.2,rel);
    const a=f.o*u*vis*fade;
    // w2 includes 30px packing pad; the visible text box is w2-30 wide
    const hw=(f.w2-30)/2;
    if(a>0.05)out.push({x0:f.rx-hw,y0:yy-f.sz*.95,x1:f.rx+hw,y1:yy+f.sz*.3,a});
  });
  return out;
}
function drawRingRoad(t,m){
  if(m.n!==3)return;const {s,ox,oy}=mapBox();
  const pl=DATA.lines.filter(l=>l.m===3&&l.kind==='line');
  const pts=pl.map(l=>({x:ox+l.lng*COS65*s,y:oy+(-l.lat)*s,l}));
  // road draws itself progressively through the movement
  const rel=clamp((t-m.start_s)/(m.end_s-m.start_s),0,1);
  g.save();
  g.strokeStyle='rgba(160,215,170,.85)';g.lineWidth=3;g.lineJoin='round';g.lineCap='round';
  g.shadowColor='rgba(140,220,170,.5)';g.shadowBlur=14;
  g.beginPath();
  // progressive polyline: parameter = distance along sung order
  const total=pts.length-1;const prog=rel*total;
  pts.forEach((p,i)=>{if(i===0)g.moveTo(p.x,p.y);else if(i-1<prog){const f=Math.min(1,prog-(i-1));const q=pts[i-1];g.lineTo(q.x+(p.x-q.x)*f,q.y+(p.y-q.y)*f)}});
  g.stroke();g.shadowBlur=0;
  // place dots; sung place pulses + label while its line is active
  const cur=lineAt(t);
  pts.forEach((p)=>{
    const act=cur&&cur.n===p.l.n&&cur.m===3;
    const past=p.l.start_s<t;
    g.fillStyle=act?'#fff':past?'rgba(160,215,170,.9)':'rgba(160,215,170,.35)';
    const r=act?7+3*Math.sin(t*6):4;
    g.beginPath();g.arc(p.x,p.y,r,0,6.2832);g.fill();
    if(act){g.font='600 22px Inter,sans-serif';g.textAlign='center';g.fillStyle='#eaf4ee';
      g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=8;g.fillText(p.l.text.split('. ')[0],p.x,p.y-18);g.shadowBlur=0;}
  });
  g.restore();
}
function drawYoke(t,m){
  if(m.n!==4)return;
  const bridge=m.bridge_start_s!=null&&t>=m.bridge_start_s;
  const growEnd=m.bridge_start_s??m.end_s;
  const rel=clamp((t-m.start_s)/(growEnd-m.start_s),0,1);
  const cx=W*.5,cy=H*.42;const show=Math.floor(YOKE.length*ease(rel));
  g.save();
  const desat=bridge?smooth(m.bridge_start_s,m.bridge_start_s+1.5,t):0;
  const alpha=smooth(m.start_s,m.start_s+1.2,t)*smooth(m.end_s,m.end_s-.8,t);
  g.globalAlpha=alpha;
  // lopapeysa colours: oatmeal / charcoal / white / red, greyed in the bridge
  const OAT=[226,214,188],CHR=[46,50,56],WHT=[245,242,236],RED=[192,69,58];
  const pick=c=>{
    const base=c===1?RED:c===2?CHR:c===3?WHT:OAT;
    const k=lerp(1,.5,desat);
    return 'rgba('+Math.round(base[0]*k)+','+Math.round(base[1]*k)+','+Math.round(base[2]*k)+',.94)';
  };
  // neck rib
  g.strokeStyle=pick(2);g.lineWidth=16;
  g.beginPath();g.arc(cx,cy,58,0,6.2832);g.stroke();
  for(let i=0;i<show;i++){const yk=YOKE[i];
    const x=cx+Math.cos(yk.a)*yk.rr,y=cy+Math.sin(yk.a)*yk.rr; // perfect circles
    g.save();g.translate(x,y);g.rotate(yk.a+Math.PI/2);
    g.fillStyle=pick(yk.col);
    if(yk.motif===0){ // diamond
      g.fillStyle=pick(yk.col===2?0:yk.col);
      g.beginPath();g.moveTo(0,-8);g.lineTo(6,0);g.lineTo(0,8);g.lineTo(-6,0);g.fill();
    }else if(yk.motif===1){ // zigzag bar pair
      g.fillStyle=pick(yk.col);
      g.beginPath();g.moveTo(-8,5);g.lineTo(-3,-5);g.lineTo(2,5);g.lineTo(7,-5);g.lineTo(7,-1);g.lineTo(2,9);g.lineTo(-3,-1);g.lineTo(-8,9);g.closePath();g.fill();
    }else if(yk.motif===2){ // eight-point star
      g.fillStyle=pick(yk.col);
      for(let q=0;q<4;q++){g.save();g.rotate(q*Math.PI/4);g.beginPath();g.moveTo(0,-10);g.lineTo(3.4,0);g.lineTo(0,10);g.lineTo(-3.4,0);g.closePath();g.fill();g.restore();}
    }else{ // dotted row
      g.fillStyle=pick(yk.col);
      g.beginPath();g.arc(0,0,3.4,0,6.2832);g.fill();
    }
    g.restore();
  }
  g.globalAlpha=1;g.restore();
}
function drawTopicStars(t,m){
  if(m.n!==6)return;const rel=clamp((t-m.start_s)/(m.end_s-m.start_s),0,1);
  const last=DATA.lines[DATA.lines.length-1];
  const alone=last&&t>=last.start_s;
  g.save();
  const u=smooth(m.start_s,m.start_s+2,t)*(alone?smooth(last.end_s,last.start_s+2,t)*0.9+0.1:1);
  g.globalAlpha=u;
  TSTARS.forEach((ts,i)=>{
    const tw=.5+.5*Math.sin(t*.8+ts.ph);
    const grow=smooth(m.start_s+i*.14,m.start_s+i*.14+1.2,t);
    g.globalAlpha=u*grow*(.5+.5*tw);
    g.fillStyle='#dfe8ff';g.beginPath();g.arc(ts.x,ts.y,1.6+ts.s*.12,0,6.2832);g.fill();
    g.globalAlpha=u*grow;
    g.font='500 '+ts.s+'px Fraunces,serif';g.textAlign='center';g.fillStyle='rgba(226,232,248,'+(.55+.45*tw)+')';
    g.fillText(ts.w,ts.x,ts.y-ts.s*.9-8);
  });
  g.globalAlpha=1;g.restore();
}
function wrap(text,font,maxW){
  g.font=font;const words=text.split(' ');const out=[''];
  for(const w of words){const cur=out[out.length-1];const test=cur?cur+' '+w:w;
    if(g.measureText(test).width>maxW&&cur)out.push(w);else out[out.length-1]=test}
  return out;
}
function lyricScrim(alpha){
  // soft dark band behind the lyric zone so text never fights the art
  const grd=g.createLinearGradient(0,H*.56,0,H*.97);
  grd.addColorStop(0,'rgba(6,10,20,0)');
  grd.addColorStop(.25,'rgba(6,10,20,'+(.52*alpha)+')');
  grd.addColorStop(.85,'rgba(6,10,20,'+(.58*alpha)+')');
  grd.addColorStop(1,'rgba(6,10,20,'+(.3*alpha)+')');
  g.fillStyle=grd;g.fillRect(0,H*.56,W,H*.41);
}
function drawLyrics(t,m){
  const maxW=W*.78;
  const l=lineAt(t);
  const card=!l?cardAt(t):null;
  // title card during chunk lead-in
  if(card){
    const mm=DATA.movements[card.m-1];
    const a=clamp(Math.min(smooth(card.start_s,card.start_s+.6,t),1),0,1);
    g.save();g.globalAlpha=a;lyricScrim(a);
    g.textAlign='center';
    g.font='600 56px Fraunces,serif';g.fillStyle='#f2eee4';
    g.fillText(mm.is,W/2,H*.78);
    g.font='400 22px Inter,sans-serif';g.fillStyle='rgba(150,160,180,.92)';
    g.fillText(mm.en,W/2,H*.78+42);
    g.restore();
    return;
  }
  if(!l)return;
  const alpha=clamp(Math.min(smooth(l.vs,l.vs+.45,t),1-Math.max(0,(t-(l.ve-.35))/.35)),0,1);
  if(alpha<=0)return;
  g.save();g.globalAlpha=alpha;lyricScrim(alpha);
  const cy=H*.80;
  g.textAlign='center';
  // movement tag
  const mlab=m.n===4&&m.bridge_start_s!=null&&t>=m.bridge_start_s?STR.m4_bridge:STR.m[m.n];
  g.font='500 15px Inter,sans-serif';g.fillStyle='rgba(160,175,200,.85)';
  g.fillText(pick(mlab).toUpperCase(),W/2,H*.60);
  // lyric line(s), Fraunces, wrapped
  const lines2=wrap(l.text,'600 40px Fraunces,serif',maxW);
  g.font='600 40px Fraunces,serif';g.fillStyle='#f2eee4';
  lines2.forEach((ln,i)=>{g.fillText(ln,W/2,cy+i*50-(lines2.length-1)*25)});
  let y2=cy+(lines2.length-1)*25+44;
  if(l.count>=2){g.font='500 16px Inter,sans-serif';g.fillStyle='rgba(232,196,124,.9)';g.fillText('×'+l.count,W/2,y2-28)}
  // gloss + provenance label; zh mode shows the zh gloss (D2)
  const gz=LANG==='zh'?l.gloss_zh:l.gloss_en;
  if(gz){
    const gf=LANG==='zh'?'400 19px Iansui,Inter,sans-serif':'400 19px Inter,sans-serif';
    const gl=wrap(gz,gf,maxW);
    g.font=gf;g.fillStyle='rgba(150,160,180,.92)';
    gl.forEach((ln,i)=>g.fillText(ln,W/2,y2+4+i*24));
    const edited=LANG==='zh'?l.gloss_zh_edited:l.gloss_edited;
    const lbl=edited?STR.gloss_edited:STR.gloss_label;
    g.font=(LANG==='zh'?'400 12px Iansui,Inter,sans-serif':'400 12px Inter,sans-serif');
    g.fillStyle='rgba(120,130,150,.7)';
    g.fillText(lbl[pickKey()],W/2,y2+4+gl.length*24+4);
  }
  g.restore();
}
function drawCredit(t){
  g.save();g.font='400 12px Inter,sans-serif';g.textAlign='left';
  g.fillStyle='rgba(140,150,170,.42)';
  g.fillText(STR.attribution.is,W*.018,H*.965);
  g.textAlign='right';g.fillText(STR.disclaimer.is,W*.982,H*.965);
  g.restore();
}
window.renderAt=function(t){
  const m=movAt(t);const pal=palAt(t);
  drawSky(t);drawAurora(t,pal);drawMap(t,m);
  drawRain(t,m);drawFood(t,m);drawRingRoad(t,m);drawYoke(t,m);drawTopicStars(t,m);
  drawLyrics(t,m);drawCredit(t);
  return m.n;
};
// ---- player chrome ----
let LANG='is';
const pickKey=()=>LANG==='zh'?'zh':LANG==='en'?'en':'is';
const pick=o=>LANG==='zh'?(o.zh||o.en):LANG==='en'?o.en:o.is;
const au=document.getElementById('au');
const TOTAL=DATA.total_s;
document.getElementById('ticks').innerHTML=DATA.movements.slice(1).map(m=>'<div class="tick" style="left:'+(m.start_s/TOTAL*100)+'%"></div>').join('');
function tickUi(){
  const t=document.body.classList.contains('rendering')?window.__t||0:au.currentTime;
  document.getElementById('fill').style.width=(t/TOTAL*100)+'%';
  document.getElementById('t').textContent=fmt(t)+' / '+fmt(TOTAL);
  renderAt(t);updateInspect(t);
}
document.getElementById('play').onclick=()=>{au.paused?au.play():au.pause()};
document.getElementById('playbig').onclick=()=>{document.getElementById('pre').classList.add('gone');au.play()};
au.addEventListener('play',()=>{document.getElementById('pl').textContent=STR.pause[pickKey()]});
au.addEventListener('pause',()=>{document.getElementById('pl').textContent=STR.play[pickKey()]});
document.getElementById('bar').onclick=(e)=>{const r=e.currentTarget.getBoundingClientRect();au.currentTime=TOTAL*(e.clientX-r.left)/r.width};
function setVlang(l){
  LANG=['is','en','zh'].includes(l)?l:'is';
  try{localStorage.setItem('samhljomur-lang',LANG)}catch(e){}
  document.documentElement.lang=LANG==='zh'?'zh-Hant-TW':LANG;
  document.querySelectorAll('.langbtn').forEach(x=>x.classList.toggle('on',x.dataset.lang===LANG));
  document.getElementById('insp').textContent=STR.inspect[pickKey()];
  const pre=document.querySelector('#pre .sub');if(pre)pre.innerHTML=STR.tagline[pickKey()]+'<br>'+STR.disclaimer[pickKey()];
  document.getElementById('playbig').textContent=STR.press_play[pickKey()];
  const pl=document.getElementById('pl');if(pl)pl.textContent=(au.paused?STR.play:STR.pause)[pickKey()];
}
try{const l0=localStorage.getItem('samhljomur-lang');if(l0&&l0!=='is')setVlang(l0)}catch(e){}
document.getElementById('insp').onclick=()=>document.getElementById('inspect').classList.toggle('open');
function toneName(k){const s=STR['tone_'+k];return s?s[pickKey()]:k}
function updateInspect(t){
  const el=document.getElementById('inspect');if(!el.classList.contains('open'))return;
  const l=lineAt(t);
  if(!l){el.innerHTML='<h3>'+STR.inspect[pickKey()]+'</h3>';return}
  const pk=pickKey();
  const f=x=>x==null?'–':Number(x).toFixed(2);
  let h='<h3>'+STR.inspect[pk]+'</h3>';
  h+='<div class="is-line">'+esc(l.text)+'</div>';
  const gz=LANG==='zh'?l.gloss_zh:l.gloss_en;
  if(gz)h+='<div class="en-line">'+esc(gz)+' <span class="k">· '+((LANG==='zh'?l.gloss_zh_edited:l.gloss_edited)?STR.gloss_edited[pk]:STR.gloss_label[pk])+'</span></div>';
  h+='<div class="row"><span class="k">'+STR.insp_source[pk]+':</span> '+esc(l.source)+(l.url?' · <a href="'+l.url+'" target="_blank">talasaman.is</a>':'')+(l.count>=2?' · ×'+l.count:'')+'</div>';
  if(l.label)h+='<div class="row"><span class="k">'+esc(l.label)+'</span></div>';
  if(l.clef){
    h+='<div class="row"><span class="k">'+STR.insp_clef[pk]+'</span></div>';
    h+='<div class="row">'+STR.insp_singable[pk]+' '+f(l.clef.singable)+' · '+STR.insp_image[pk]+' '+f(l.clef.image)+' · '+STR.insp_warmth[pk]+' '+f(l.clef.warmth)+'</div>';
    h+='<div class="row">'+STR.insp_opener[pk]+' '+f(l.clef.opener)+' · '+STR.insp_closer[pk]+' '+f(l.clef.closer)+' · '+STR.insp_seconds[pk]+' '+f(l.seconds)+'s</div>';
    h+='<div class="row">'+STR.insp_tone[is?'is':'en']+' '+toneName(l.tone)+' · '+STR.insp_privacy[is?'is':'en']+' '+f(l.clef.privacy)+'</div>';
  }
  if(l.fidelity!=null)h+='<div class="row">'+STR.insp_fidelity[is?'is':'en']+' '+Math.round(l.fidelity*100)+'%</div>';
  if(l.editorial)h+='<div class="row"><span class="k">'+STR.insp_editorial[is?'is':'en']+':</span> '+esc(is?l.editorial.reason_is:l.editorial.reason_en)+'</div>';
  el.innerHTML=h;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
au.addEventListener('timeupdate',tickUi);
(function loop(){tickUi();requestAnimationFrame(loop)})();
`;
