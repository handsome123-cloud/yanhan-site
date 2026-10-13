/* ==========================================================
   颜涵的个人小站 · PPT 式分页交互脚本
   核心：.deck 整体位移翻页，11 屏
   ========================================================== */

/* ==========================================================
   -1. 身份判定（必须最先求值）
   站长本人：网址带 ?owner=1 打开（会被本机记住，之后可直接进）
   其他人  ：一律访客 —— 能看星空、能留言、能封存时间胶囊，
             但看不到删除键 / 编辑键 / 清空 / 备份工具
   ⚠️ 时间胶囊的 IIFE 在留言板之前执行，所以身份必须在这里
      一次性求值并挂到 window，不能各自判断（否则读到 undefined）。
   ⚠️ 绝不能用「首次访问 = 本人」：那样每个陌生设备第一次打开
      都会拿到站长权限，访客会看到管理界面，站长也分不清谁是谁。
   ========================================================== */
window.__IS_OWNER = (function(){
  try {
    const k = 'yh_owner';

    /* ① 网址带 ?owner=1 → 认作站长，并记住；?owner=0 → 退出站长模式 */
    let q = '';
    try { q = new URLSearchParams(location.search).get('owner') || ''; } catch(e){}
    if (q === '1'){ localStorage.setItem(k, 'owner'); return true; }
    if (q === '0'){ localStorage.setItem(k, 'guest'); return false; }

    /* ② 否则看本机记忆 */
    const v = localStorage.getItem(k);
    if (v === 'owner') return true;

    /* ③ 默认访客（不再自动授予站长权限） */
    localStorage.setItem(k, 'guest');
    return false;
  } catch(e){ return false; }
})();

/* 供调试：地址栏加 ?owner=1 / ?owner=0，或在控制台调用
   window.__setOwner(true) / window.__setOwner(false) 切换身份 */
window.__setOwner = function(on){
  try { localStorage.setItem('yh_owner', on ? 'owner' : 'guest'); } catch(e){}
  location.href = location.pathname + (on ? '?owner=1' : '?owner=0');
};

/* ==========================================================
   0.5 WebP 支持检测 + 图片地址改写
   ----------------------------------------------------------
   站内所有照片都同时放了 .jpg（兜底）和 .webp（体积约为 1/4）。
   页面里写的永远是 .jpg，真正赋 src 时经过这里换掉后缀 ——
   这样 HTML 不用写成 <picture>，改一处就能覆盖全部图片。

   浏览器不支持 WebP 时返回原 .jpg，不会出现空白图。
   ========================================================== */
window.__WEBP = (function(){
  try {
    const c = document.createElement('canvas');
    return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch(e){ return false; }
})();

/* 把 assets/xxx.jpg?v=N 换成 assets/xxx.webp?v=N
   已经是 webp / 非 jpg 的地址原样返回，避免误伤音频、视频。
   share-card 例外：它是社交平台分享卡，只有 jpg，且平台不认 webp。 */
window.__webpUrl = function(u){
  if (!u || !window.__WEBP) return u;
  if (u.indexOf('share-card') !== -1) return u;
  return u.replace(/\.jpe?g(\?|#|$)/i, '.webp$1');
};

/* 给一个 <img> 赋地址：自动挑 webp / jpg，并对 webp 加载失败做兜底。
   失败兜底很重要 —— 有些老浏览器的 canvas 支持 webp，但 <img> 其实不行。 */
window.__setImg = function(img, url){
  if (!img || !url) return;
  const w = window.__webpUrl(url);
  if (w === url){ img.src = url; return; }
  img.addEventListener('error', function onErr(){
    img.removeEventListener('error', onErr);
    img.src = url;                 // 退回 jpg
  });
  img.src = w;
};

/* ==========================================================
   0. 明暗主题（自由切换 + 本地记忆）
   ========================================================== */
(function initTheme(){
  const KEY = 'yh_theme';
  const root = document.documentElement;
  const btn  = document.getElementById('themeToggle');

  function apply(mode){
    if (mode === 'dark') root.setAttribute('data-theme','dark');
    else root.removeAttribute('data-theme');
    if (btn) {
      btn.setAttribute('aria-checked', mode === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', mode === 'dark' ? '切换到亮色主题' : '切换到暗色主题');
      btn.title = mode === 'dark' ? '切换到亮色主题' : '切换到暗色主题';
    }
  }

  // 读取记忆；无记忆时跟随系统偏好
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch(e){}
  const prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  apply(saved ? saved : (prefersDark ? 'dark' : 'light'));

  if (btn) {
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      // 加过渡类，切完移除，避免影响后续正常动画
      root.classList.add('theme-anim');
      apply(next);
      try { localStorage.setItem(KEY, next); } catch(e){}
      clearTimeout(window.__themeT);
      window.__themeT = setTimeout(() => root.classList.remove('theme-anim'), 1100);
    });
  }

  window.__toggleTheme = () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.classList.add('theme-anim');
    apply(next);
    try { localStorage.setItem(KEY, next); } catch(e){}
    clearTimeout(window.__themeT);
    window.__themeT = setTimeout(() => root.classList.remove('theme-anim'), 1100);
  };
})();

const allSlides = Array.from(document.querySelectorAll('.slide'));

/* ----------------------------------------------------------
   分支屏（.branch-slide）不参与主翻页序列：
   正常向下翻只会经过主序列，分支屏仅在被点击时"跳出"显示
   ---------------------------------------------------------- */
const branchSlides = allSlides.filter(s => s.classList.contains('branch-slide'));
const slides = allSlides.filter(s => !s.classList.contains('branch-slide'));

const deck   = document.getElementById('deck');
const dotsBox= document.getElementById('dots');
const curNumEl = document.getElementById('curNum');
const totalNumEl = document.getElementById('totalNum');
const pageHint = document.getElementById('pageHint');
const nav = document.getElementById('nav');

let cur = 0;
let animating = false;
const DURATION = 1000;                 // 与 CSS transition 对齐
totalNumEl.textContent = slides.length;

/* 游戏屏索引（0 基，主序列内） */
const GAME_INDEX = slides.findIndex(s => s.classList.contains('game-slide'));

/* ---------- 构建右侧圆点（仅主序列） ---------- */
slides.forEach((s, i) => {
  const b = document.createElement('button');
  b.setAttribute('data-label', s.dataset.label || ('第 ' + (i+1) + ' 屏'));
  b.setAttribute('aria-label', s.dataset.label || ('第 ' + (i+1) + ' 屏'));
  b.addEventListener('click', () => goTo(i));
  dotsBox.appendChild(b);
});
const dots = Array.from(dotsBox.children);

/* ---------- 应用分页模式 ---------- */
document.documentElement.classList.add('deck-mode');

/* 每屏绝对定位：主序列按序排；分支屏叠在影像记忆那一格上（同一位置，靠 z-index 覆盖） */
let slideH = innerHeight;
function layout(){
  slideH = innerHeight;
  slides.forEach((s, i) => {
    s.style.top = (i * slideH) + 'px';
    s.style.height = slideH + 'px';
    s.style.zIndex = '1';
  });
  // 分支屏统一放在「影像记忆」所在行的位置上
  const mediaIdx = slides.findIndex(s => s.id === 's4');
  const rowIdx = mediaIdx < 0 ? 0 : mediaIdx;
  branchSlides.forEach(s => {
    s.style.top = (rowIdx * slideH) + 'px';
    s.style.height = slideH + 'px';
  });
  deck.style.transform = 'translateY(' + (-cur * slideH) + 'px)';
}
layout();
window.addEventListener('resize', layout);

/* ---------- 翻页核心 ---------- */
const navLogo = document.getElementById('navLogo');
const guide = document.getElementById('guide');
const guideText = document.getElementById('guideText');
const LAST = slides.length - 1;

let branchOpen = null;                 // 当前打开的分支屏（null = 未打开）

function setActive(){
  slides.forEach((s, i) => s.classList.toggle('active', i === cur));
  // 分支屏激活态由 openBranch/closeBranch 单独管理
  dots.forEach((d, i) => {
    d.classList.toggle('on', i === cur);
    // 已看过的屏点亮为暖色（含当前屏）
    if (i <= cur) d.classList.add('seen');
  });
  curNumEl.textContent = cur + 1;

  // 渲染当前屏内的 .reveal
  slides[cur].querySelectorAll('.reveal').forEach(el => el.classList.add('in'));

  // 游戏屏：离开时暂停
  if (window.__gamePause && cur !== GAME_INDEX) window.__gamePause();

  // 首屏雪花只在首屏显示
  const snow = document.getElementById('snowLayer');
  if (snow) snow.style.opacity = (cur === 0) ? '' : '0';

  // 左上角名字：仅首屏显示
  if (navLogo) navLogo.classList.toggle('fade', cur !== 0);

  // 引导标志：显示"下一屏"名称；最后一屏显示回到开头
  updateGuide();
  updatePager();
}

/* ---------- 右下角双向箭头：首尾隐藏对应箭头 ---------- */
const pagerPrev = document.getElementById('pagerPrev');
const pagerNext = document.getElementById('pagerNext');

function updatePager(){
  if (pagerPrev) pagerPrev.classList.toggle('hidden', cur === 0);
  if (pagerNext) pagerNext.classList.toggle('hidden', cur === LAST);
}

function pulse(el){
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;          // 强制重排以重启动画
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 520);
}

/* 每屏的幽默引导语（引导到下一屏）· 仅对应主序列 */
const GUIDE_LINES = [
  '别停在这儿，<b>往下看看我是谁</b>',            // 0 首页 → 关于我
  '关于我讲完了，<b>来看看我最近在忙啥</b>',        // 1 关于我 → 此刻
  '现在的我说完了，<b>翻回过去听听故事</b>',        // 2 此刻 → 童年回忆
  '故事太多了，<b>给你看点照片和视频</b>',          // 3 童年回忆 → 影像记忆
  '想看更多？<b>点开那三个抽屉翻翻</b>',            // 4 影像记忆 → 她他它
  '人聊完了，<b>说句正经的</b>',                    // 5 她他它 → 一句话
  '话说完了，<b>前面有块果冻在等你</b>',            // 6 一句话 → 捏一捏
  '捏爽了吗？<b>来玩个小游戏吧</b>',                // 7 捏一捏 → 小游戏
  '玩累了？<b>去星空里留句话</b>',                  // 8 小游戏 → 星空留言墙
  '星星收下了，<b>最后说两句真的</b>',              // 9 星空 → 联系与感谢
  '就到这里啦，<b>想我了就回开头看看</b>'          // 10 最后 → 回到开头
];

function updateGuide(){
  if (!guide) return;
  const line = GUIDE_LINES[cur] || GUIDE_LINES[GUIDE_LINES.length - 1];
  guideText.innerHTML = line;
  guide.classList.remove('hidden');
}

// 引导标志点击翻页
if (guide) {
  guide.addEventListener('click', () => { cur < LAST ? next() : goTo(0); });
  guide.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cur < LAST ? next() : goTo(0); }
  });
}

function goTo(i, instant){
  i = Math.max(0, Math.min(slides.length - 1, i));
  // 若正打开着某个分支相册，翻页时先把它收起来
  if (branchOpen) closeBranch(true);
  if (i === cur && !animating) return;
  cur = i;
  setActive();
  // 让每屏内的可滚动区域回到顶部
  slides[cur].scrollTop = 0;
  // 进入游戏屏时重新计算画布尺寸
  if (i === GAME_INDEX && typeof fitGameStage === 'function') {
    requestAnimationFrame(fitGameStage);
    setTimeout(fitGameStage, 380);
  }
  if (instant) {
    deck.style.transition = 'none';
    deck.style.transform = 'translateY(' + (-cur * slideH) + 'px)';
    void deck.offsetHeight;              // 强制 reflow，确保无动画立即到位
    requestAnimationFrame(() => {
      deck.style.transition = '';
      animating = false;
    });
  } else {
    // 允许中途打断：不拒绝新的翻页请求
    animating = true;
    deck.style.transition = '';
    deck.style.transform = 'translateY(' + (-cur * slideH) + 'px)';
    clearTimeout(goTo._t);
    goTo._t = setTimeout(() => { animating = false; }, DURATION);
  }
  /* 翻到这一屏了 → 解锁屏内所有「待命」的图片（写着 data-src 的那些）。
     主序列所有屏在 DOM 里是同时存在的，远端的屏虽然看不见，
     但浏览器仍可能去下载里面的图；统一改成翻到时才赋 src。
     解锁过就记在 __imgsArmed 上，来回翻不会重复赋值。 */
  armSlideImgs(slides[cur]);
}

/* 解锁一屏里所有 data-src 图片。幂等，可重复调用。 */
function armSlideImgs(sl){
  if (!sl || sl.__imgsArmed) return;
  const pend = sl.querySelectorAll('img[data-src]');
  if (!pend.length) return;
  sl.__imgsArmed = true;
  pend.forEach(img => {
    window.__setImg(img, img.dataset.src);   // 自动挑 webp / jpg
    img.removeAttribute('data-src');
  });
}
function next(){ goTo(cur + 1); }
function prev(){ goTo(cur - 1); }

/* ---------- 分支相册：跳出 / 收回 ---------- */

/* ⚠️ 关键陷阱：.deck 上有 transform（翻页靠 translateY 实现）。
   浏览器规范规定：position:fixed 若落在「有 transform 的祖先」内部，
   就改为相对那个祖先定位，而不是视口。
   于是分支屏里的返回键会被 deck 的整体位移带跑（s4 在索引 4 → 往上跑 4 屏高）。
   解法：打开分支时把返回键按钮「临时挂到 body」，彻底脱离 deck；
   关闭时再放回原来的分支屏里，保持结构和样式一致。 */
function parkBackButtons(el){
  const backs = el.querySelectorAll('.branch-back, .branch-back-fab');
  backs.forEach(b => {
    if (!b.dataset.owner) b.dataset.owner = el.id;
    if (b.parentElement !== document.body) document.body.appendChild(b);
    b.classList.add('bb-parked');   // 仅挂 body 期间显示
  });
}
function restoreBackButtons(slotId){
  document.querySelectorAll('body > .branch-back, body > .branch-back-fab').forEach(b => {
    const host = document.getElementById(b.dataset.owner || slotId || '');
    if (host) host.appendChild(b);
    b.classList.remove('bb-parked');
  });
}

function openBranch(el){
  if (!el) return;
  if (branchOpen && branchOpen !== el) closeBranch(true);

  branchOpen = el;
  el.style.zIndex = '30';           // 压在影像记忆屏之上

  /* 这个分支屏里的图平时只写着 data-src，到这里才真正赋 src。
     好处：没打开过的分支屏一张图都不会下载（s4a 有 16 张约 4.5MB），
     手机端首屏能省掉一大半流量。赋过一次的会记在 __srcDone 上，不重复赋。 */
  if (!el.__srcDone){
    el.__srcDone = true;
    el.querySelectorAll('img[data-src]').forEach(img => {
      window.__setImg(img, img.dataset.src);   // 自动挑 webp / jpg
      img.removeAttribute('data-src');
    });
  }

  el.classList.add('open');
  el.querySelectorAll('.reveal').forEach(x => x.classList.add('in'));
  document.documentElement.classList.add('branch-mode');

  /* 这个分支屏里的环形相册（人像 s4b / 日常 s4c）平时只挂 data-src，
     到这里才「上膛」——把整个环的图一次性拉下来。
     好处：没打开过的分支相册一张图都不会下载，手机端首屏省一大截。 */
  ['ring-faces', 'ring-daily'].forEach(id => {
    const r = el.querySelector('#' + id);
    if (r && r.__ring && typeof r.__ring.armImgs === 'function') r.__ring.armImgs();
  });

  // 返回键搬出 deck，fixed 才真正相对视口
  parkBackButtons(el);

  // 焦点移到返回键，方便键盘 / 读屏
  const back = document.querySelector('body > .branch-back.bb-parked');
  if (back) back.focus({ preventScroll: true });
}

function closeBranch(silent){
  const el = branchOpen;
  if (!el) return;
  branchOpen = null;
  el.classList.remove('open');
  el.style.zIndex = '';
  document.documentElement.classList.remove('branch-mode');

  // 返回键放回原分支屏，保持 DOM 整洁
  restoreBackButtons(el.id);

  // 收回后把焦点还给影像记忆屏里的入口按钮
  const opener = document.querySelector('[data-jump="' + el.id + '"]');
  if (opener && !silent) opener.focus({ preventScroll: true });
}
window.openBranch = openBranch;
window.closeBranch = closeBranch;

/* 键盘 Esc 关闭分支相册 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && branchOpen) closeBranch();
});

/* 初始化激活态 */
setActive();
/* 首屏的「待命」图片要立刻解锁 —— goTo 只在用户翻页时才跑，
   初始这一屏不能等它。 */
armSlideImgs(slides[cur]);

/* ---------- 游戏屏自适应：精确计算画布可用高度，保证永不溢出 ---------- */
function fitGameStage(){
  const slide = document.getElementById('s7');
  const canvas = document.getElementById('gameCanvas');
  if (!slide || !canvas) return;
  const wrap = slide.querySelector('.wrap');
  const head = slide.querySelector('.sec-head');
  const stage = slide.querySelector('.game-stage');
  const hud = slide.querySelector('.game-hud');
  if (!wrap || !head || !stage) return;

  // slide 自身的内边距
  const cs = getComputedStyle(slide);
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  const vh = slide.clientHeight || innerHeight;
  const avail = vh - padT - padB;

  const headH = head.offsetHeight;
  const stageCS = getComputedStyle(stage);
  const stagePadT = parseFloat(stageCS.paddingTop) || 0;
  const stagePadB = parseFloat(stageCS.paddingBottom) || 0;
  const stageGap = parseFloat(stageCS.rowGap || stageCS.gap) || 0;
  const hudH = hud ? hud.offsetHeight : 0;
  const stageMb = parseFloat(getComputedStyle(stage).marginBottom) || 0;

  // 画布可用高度 = 总可用 - 标题 - 舞台内边距 - HUD - 间隙（多留 30px 安全余量）
  let h = avail - headH - stagePadT - stagePadB - hudH - stageGap - stageMb - 40;

  const RATIO = 400 / 320;                       // 画布宽高比
  const maxW = Math.min(wrap.clientWidth || 340, 340);
  const byH = Math.max(180, Math.floor(h));
  const byW = Math.floor(maxW * RATIO);
  const finalH = Math.min(byH, byW, 420);
  const finalW = Math.round(finalH / RATIO);

  canvas.style.width  = finalW + 'px';
  canvas.style.height = finalH + 'px';
}
window.addEventListener('resize', fitGameStage);
window.addEventListener('load', fitGameStage);
document.fonts && document.fonts.ready && document.fonts.ready.then(fitGameStage);

/* ==========================================================
   1. 滚轮：只滚当前屏内容，不翻页
   - 屏内内容溢出 → 正常滚动（不阻止 default）
   - 内容不溢出 / 已到边界 → 阻止默认滚动，避免整页抖动
   - 翻页完全交给箭头 / 圆点 / 键盘
   ========================================================== */
window.addEventListener('wheel', e => {
  const slide = slides[cur];
  const canScroll = slide.scrollHeight > slide.clientHeight + 4;
  if (!canScroll) { e.preventDefault(); return; }
  const atTop = slide.scrollTop <= 0;
  const atBottom = slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
  // 到达边界后继续同方向滚动：吃掉它，避免穿透到 body 造成抖动
  if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) e.preventDefault();
}, {passive:false});

/* ==========================================================
   2. 键盘翻页
   ========================================================== */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  // 游戏进行中不翻页
  if (window.__gameRunning && window.__gameRunning()) return;
  switch(e.key){
    case 'ArrowDown': case 'ArrowRight': case 'PageDown': case ' ': case 'j': e.preventDefault(); next(); break;
    case 'ArrowUp': case 'ArrowLeft': case 'PageUp': case 'k': e.preventDefault(); prev(); break;
    case 'Home': e.preventDefault(); goTo(0); break;
    case 'End': e.preventDefault(); goTo(slides.length - 1); break;
  }
});

/* ==========================================================
   3. 导航栏 / 两侧热区 / 移动端滑动
   ========================================================== */
document.querySelectorAll('[data-slide]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); goTo(+a.dataset.slide); });
});
if (pagerPrev) pagerPrev.addEventListener('click', () => { pulse(pagerPrev); prev(); });
if (pagerNext) pagerNext.addEventListener('click', () => { pulse(pagerNext); next(); });

let tsY = null, tsX = null;
window.addEventListener('touchstart', e => {
  tsY = e.touches[0].clientY; tsX = e.touches[0].clientX;
}, {passive:true});
window.addEventListener('touchend', e => {
  if (tsY === null) return;
  const dy = e.changedTouches[0].clientY - tsY;
  const dx = e.changedTouches[0].clientX - tsX;
  // 纵向滑动为主才翻页
  if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx)) {
    const slide = slides[cur];
    const canScroll = slide.scrollHeight > slide.clientHeight + 4;
    if (canScroll) {
      const atTop = slide.scrollTop <= 0;
      const atBottom = slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
      if ((dy < 0 && !atBottom) || (dy > 0 && !atTop)) return;
    }
    if (dy < 0) next(); else prev();
  }
  tsY = tsX = null;
}, {passive:true});

/* ==========================================================
   4. 鼠标跟随光晕（lerp）
   ========================================================== */
const glow = document.getElementById('cursorGlow');
let gx = innerWidth/2, gy = innerHeight/2, tx = gx, ty = gy;
window.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; glow.style.opacity = 1; }, {passive:true});
(function loopGlow(){
  gx += (tx - gx) * 0.08;
  gy += (ty - gy) * 0.08;
  glow.style.left = gx + 'px';
  glow.style.top  = gy + 'px';
  requestAnimationFrame(loopGlow);
})();

/* ==========================================================
   5. 光标拖尾光点
   ========================================================== */
const TRAIL_N = 6;
const trail = [];
for (let i = 0; i < TRAIL_N; i++) {
  const d = document.createElement('div');
  d.className = 'trail-dot';
  document.body.appendChild(d);
  trail.push({el:d, x:tx, y:ty, life:0});
}
let lastX = tx, lastY = ty;
window.addEventListener('mousemove', e => {
  const speed = Math.hypot(e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX; lastY = e.clientY;
  if (speed > 18) {
    const t = trail.find(p => p.life <= 0) || trail[0];
    t.x = e.clientX; t.y = e.clientY; t.life = 1;
  }
}, {passive:true});
(function loopTrail(){
  trail.forEach(p => {
    if (p.life > 0) {
      p.life -= 0.028;
      p.el.style.opacity = Math.max(0, p.life) * 0.85;
      p.el.style.transform = `translate(${p.x - 4}px,${p.y - 4}px) scale(${0.5 + p.life})`;
    } else {
      p.el.style.opacity = 0;
    }
  });
  requestAnimationFrame(loopTrail);
})();

/* ==========================================================
   5.5 点击水波纹（弥散光晕扩散）
   ========================================================== */
(function clickRipple(){
  if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const N = 5;                       // 池化复用，避免频繁建节点
  const pool = [];
  for (let i = 0; i < N; i++) {
    const d = document.createElement('div');
    d.className = 'click-ripple';
    document.body.appendChild(d);
    pool.push(d);
  }
  let idx = 0;
  window.addEventListener('pointerdown', e => {
    const d = pool[idx++ % N];
    d.style.left = e.clientX + 'px';
    d.style.top  = e.clientY + 'px';
    d.classList.remove('go');
    void d.offsetWidth;              // 重启动画
    d.classList.add('go');
  }, {passive:true});
})();

/* ==========================================================
   6. 卡片 3D 微倾（带纵深与光斑跟随）
   ========================================================== */
if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
  const MAX = 7;      // 最大倾角（度）
  document.querySelectorAll('.tilt').forEach(card => {
    let raf = 0, tx = 0, ty = 0, sc = 1;

    function apply(){
      raf = 0;
      card.style.transform =
        'perspective(1000px) rotateY(' + (tx * MAX).toFixed(2) + 'deg) ' +
        'rotateX(' + (-ty * MAX).toFixed(2) + 'deg) ' +
        'translateY(-5px) scale(' + sc.toFixed(3) + ')';
    }

    card.addEventListener('mouseenter', () => {
      card.classList.add('tilting');
    });

    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;    // 0~1
      const py = (e.clientY - r.top) / r.height;
      tx = px - 0.5;
      ty = py - 0.5;
      sc = 1.02;
      // 光斑位置
      card.style.setProperty('--tilt-mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--tilt-my', (py * 100).toFixed(1) + '%');
      if (!raf) raf = requestAnimationFrame(apply);
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('tilting');
      card.style.transform = '';
      card.style.removeProperty('--tilt-mx');
      card.style.removeProperty('--tilt-my');
    });
  });
}

/* ==========================================================
   9.6 分支相册：点击卡片"跳出"相册，不占用主翻页序列
   打开 / 关闭（含遮罩、Esc、焦点还原）
   ========================================================== */
(function branchNav(){
  document.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.jump);
      if (!target) return;
      openBranch(target);
    });
  });

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => closeBranch());
  });

  /* 相册清单：assets/albums.json 里写了哪些图，就自动填进对应的环。
     该清单由「相册生成器」或你手动维护；没有清单时保持优雅占位，零请求零报错。 */
  const SLOT_PREFIX = { s4a:'travel', s4b:'food', s4c:'daily' };
  const RING_ID     = { s4a:'ring-travel', s4b:'ring-food', s4c:'ring-daily' };

  function applyAlbum(id, prefix, files){
    const ringEl = document.getElementById(RING_ID[id]);
    if (!ringEl) return;
    /* 环的挂载在主脚本末尾，可能还没执行完 —— 等一下再试 */
    if (!ringEl.__ring){ setTimeout(() => applyAlbum(id, prefix, files), 120); return; }
    /* 把清单里的图按顺序套到前 N 张卡上：只改 src 并取消占位态 */
    const cards = [...ringEl.querySelectorAll('.ring-card')];
    files.slice(0, cards.length).forEach((name, i) => {
      const card = cards[i];
      const face = card.querySelector('.ring-face');
      const titleEl = face && face.querySelector('.ring-title');
      const subEl   = face && face.querySelector('.ring-sub');
      if (!face) return;

      const old = face.querySelector('img');
      if (old) old.remove();

      const img = document.createElement('img');
      img.src = 'assets/' + name;
      img.alt = titleEl ? titleEl.textContent : '相册照片';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.style.zIndex = '2';
      img.onload = () => { card.classList.remove('ph'); };
      img.onerror = () => { img.remove(); card.classList.add('ph'); };  // 失败就退回占位，不报错
      face.insertBefore(img, face.firstChild);

      if (subEl) subEl.textContent = '摘自 · ' + name;
    });
  }

  // 用 XHR 静默读取清单（不存在的资源不会污染控制台）
  (function readManifest(){
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'assets/albums.json', true);
      xhr.onreadystatechange = function(){
        if (xhr.readyState !== 4) return;
        if (xhr.status !== 200) return;      // 没清单：静默保持占位
        let data;
        try { data = JSON.parse(xhr.responseText); } catch(e){ return; }
        Object.keys(SLOT_PREFIX).forEach(id => {
          const prefix = SLOT_PREFIX[id];
          const files = data[prefix];
          if (Array.isArray(files) && files.length) applyAlbum(id, prefix, files);
        });
      };
      xhr.send();
    } catch(e) {}
  })();
})();

/* ==========================================================
   9.7 手机端：科技角折叠交互（桌面端不受影响）
   ========================================================== */
(function mobileTechFold(){
  const box = document.querySelector('#s2 .tech-corner');
  if (!box) return;
  const label = box.querySelector('.now-label');
  if (!label) return;

  label.setAttribute('role', 'button');
  label.setAttribute('tabindex', '0');
  label.setAttribute('aria-expanded', 'false');

  function toggle(){
    // 仅在窄屏生效；桌面端标签不可点
    if (!window.matchMedia('(max-width:700px)').matches) return;
    const open = box.classList.toggle('open');
    label.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  label.addEventListener('click', toggle);
  label.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  // 从窄屏拉宽时自动复位，避免残留折叠态
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width:700px)').matches) {
      box.classList.remove('open');
      label.setAttribute('aria-expanded', 'false');
    }
  });
})();

/* ==========================================================
   7. 磁吸按钮
   ========================================================== */
if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
  document.querySelectorAll('.magnetic').forEach(el => {
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width/2);
      const dy = e.clientY - (r.top + r.height/2);
      el.style.transform = `translate(${dx * 0.18}px,${dy * 0.18}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ==========================================================
   8. 背景光晕随鼠标视差
   ========================================================== */
if (window.matchMedia('(pointer:fine)').matches) {
  const auras = document.querySelectorAll('.aura span');
  const sheens = document.querySelectorAll('.motion .sheen');
  window.addEventListener('mousemove', e => {
    const dx = e.clientX / innerWidth - 0.5;
    const dy = e.clientY / innerHeight - 0.5;
    auras.forEach((el, i) => {
      const depth = (i + 1) * 7;
      el.style.marginLeft = (dx * depth) + 'px';
      el.style.marginTop  = (dy * depth) + 'px';
    });
    // 光带做反向视差，制造纵深
    sheens.forEach((el, i) => {
      const depth = (i + 1) * 11;
      el.style.marginLeft = (dx * -depth) + 'px';
      el.style.marginTop  = (dy * -depth * 0.6) + 'px';
    });
  }, {passive:true});
}

/* ==========================================================
   8b. 背景漂浮微粒（动态感）
   ========================================================== */
(function dustField(){
  const box = document.getElementById('motionBg');
  if (!box) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const small = innerWidth < 700;
  const COUNT = small ? 14 : 30;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < COUNT; i++){
    const d = document.createElement('span');
    d.className = 'dust';
    const size = (small ? 3 : 4) + Math.random() * (small ? 5 : 9);
    const dur  = 26 + Math.random() * 34;             // 26~60s 缓慢上浮
    const delay = -Math.random() * dur;               // 负延迟 → 一开始就分布在各处
    d.style.width  = size.toFixed(1) + 'px';
    d.style.height = size.toFixed(1) + 'px';
    d.style.left   = (Math.random() * 100).toFixed(2) + '%';
    d.style.bottom = '-8vh';
    d.style.setProperty('--dust-op', (0.20 + Math.random() * 0.42).toFixed(2));
    d.style.setProperty('--dust-dx', ((Math.random() - 0.5) * 14).toFixed(1) + 'vw');
    d.style.animationDuration = dur.toFixed(1) + 's';
    d.style.animationDelay = delay.toFixed(1) + 's';
    frag.appendChild(d);
  }
  box.appendChild(frag);
})();

/* ==========================================================
   9. 回忆卡片：跟随高光 + 点击展开
   ========================================================== */
document.querySelectorAll('.mem-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  }, {passive:true});

  card.addEventListener('click', () => card.classList.toggle('open'));
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('open'); }
  });
});

/* ==========================================================
   9.5 影像记忆：点击翻转卡片
   照片卡：点击/悬停翻转；视频卡：点击翻转（视频控件正常可用）
   翻到背面时自动暂停视频
   ========================================================== */
document.querySelectorAll('.flip').forEach(card => {  card.addEventListener('click', e => {
    // 点在视频本体上：交给浏览器处理播放/暂停/进度，不翻转
    if (e.target.tagName === 'VIDEO') return;
    card.classList.toggle('flipped');
    if (!card.classList.contains('flipped')) return;
    // 翻到背面时暂停视频
    const v = card.querySelector('video');
    if (v && !v.paused) v.pause();
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.classList.toggle('flipped');
    }
  });
});

/* ==========================================================
   10. 首页雪花（鼠标可拨开）· 仅在首屏
   ========================================================== */
(function snow(){
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const layer = document.getElementById('snowLayer');
  const COUNT = innerWidth < 700 ? 24 : 46;
  const flakes = [];
  let mx = -999, my = -999;

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'flake';
    const size = 2 + Math.random() * 5;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.opacity = (0.4 + Math.random() * 0.5).toFixed(2);
    layer.appendChild(el);
    flakes.push({
      el,
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight - innerHeight,
      vy: 0.35 + Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 0.5,
      sway: Math.random() * Math.PI * 2,
      swaySpd: 0.008 + Math.random() * 0.016,
      r: size
    });
  }

  window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, {passive:true});

  (function loop(){
    for (const f of flakes) {
      f.sway += f.swaySpd;
      f.y += f.vy;
      f.x += f.vx + Math.sin(f.sway) * 0.35;

      const dx = f.x - mx, dy = f.y - my;
      const d2 = dx*dx + dy*dy;
      if (d2 < 12000) {
        const d = Math.sqrt(d2) || 1;
        const force = (1 - d / 110) * 2.6;
        f.x += (dx / d) * force;
        f.y += (dy / d) * force;
      }

      if (f.y > innerHeight + 20) { f.y = -20; f.x = Math.random() * innerWidth; }
      if (f.x < -20) f.x = innerWidth + 20;
      if (f.x > innerWidth + 20) f.x = -20;

      f.el.style.transform = `translate(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px)`;
    }
    requestAnimationFrame(loop);
  })();
})();

/* ==========================================================
   11. 小游戏（接雪花）· 已作为第 8 屏
   页脚 ✦ 可随时跳转过去
   ========================================================== */
(function game(){
  const overlay= document.getElementById('gameOverlay');
  const startBtn= document.getElementById('gameStart');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('gameScore');
  const bestEl  = document.getElementById('gameBest');
  const GAME_SLIDE = GAME_INDEX;  const W = canvas.width, H = canvas.height;
  const BASKET = { w: 74, h: 12, x: W/2 - 37, y: H - 34, speed: 7 };
  let flakes = [], keys = {}, running = false, score = 0, raf = null, spawnT = 0, dragX = null;
  let best = +(localStorage.getItem('yh_snow_best') || 0);
  bestEl.textContent = best;

  /* ---------- 音效（Web Audio 实时合成，无需素材文件） ---------- */
  const SFX = (function(){
    let ac = null, master = null, enabled = true;
    let lastHit = 0;
    function ensure(){
      if (ac) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      return ac;
    }
    function resume(){ const a = ensure(); if (a && a.state === 'suspended') a.resume(); }
    function setEnabled(v){
      enabled = v;
      if (master) master.gain.value = v ? 0.5 : 0;
      try { localStorage.setItem('yh_game_sfx', v ? '1' : '0'); } catch(e){}
    }
    try { enabled = localStorage.getItem('yh_game_sfx') !== '0'; } catch(e){}

    // 基础发声器：一段带包络的振荡
    function tone(freq, dur, type, vol, slideTo){
      if (!enabled) return;
      const a = ensure(); if (!a) return;
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || .3, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + .02);
    }

    // 接住雪花：清脆的双音铃声，音高随连击上升
    function hit(combo){
      const now = performance.now();
      if (now - lastHit < 45) return;
      lastHit = now;
      const step = Math.min(12, combo || 0);
      const base = 660 * Math.pow(2, step / 12);
      tone(base, 0.16, 'sine', .28);
      setTimeout(() => tone(base * 1.5, 0.13, 'triangle', .16), 42);
    }

    // 漏掉雪花 / 游戏结束：下滑的叹息
    function miss(){
      tone(320, 0.55, 'sine', .30, 90);
      setTimeout(() => tone(180, 0.6, 'sawtooth', .12, 60), 90);
    }

    // 开始 / 重开：上扬的起跑音
    function start(){
      resume();
      tone(392, 0.12, 'triangle', .22);
      setTimeout(() => tone(587, 0.14, 'triangle', .22), 90);
      setTimeout(() => tone(784, 0.20, 'triangle', .24), 180);
    }

    // 破纪录：小凯旋
    function record(){
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => tone(f, 0.22, 'triangle', .26), i * 95);
      });
    }

    return { hit, miss, start, record, resume, setEnabled, get enabled(){ return enabled; } };
  })();

  function reset(){
    flakes = []; score = 0; spawnT = 0; BASKET.x = W/2 - BASKET.w/2;
    scoreEl.textContent = 0;
  }

  const bgImg = new Image();
  bgImg.src = window.__webpUrl('assets/game-scene.jpg?v=5');

  function drawBg(){
    ctx.clearRect(0,0,W,H);
    // 画布内：淡淡的雪雾，作为游戏场地的"玻璃层"
    // 整屏水彩背景已由 #s7::before 提供，此处只做柔光过渡
    const g2 = ctx.createLinearGradient(0, 0, 0, H);
    g2.addColorStop(0, 'rgba(255,255,255,.16)');
    g2.addColorStop(.45, 'rgba(246,250,255,.07)');
    g2.addColorStop(1, 'rgba(226,238,252,.20)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    // 地面雪线
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 22);
    ctx.quadraticCurveTo(W*0.35, H - 30, W*0.6, H - 20);
    ctx.quadraticCurveTo(W*0.85, H - 12, W, H - 24);
    ctx.stroke();
  }

  function drawBasket(){
    const g = ctx.createLinearGradient(BASKET.x, 0, BASKET.x + BASKET.w, 0);
    g.addColorStop(0, '#ffb99a');
    g.addColorStop(.5, '#f7a8c4');
    g.addColorStop(1, '#c9a7eb');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(BASKET.x, BASKET.y, BASKET.w, BASKET.h, 6);
    } else {
      const r = 6, x = BASKET.x, y = BASKET.y, w = BASKET.w, hh = BASKET.h;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + hh, r);
      ctx.arcTo(x + w, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    ctx.fill();
  }

  function drawFlake(f){
    // 淡影：让雪花在浅色雪景背景上也清晰
    ctx.save();
    ctx.shadowColor = 'rgba(80,110,170,.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1.5;
    const g = ctx.createRadialGradient(f.x - f.r*0.3, f.y - f.r*0.3, 0, f.x, f.y, f.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, 'rgba(228,238,252,.95)');
    g.addColorStop(1, 'rgba(150,180,225,.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    // 细描边增强轮廓
    ctx.strokeStyle = 'rgba(90,120,180,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
    ctx.stroke();
  }

  function tick(){
    if (!running) return;
    drawBg();

    spawnT--;
    if (spawnT <= 0) {
      flakes.push({
        x: 20 + Math.random() * (W - 40),
        y: -10,
        r: 4 + Math.random() * 4,
        vy: 0.85 + Math.random() * 1.15,
        sway: Math.random() * 6.28
      });
      spawnT = Math.max(24, 46 - Math.floor(score / 6) * 4);
    }

    if (keys['ArrowLeft']  || keys['a'] || keys['A']) BASKET.x -= BASKET.speed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) BASKET.x += BASKET.speed;
    if (dragX !== null) BASKET.x = dragX - BASKET.w/2;
    BASKET.x = Math.max(0, Math.min(W - BASKET.w, BASKET.x));

    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.sway += 0.03;
      f.y += f.vy;
      f.x += Math.sin(f.sway) * 0.7;
      drawFlake(f);

      if (f.y + f.r >= BASKET.y && f.y - f.r <= BASKET.y + BASKET.h &&
          f.x >= BASKET.x - f.r && f.x <= BASKET.x + BASKET.w + f.r) {
        flakes.splice(i, 1);
        score++;
        scoreEl.textContent = score;
        SFX.hit(score);
        continue;
      }
      if (f.y - f.r > H) {
        flakes.splice(i, 1);
        SFX.miss();
        endGame();
        return;
      }
    }

    drawBasket();
    raf = requestAnimationFrame(tick);
  }

  function startGame(){
    reset();
    overlay.style.display = 'none';
    running = true;
    SFX.start();
    cancelAnimationFrame(raf);
    tick();
  }

  function endGame(){
    running = false;
    cancelAnimationFrame(raf);
    let isNew = false;
    if (score > best) {
      best = score;
      localStorage.setItem('yh_snow_best', best);
      bestEl.textContent = best;
      isNew = true;
    }
    overlay.style.display = 'flex';
    if (isNew) SFX.record();
    overlay.querySelector('.big').textContent = isNew ? '新纪录！' : '雪停了';
    overlay.querySelectorAll('span')[1].textContent =
      isNew ? ('接住 ' + score + ' 朵 · 破了自己的记录') : ('本次接住 ' + score + ' 朵雪花');
    startBtn.textContent = '再来一次';
  }

  function pauseGame(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  startBtn.addEventListener('click', e => { e.stopPropagation(); startGame(); });
  document.addEventListener('keydown', e => { keys[e.key] = true; });
  document.addEventListener('keyup',   e => { keys[e.key] = false; });

  // 触屏 / 鼠标拖动
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return (t.clientX - r.left) * (W / r.width);
  };
  canvas.addEventListener('touchstart', e => { e.preventDefault(); dragX = pos(e); }, {passive:false});
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); dragX = pos(e); }, {passive:false});
  canvas.addEventListener('touchend',   () => { dragX = null; });
  canvas.addEventListener('mousemove',  e => { if (running) dragX = pos(e); });
  canvas.addEventListener('mouseleave', () => { dragX = null; });

  // 供翻页逻辑调用
  window.__gamePause = pauseGame;
  window.__gameRunning = () => running;

  /* ---------- 音效开关 ---------- */
  const sfxBtn = document.getElementById('sfxToggle');
  if (sfxBtn){
    function paintSfx(){
      sfxBtn.textContent = SFX.enabled ? '🔊' : '🔇';
      sfxBtn.classList.toggle('off', !SFX.enabled);
    }
    paintSfx();
    sfxBtn.addEventListener('click', e => {
      e.stopPropagation();
      SFX.setEnabled(!SFX.enabled);
      paintSfx();
      if (SFX.enabled) SFX.hit(1);
    });
  }

})();


/* ==========================================================
   11.5 弹性果冻网格（捏一捏）
   原生 Canvas 移植：弹簧质点网格 + 文字距离场 + 高斯膨胀
   ========================================================== */
(function elasticJelly(){
  const stage  = document.getElementById('jellyStage');
  const canvas = document.getElementById('jellyCanvas');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const TEXT  = 'Petrichor';
  const COLOR = '#1fa3ff';
  const INFLATE  = 1;      // 膨胀场强度
  const STIFFNESS= .35;    // 弹簧刚度（越大越硬）
  const WOBBLE   = .85;    // 摆动幅度（阻尼比越小越晃）

  const NX = 132, NY = 84; // 网格分辨率（9 个字母需要更细的网格）
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 网格状态 ---------- */
  let W = 1, H = 1, DPR = 1;
  let rest = new Float32Array(NX * NY * 2);   // 静止位置
  let pos  = new Float32Array(NX * NY * 2);   // 当前位置
  let vel  = new Float32Array(NX * NY * 2);   // 速度（位置）
  let velH = new Float32Array(NX * NY);       // 速度（高度场）
  let target = new Float32Array(NX * NY);     // 高度场目标（0~1）
  let height = new Float32Array(NX * NY);     // 当前高度场
  let heightPrev = new Float32Array(NX * NY);
  let grip = new Float32Array(NX * NY);       // 抓取权重
  let base = new Float32Array(NX * NY);       // 文字遮罩（距离场结果）
  let field = new Float32Array(NX * NY);      // 膨胀后遮罩
  const fieldTmp = new Float32Array(NX * NY);

  /* ---------- 颜色工具 ---------- */
  function hexToRgb(h){
    h = h.replace('#','');
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    const n = parseInt(h, 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  const RGB = hexToRgb(COLOR);

  /* ---------- 二维索引 ---------- */
  const idx = (x, y) => y * NX + x;

  /* ---------- 1. 文字 → 距离场（Felzenszwalb 两遍扫描） ---------- */
  function buildTextMask(){
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const oc = off.getContext('2d');
    oc.fillStyle = '#fff';
    // 字号自适应：先测宽度，保证文字整体占画布宽度 ~78% 且不超高
    let fs = Math.min(W * 0.30, H * 0.55);
    oc.font = '900 ' + fs + 'px "Playfair Display", "Songti SC", serif';
    const tw = oc.measureText(TEXT).width;
    const maxW = W * 0.78;
    if (tw > maxW){ fs = fs * maxW / tw; oc.font = '900 ' + fs + 'px "Playfair Display", "Songti SC", serif'; }
    oc.textAlign = 'center';
    oc.textBaseline = 'middle';
    oc.fillText(TEXT, W/2, H/2);
    const data = oc.getImageData(0, 0, W, H).data;

    // 采样到网格，取 alpha
    const cellW = W / (NX - 1), cellH = H / (NY - 1);
    const inside = new Uint8Array(NX * NY);
    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        const px = Math.min(W-1, Math.round(x * cellW));
        const py = Math.min(H-1, Math.round(y * cellH));
        const a = data[(py * W + px) * 4 + 3];
        inside[idx(x,y)] = a > 110 ? 1 : 0;
      }
    }

    // 距离场：两遍扫描逼近到最近实心点的距离
    const INF = 1e9;
    const d = new Float32Array(NX * NY);
    for (let i = 0; i < d.length; i++) d[i] = inside[i] ? -1 : INF;
    // 正向
    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        let v = d[idx(x,y)];
        if (y > 0)            v = Math.min(v, d[idx(x,y-1)] + 1);
        if (x > 0)            v = Math.min(v, d[idx(x-1,y)] + 1);
        if (x > 0 && y > 0)   v = Math.min(v, d[idx(x-1,y-1)] + 1.41);
        if (x < NX-1 && y > 0)v = Math.min(v, d[idx(x+1,y-1)] + 1.41);
        d[idx(x,y)] = v;
      }
    }
    // 反向
    for (let y = NY-1; y >= 0; y--){
      for (let x = NX-1; x >= 0; x--){
        let v = d[idx(x,y)];
        if (y < NY-1) v = Math.min(v, d[idx(x,y+1)] + 1);
        if (x < NX-1) v = Math.min(v, d[idx(x+1,y)] + 1);
        if (x < NX-1 && y < NY-1) v = Math.min(v, d[idx(x+1,y+1)] + 1.41);
        if (x > 0   && y < NY-1)  v = Math.min(v, d[idx(x-1,y+1)] + 1.41);
        d[idx(x,y)] = v;
      }
    }
    // 归一化成 0~1 的"厚度"：内部 1，边缘逐渐降为 0
    const R = 1.7;   // 过渡带宽度（网格单位）
    for (let i = 0; i < d.length; i++){
      const dist = d[i];                      // 负值 = 在字形内部
      let v;
      if (dist < 0) v = 1;
      else v = Math.max(0, 1 - dist / R);
      // 平滑一下边缘
      base[i] = v * v * (3 - 2 * v);
    }
  }

  /* ---------- 2. 高斯膨胀：多尺度模糊，让顶点连成整块果冻 ---------- */
  function blur(src, dst, passes){
    const tmp = fieldTmp;
    for (let p = 0; p < passes; p++){
      // X 方向
      for (let y = 0; y < NY; y++){
        for (let x = 0; x < NX; x++){
          const a = src[idx(Math.max(0,x-1), y)];
          const b = src[idx(x, y)];
          const c = src[idx(Math.min(NX-1,x+1), y)];
          tmp[idx(x,y)] = (a + 2*b + c) * 0.25;
        }
      }
      // Y 方向
      for (let y = 0; y < NY; y++){
        for (let x = 0; x < NX; x++){
          const a = tmp[idx(x, Math.max(0,y-1))];
          const b = tmp[idx(x, y)];
          const c = tmp[idx(x, Math.min(NY-1,y+1))];
          dst[idx(x,y)] = (a + 2*b + c) * 0.25;
        }
      }
    }
  }

  function buildField(){
    // 先拷贝 base
    field.set(base);
    // 轻度模糊：只把笔画的锐边糊开一点点，形成"鼓起"的果冻感
    blur(field, fieldTmp, 1);
    const k = Math.min(1, INFLATE) * 0.26;
    for (let i = 0; i < field.length; i++){
      field[i] = Math.max(base[i], fieldTmp[i] * k + base[i] * (1 - k));
      field[i] = Math.min(1, Math.pow(field[i], 0.96));
    }
  }

  /* ---------- 布局 ---------- */
  let cx = 0, cy = 0;
  function layout(){
    const r = stage.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width));
    H = Math.max(2, Math.round(r.height * 0.92));
    DPR = Math.min(devicePixelRatio || 1, 2);
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    cx = W / 2; cy = H / 2;
    const cw = W / (NX - 1), ch = H / (NY - 1);
    for (let y = 0; y < NY; y++){
      // 网格整体稍微压扁成"枕头"形状，两端下垂
      const ny = y / (NY - 1);
      for (let x = 0; x < NX; x++){
        const nx = x / (NX - 1);
        const i2 = idx(x,y) * 2;
        const px = x * cw;
        // 让网格更像一块圆角的果冻块：边缘轻微收缩
        const edge = Math.sin(nx * Math.PI) * 0.06 + Math.sin(ny * Math.PI) * 0.04;
        const py = y * ch + (1 - edge) * 0;
        rest[i2]   = pos[i2]   = px;
        rest[i2+1] = pos[i2+1] = py;
        vel[i2] = vel[i2+1] = 0;
      }
    }

    buildTextMask();
    buildField();

    // 初始高度：直接怼到目标，避免开场抖动
    for (let i = 0; i < target.length; i++){
      target[i] = field[i];
      height[i] = field[i];
      heightPrev[i] = field[i];
      grip[i] = 0;
    }
  }

  /* ---------- 物理求解 ---------- */
  let grabW = 0;         // 抓取总权重
  let dragX = 0, dragY = 0;
  let downX = 0, downY = 0, moved = 0;
  let gOffX = 0, gOffY = 0;   // 抓取偏移（tanh 限幅）

  function grab(px, py){
    dragX = px; dragY = py;
    downX = px; downY = py;
    gOffX = 0; gOffY = 0;
    grabW = 0;
    const R = Math.max(W, H) * 0.34;
    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        const i = idx(x,y), i2 = i*2;
        const dx = pos[i2] - px, dy = pos[i2+1] - py;
        const d2 = dx*dx + dy*dy;
        const w = Math.exp(-d2 / (R*R));
        grip[i] = w;
        grabW += w;
      }
    }
  }

  function updateGrip(px, py){
    dragX = px; dragY = py;
    if (grabW <= 0) return;
    const dx = px - downX, dy = py - downY;
    // tanh 限制整体拖拽距离，防止撕碎
    gOffX = Math.tanh(dx / (W * 0.5)) * (W * 0.36);
    gOffY = Math.tanh(dy / (H * 0.5)) * (H * 0.32);
  }

  function release(){
    for (let i = 0; i < grip.length; i++) grip[i] = 0;
    grabW = 0;
  }

  function poke(px, py, power){
    const R = Math.min(W, H) * 0.34;
    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        const i = idx(x,y), i2 = i*2;
        const dx = pos[i2] - px, dy = pos[i2+1] - py;
        const d2 = dx*dx + dy*dy;
        const w = Math.exp(-d2 / (R*R));
        // 冲量：把节点朝外推一点（形成鼓包）
        const n = Math.max(0.001, Math.sqrt(d2));
        velH[i] += power * w;                    // 高度方向
        vel[i2]   += (w * power * 0.5) * (dx / n);
        vel[i2+1] += (w * power * 0.5) * (dy / n);
      }
    }
  }

  const STEP = 1/120;
  let acc = 0;

  function solve(dt){
    const firm = 0.4 + STIFFNESS * 1.2;
    const anchor = 350 * firm * firm;                  // 回位刚度
    const couple = 70 * firm;                          // 邻接耦合
    const ratio  = Math.max(0.02, 0.28 * (1.35 - WOBBLE)); // 阻尼比
    const damp   = 2 * ratio * Math.sqrt(anchor);

    const cw = W / (NX - 1), ch = H / (NY - 1);

    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        const i = idx(x,y), i2 = i*2;

        // --- 位置：锚回静止点 + 邻接耦合 ---
        let ax = (rest[i2]   - pos[i2])   * anchor;
        let ay = (rest[i2+1] - pos[i2+1]) * anchor;

        // 抓取：朝 (静止点 + 拖拽偏移×权重) 施加额外的强弹簧
        if (grabW > 0 && grip[i] > 0.004){
          const gp = grip[i];
          ax += ((rest[i2]   + gOffX * gp) - pos[i2])   * anchor * 3.2 * gp;
          ay += ((rest[i2+1] + gOffY * gp) - pos[i2+1]) * anchor * 3.2 * gp;
        }

        if (x > 0){
          const j = idx(x-1,y);
          ax += (pos[j*2]   - pos[i2])   * couple;
          ay += (pos[j*2+1] - pos[i2+1]) * couple;
        }
        if (x < NX-1){
          const j = idx(x+1,y);
          ax += (pos[j*2]   - pos[i2])   * couple;
          ay += (pos[j*2+1] - pos[i2+1]) * couple;
        }
        if (y > 0){
          const j = idx(x,y-1);
          ax += (pos[j*2]   - pos[i2])   * couple;
          ay += (pos[j*2+1] - pos[i2+1]) * couple;
        }
        if (y < NY-1){
          const j = idx(x,y+1);
          ax += (pos[j*2]   - pos[i2])   * couple;
          ay += (pos[j*2+1] - pos[i2+1]) * couple;
        }

        vel[i2]   += (ax - damp * vel[i2])   * dt;
        vel[i2+1] += (ay - damp * vel[i2+1]) * dt;
        pos[i2]   += vel[i2]   * dt;
        pos[i2+1] += vel[i2+1] * dt;

        // --- 高度场：同样用弹簧，但只在握取时被拉低/推高 ---
        const hTarget = field[i];
        const hAnchor = 260 * firm;
        const hDamp   = 2 * ratio * Math.sqrt(hAnchor);
        const ah = (hTarget - height[i]) * hAnchor;
        velH[i] += (ah - hDamp * velH[i]) * dt;
        height[i] += velH[i] * dt;

        // 高度软限位
        if (height[i] < 0) { height[i] = 0; velH[i] *= -0.25; }
        if (height[i] > 1.35) { height[i] = 1.35; velH[i] *= -0.25; }

        void cw; void ch;
      }
    }
  }

  /* ---------- 渲染 ---------- */
  const heightS  = new Float32Array(NX * NY);  // 1 趟平滑：光照法线
  const heightSA = new Float32Array(NX * NY);  // 过渡用
  const heightA  = new Float32Array(NX * NY);  // 2 趟平滑：alpha（消马赛克）
  function smoothHeightOnce(dst, src){
    for (let y = 0; y < NY; y++){
      for (let x = 0; x < NX; x++){
        const i = idx(x,y);
        let s = src[i] * 2, n = 2;
        if (x > 0)    { s += src[i-1];  n++; }
        if (x < NX-1) { s += src[i+1];  n++; }
        if (y > 0)    { s += src[i-NX]; n++; }
        if (y < NY-1) { s += src[i+NX]; n++; }
        dst[i] = s / n;
      }
    }
  }
  function smoothHeight(){
    smoothHeightOnce(heightS, height);        // 光照：1 趟
    smoothHeightOnce(heightSA, height);
    smoothHeightOnce(heightA, heightSA);      // alpha：3 趟（彻底消除网格纹）
    smoothHeightOnce(heightSA, heightA);
    smoothHeightOnce(heightA, heightSA);
  }

  function draw(){
    ctx.clearRect(0, 0, W, H);
    smoothHeight();   // heightS = 1 趟轻度平滑（仅用于光照法线）

    const cellW = W / (NX - 1), cellH = H / (NY - 1);
    const [R,G,B] = RGB;

    // 背景柔光（在 canvas 上用 rgba 叠加，保证主题无关的果冻观感）
    const g = ctx.createRadialGradient(cx, cy, Math.min(W,H)*0.05, cx, cy, Math.max(W,H)*0.55);
    g.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.10)');
    g.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 逐四边形绘制，颜色由高度场决定（越高越亮）
    for (let y = 0; y < NY - 1; y++){
      for (let x = 0; x < NX - 1; x++){
        const i00 = idx(x,y), i10 = idx(x+1,y), i01 = idx(x,y+1), i11 = idx(x+1,y+1);
        // alpha 用 2 趟平滑高度（无马赛克），光照用 1 趟（保细节）
        const hA   = (heightA[i00] + heightA[i10] + heightA[i01] + heightA[i11]) * 0.25;
        const hAvg = (heightS[i00] + heightS[i10] + heightS[i01] + heightS[i11]) * 0.25;
        if (hA < 0.02) continue;

        // 伪法线：高度沿 x/y 的差分
        const hx = (heightS[i10] + heightS[i11] - heightS[i00] - heightS[i01]) * 0.5;
        const hy = (heightS[i01] + heightS[i11] - heightS[i00] - heightS[i10]) * 0.5;
        // 光照方向（左上打光）
        const lx = -0.42, ly = -0.60, lz = 0.68;
        let nxv = -hx * 1.5, nyv = -hy * 1.5, nzv = 1;
        const nl = Math.hypot(nxv, nyv, nzv) || 1;
        nxv /= nl; nyv /= nl; nzv /= nl;
        let lam = nxv*lx + nyv*ly + nzv*lz;
        lam = Math.max(0, lam);

        // 高光（Blinn-Phong 简化）
        const spec = Math.pow(lam, 26) * 0.85;
        // 边缘透光：高度低但仍可见的区域给一点通透感
        const rim = Math.pow(1 - Math.min(1, hA), 2) * 0.42;

        // 垂直渐变：上亮下深，模拟透光果冻
        const pyAvg = (pos[i00*2+1] + pos[i10*2+1] + pos[i01*2+1] + pos[i11*2+1]) * 0.25;
        const nyv2 = Math.min(1, Math.max(0, pyAvg / H));
        const shade = 1.22 - 0.5 * nyv2;

        const base = (0.26 + hAvg * 0.5) * shade;
        let r = R * base + 255 * spec + 255 * rim * 0.35;
        let gg= G * base + 255 * spec + 255 * rim * 0.45;
        let b = B * base + 255 * spec + 255 * rim * 0.55;

        // 加一点青色/品红分离的果冻色散
        r += hAvg * 12;
        b += hAvg * 22;

        const a = hA > 0.45 ? 1 : Math.min(1, hA * 2.2);   // 内部不透明，彻底无接缝
        ctx.fillStyle = 'rgba(' + (r|0) + ',' + (gg|0) + ',' + (b|0) + ',' + a.toFixed(3) + ')';

        const p00i = i00*2, p10i = i10*2, p01i = i01*2, p11i = i11*2;
        ctx.beginPath();
        ctx.moveTo(pos[p00i], pos[p00i+1]);
        ctx.lineTo(pos[p10i], pos[p10i+1]);
        ctx.lineTo(pos[p11i], pos[p11i+1]);
        ctx.lineTo(pos[p01i], pos[p01i+1]);
        ctx.closePath();
        ctx.fill();
        // 同色细描边：盖住相邻四边形的抗锯齿接缝（消除网格纹）
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        void cellW; void cellH;
      }
    }
  }

  /* ---------- 主循环 ---------- */
  let raf = 0, running = false, last = 0;

  function frame(now){
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    // 固定步长积分
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 30){ solve(STEP); acc -= STEP; n++; }

    // grip 需要持续施力（不是一次性位移）
    if (grabW > 0) updateGrip(dragX, dragY);

    // 高度场轻微回弹到 field，保证字始终可见
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start(){
    if (running) return;
    running = true;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop(){
    running = false;
    cancelAnimationFrame(raf);
  }

  /* ---------- 交互 ---------- */
  function toLocal(e){
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
  }

  let dragging = false;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toLocal(e);
    downX = x; downY = y; moved = 0;
    dragging = true;
    canvas.classList.add('grabbing');
    grab(x, y);
    poke(x, y, 0.55);
    start();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const [x, y] = toLocal(e);
    moved += Math.hypot(x - dragX, y - dragY);
    dragX = x; dragY = y;
  });
  function endDrag(e){
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('grabbing');
    // 甩出去：把当前拖动方向的速度留下来
    release();
    try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // 双击 = 用力戳一下
  canvas.addEventListener('dblclick', e => {
    const [x, y] = toLocal(e);
    poke(x, y, 1.5);
    start();
  });

  /* ---------- 尺寸与可见性 ---------- */
  let relayoutT = 0;
  function scheduleLayout(){
    clearTimeout(relayoutT);
    relayoutT = setTimeout(() => { layout(); start(); }, 120);
  }
  window.addEventListener('resize', scheduleLayout);

  // 仅在果冻屏可见时运行，省电
  const slideEl = document.getElementById('jelly');
  function sync(){
    const on = slideEl && slideEl.classList.contains('active');
    if (on){ if (!running){ layout(); start(); } }
    else stop();
  }
  if (slideEl){
    new MutationObserver(sync).observe(slideEl, { attributes:true, attributeFilter:['class'] });
  }

  const initT = setTimeout(() => { layout(); sync(); }, 60);
  window.addEventListener('load', () => { clearTimeout(initT); layout(); sync(); });
  document.fonts && document.fonts.ready && document.fonts.ready.then(() => { layout(); sync(); });

  if (REDUCE){
    // 降级：静态画一帧
    setTimeout(() => { layout(); draw(); }, 200);
  }

  // 供测试调用
  window.__jelly = { layout, start, stop, poke, draw, get size(){ return [W, H]; } };
})();

/* ==========================================================
   11.6B 流体溅射光标（捏一捏屏专用）
   ----------------------------------------------------------
   算法来自 Pavel Dobryakov 的 WebGL-Fluid-Simulation，
   这里从 React 组件移植为原生 JS，并做了三处本土化：
     1) 画布不自建事件监听，统一由 .jelly-stage 用 pointer 转发
        —— 天然同时支持鼠标与触屏，也不会和舞台里别的交互打架
     2) 只在「捏一捏」屏 active 时才跑 RAF，切走立刻停，不烧电
     3) 移动端/低配自动降分辨率，减少压力
   增强自由度的调参见 CFG 里的注释。
   ========================================================== */
(function fluidSplash(){
  const stage  = document.getElementById('jellyStage');
  const canvas = document.getElementById('fluidCanvas');
  const slideEl = document.getElementById('jelly');
  if (!stage || !canvas) return;

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 可调参数（增强自由度都集中在这里） ---------- */
  const _narrow = matchMedia('(max-width: 760px)').matches;
  const CFG = {
    /* 模拟网格分辨率：越大越细腻、越吃性能 */
    SIM_RESOLUTION:      _narrow ? 96  : 128,
    /* 染料分辨率：决定墨迹边缘的柔和度，1440 已经足够清晰 */
    DYE_RESOLUTION:      _narrow ? 720 : 1440,
    /* 墨迹消散速度 —— ★ 调小 = 痕迹留得更久（原版 3.5 太"转瞬即逝"）
       2.2 让甩出去的彩带能在屏幕上盘桓好几秒，玩起来更尽兴 */
    DENSITY_DISSIPATION: 2.2,
    /* 速度消散：调小 = 流体滑得更远 */
    VELOCITY_DISSIPATION: 1.6,
    PRESSURE:            0.1,
    PRESSURE_ITERATIONS: 20,
    /* 涡度（涡流）强度 —— ★ 调大 = 卷出的花更野（原版 3）
       本案提到 6，彩带会自己打旋、长出一圈圈小涡 */
    CURL:                6,
    /* 笔触粗细 —— ★ 调大 = 一次划过刷出更饱满的一大片（原版 0.2） */
    SPLAT_RADIUS:        0.32,
    /* 笔触力度 —— ★ 调大 = 甩出去更猛（原版 6000） */
    SPLAT_FORCE:         7200,
    /* 高光着色：让墨迹有立体感而不是一片死平的色块 */
    SHADING:             true,
    /* 换色频率 —— ★ 调大 = 颜色变化更快（原版 10）；这里 6 让每笔颜色更稳定 */
    COLOR_UPDATE_SPEED:  6,
    /* ★ 彩虹模式：每一笔都是随机色相，划过像打翻调色盘 */
    RAINBOW_MODE:        true,
    /* 非彩虹模式下的固定色（RAINBOW_MODE=false 时生效） */
    COLOR:               '#7fb3ff',
    /* 自动彩带：不操作时也会偶尔自动甩一笔，页面不"冷场" */
    AUTO_SPLAT:          true,
    AUTO_SPLAT_EVERY:    4.2,    /* 秒 */
    BACK_COLOR:          { r: 0, g: 0, b: 0 },
    /* 背景透明：让底下的弥散光晕透出来，墨迹像浮在雾里 */
    TRANSPARENT:         true
  };

  /* 低配/降级：要么用户偏好减少动效，要么 WebGL 不可用 */
  if (REDUCE){ canvas.style.display = 'none'; return; }

  /* ---------- 取 WebGL 上下文 ---------- */
  function getWebGLContext(cv){
    const params = { alpha:true, depth:false, stencil:false, antialias:false, preserveDrawingBuffer:false };
    let gl = cv.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = cv.getContext('webgl', params) || cv.getContext('experimental-webgl', params);
    if (!gl) return null;
    let halfFloat, supportLinearFiltering;
    if (isWebGL2){
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    gl.clearColor(0, 0, 0, 1);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    let formatRGBA, formatRG, formatR;
    if (isWebGL2){
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG   = getSupportedFormat(gl, gl.RG16F,   gl.RG,   halfFloatTexType);
      formatR    = getSupportedFormat(gl, gl.R16F,    gl.RED,  halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG   = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatR    = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }
    if (!formatRGBA) return null;
    return { gl, ext:{ formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
  }
  function getSupportedFormat(gl, internalFormat, format, type){
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)){
      switch (internalFormat){
        case gl.R16F:  return getSupportedFormat(gl, gl.RG16F,   gl.RG,   type);
        case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat, format };
  }
  function supportRenderTextureFormat(gl, internalFormat, format, type){
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  const ctx = getWebGLContext(canvas);
  if (!ctx){ canvas.style.display = 'none'; return; }   /* 没有 WebGL 就安静退出，页面照常用 */
  const gl = ctx.gl, ext = ctx.ext;
  if (!ext.supportLinearFiltering){ CFG.DYE_RESOLUTION = 256; CFG.SHADING = false; }

  /* ---------- 着色器 ---------- */
  function compileShader(type, source, keywords){
    source = addKeywords(source, keywords);
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(sh));
    return sh;
  }
  function addKeywords(source, keywords){
    if (!keywords) return source;
    let s = '';
    keywords.forEach(k => { s += '#define ' + k + '\n'; });
    return s + source;
  }
  function createProgram(vs, fs){
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(p));
    return p;
  }
  function getUniforms(program){
    const u = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){
      const name = gl.getActiveUniform(program, i).name;
      u[name] = gl.getUniformLocation(program, name);
    }
    return u;
  }
  function hashCode(s){
    if (!s.length) return 0;
    let h = 0;
    for (let i = 0; i < s.length; i++){ h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }
  class Material{
    constructor(vs, fsSource){ this.vs = vs; this.fsSource = fsSource; this.programs = []; this.activeProgram = null; this.uniforms = []; }
    setKeywords(keywords){
      let hash = 0;
      for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);
      let program = this.programs[hash];
      if (program == null){
        const fs = compileShader(gl.FRAGMENT_SHADER, this.fsSource, keywords);
        program = createProgram(this.vs, fs);
        this.programs[hash] = program;
      }
      if (program === this.activeProgram) return;
      this.uniforms = getUniforms(program); this.activeProgram = program;
    }
    bind(){ gl.useProgram(this.activeProgram); }
  }
  class Program{
    constructor(vs, fs){ this.program = createProgram(vs, fs); this.uniforms = getUniforms(this.program); }
    bind(){ gl.useProgram(this.program); }
  }

  const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);
  const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
  `);
  const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `);
  const displayShaderSource = `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uTexture; uniform vec2 texelSize;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;
        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);
        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);
        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
      #endif
      float a = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c, a);
    }
  `;
  const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;
    uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () {
      vec2 p = vUv - point.xy; p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `);
  const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
    uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
      #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
      #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
      #endif
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }
  `, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']);
  const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `);
  const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `);
  const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `);
  const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float C = texture2D(uPressure, vUv).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `);
  const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `);

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target, clear) => {
      if (target == null){
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear){ gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  let dye, velocity, divergence, curl, pressure;
  const copyProgram             = new Program(baseVertexShader, copyShader);
  const clearProgram            = new Program(baseVertexShader, clearShader);
  const splatProgram            = new Program(baseVertexShader, splatShader);
  const advectionProgram        = new Program(baseVertexShader, advectionShader);
  const divergenceProgram       = new Program(baseVertexShader, divergenceShader);
  const curlProgram             = new Program(baseVertexShader, curlShader);
  const vorticityProgram        = new Program(baseVertexShader, vorticityShader);
  const pressureProgram         = new Program(baseVertexShader, pressureShader);
  const gradienSubtractProgram  = new Program(baseVertexShader, gradientSubtractShader);
  const displayMaterial         = new Material(baseVertexShader, displayShaderSource);

  function initFramebuffers(){
    const simRes = getResolution(CFG.SIM_RESOLUTION);
    const dyeRes = getResolution(CFG.DYE_RESOLUTION);
    const texType = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    if (!dye) dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    if (!velocity) velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }
  function createFBO(w, h, internalFormat, format, type, param){
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width:w, height:h, texelSizeX:1/w, texelSizeY:1/h,
      attach(id){ gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }
    };
  }
  function createDoubleFBO(w, h, internalFormat, format, type, param){
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width:w, height:h, texelSizeX:fbo1.texelSizeX, texelSizeY:fbo1.texelSizeY,
      get read(){ return fbo1; }, set read(v){ fbo1 = v; },
      get write(){ return fbo2; }, set write(v){ fbo2 = v; },
      swap(){ const t = fbo1; fbo1 = fbo2; fbo2 = t; }
    };
  }
  function resizeFBO(target, w, h, internalFormat, format, type, param){
    const newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
  }
  function resizeDoubleFBO(target, w, h, internalFormat, format, type, param){
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w; target.height = h;
    target.texelSizeX = 1/w; target.texelSizeY = 1/h;
    return target;
  }

  function updateKeywords(){
    const k = [];
    if (CFG.SHADING) k.push('SHADING');
    displayMaterial.setKeywords(k);
  }
  updateKeywords();
  initFramebuffers();

  /* ---------- 指针（只留一个，简化） ---------- */
  const pointer = {
    texcoordX:0, texcoordY:0, prevTexcoordX:0, prevTexcoordY:0,
    deltaX:0, deltaY:0, down:false, moved:false, color:{ r:0.15, g:0.15, b:0.15 }
  };
  let colorTimer = 0;
  let lastTime = performance.now();
  let autoTimer = 0;

  function updateColors(dt){
    colorTimer += dt * CFG.COLOR_UPDATE_SPEED;
    if (colorTimer >= 1){ colorTimer = wrap(colorTimer, 0, 1); pointer.color = generateColor(); }
  }
  function applyInputs(){
    if (pointer.moved){ pointer.moved = false; splatPointer(pointer); }
  }
  function step(dt){
    gl.disable(gl.BLEND);
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, CFG.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write); velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, CFG.PRESSURE);
    blit(pressure.write); pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < CFG.PRESSURE_ITERATIONS; i++){
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, CFG.VELOCITY_DISSIPATION);
    blit(velocity.write); velocity.swap();

    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, CFG.DENSITY_DISSIPATION);
    blit(dye.write); dye.swap();
  }
  function render(target){
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    const width  = target == null ? gl.drawingBufferWidth  : target.width;
    const height = target == null ? gl.drawingBufferHeight : target.height;
    displayMaterial.bind();
    if (CFG.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1/width, 1/height);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    blit(target);
  }
  function splatPointer(p){
    const dx = p.deltaX * CFG.SPLAT_FORCE;
    const dy = p.deltaY * CFG.SPLAT_FORCE;
    splat(p.texcoordX, p.texcoordY, dx, dy, p.color);
  }
  function clickSplat(p){
    const color = generateColor();
    color.r *= 10; color.g *= 10; color.b *= 10;
    splat(p.texcoordX, p.texcoordY, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), color);
  }
  function splat(x, y, dx, dy, color){
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(CFG.SPLAT_RADIUS / 100));
    blit(velocity.write); velocity.swap();
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write); dye.swap();
  }
  function correctRadius(radius){
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  /* ---------- 坐标换算：舞台内坐标 → 画布像素 ---------- */
  function toCanvas(e){
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: Math.floor((e.clientX - r.left) * dpr),
      y: Math.floor((e.clientY - r.top)  * dpr)
    };
  }
  function setDown(e){
    const p = toCanvas(e);
    pointer.down = true; pointer.moved = false;
    pointer.texcoordX = p.x / canvas.width;
    pointer.texcoordY = 1 - p.y / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0; pointer.deltaY = 0;
    pointer.color = generateColor();
    clickSplat(pointer);          /* 按下就先炸开一小团 */
  }
  function setMove(e){
    const p = toCanvas(e);
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = p.x / canvas.width;
    pointer.texcoordY = 1 - p.y / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    if (pointer.moved && Math.random() < 0.35) pointer.color = generateColor();  /* 划过时也随机换色，彩带更斑斓 */
  }
  function correctDeltaX(delta){
    const a = canvas.width / canvas.height;
    if (a < 1) delta *= a;
    return delta;
  }
  function correctDeltaY(delta){
    const a = canvas.width / canvas.height;
    if (a > 1) delta /= a;
    return delta;
  }

  function generateColor(){
    if (!CFG.RAINBOW_MODE){
      let val = CFG.COLOR.replace('#', '');
      if (val.length === 3) val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
      return {
        r: parseInt(val.slice(0,2),16)/255 * 0.15,
        g: parseInt(val.slice(2,4),16)/255 * 0.15,
        b: parseInt(val.slice(4,6),16)/255 * 0.15
      };
    }
    /* ★ 彩虹模式微调：把色相锁在「蓝—紫—粉—青」这段冷调区间，
       避免随机到大红大绿跟本站的弥散风撞色；饱和度略收，观感更高级 */
    const h = (0.53 + Math.random() * 0.30) % 1;      // 0.53~0.83 → 青蓝→紫→品红
    const c = hsv2rgb(h, 0.78, 1);
    return { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
  }
  function hsv2rgb(h, s, v){
    let r, g, b;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6){
      case 0: r=v; g=t; b=p; break;
      case 1: r=q; g=v; b=p; break;
      case 2: r=p; g=v; b=t; break;
      case 3: r=p; g=q; b=v; break;
      case 4: r=t; g=p; b=v; break;
      default: r=v; g=p; b=q; break;
    }
    return { r, g, b };
  }
  function wrap(value, min, max){
    const range = max - min;
    if (range === 0) return min;
    return ((value - min) % range) + min;
  }
  function getResolution(resolution){
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }
  function scaleByPixelRatio(input){
    return Math.floor(input * (window.devicePixelRatio || 1));
  }
  function resizeCanvas(){
    const w = scaleByPixelRatio(canvas.clientWidth);
    const h = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      return true;
    }
    return false;
  }

  /* ---------- 事件：挂在舞台上（pointer 事件 = 鼠标 + 触屏通吃） ---------- */
  let bound = false;
  function down(e){ setDown(e); }
  function move(e){ setMove(e); }
  function up(){ pointer.down = false; }
  function bind(){
    if (bound) return;
    /* ⚠️ 事件挂在 stage 上（不是 canvas 上），因为：
       - 果冻 canvas 盖在流体层上面，pointerdown 会先命中它
       - 它没有 stopPropagation，所以事件会冒泡到 stage，这里能一并收到
       - 好处：拖果冻的时候，流体跟着画轨迹，两个效果叠加 */
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    /* 鼠标移出舞台就断开笔触，免得"隔空画画" */
    stage.addEventListener('pointerleave', up);
    bound = true;
  }
  function unbind(){
    if (!bound) return;
    stage.removeEventListener('pointerdown', down);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
    stage.removeEventListener('pointerleave', up);
    bound = false;
  }

  /* ---------- 主循环 ---------- */
  let raf = 0, running = false;
  function frame(){
    if (!running) return;
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastTime = now;

    if (resizeCanvas()) initFramebuffers();
    updateColors(dt);
    applyInputs();

    /* 自动彩带：闲置一会儿就自己甩一笔，别让画面冷下来 */
    if (CFG.AUTO_SPLAT){
      autoTimer += dt;
      if (autoTimer > CFG.AUTO_SPLAT_EVERY){
        autoTimer = 0;
        const c = generateColor();
        c.r *= 12; c.g *= 12; c.b *= 12;
        splat(
          Math.random(), Math.random(),
          (Math.random() - 0.5) * 1400,
          (Math.random() - 0.5) * 1400,
          c
        );
      }
    }

    step(dt);
    render(null);
    raf = requestAnimationFrame(frame);
  }
  function start(){
    if (running) return;
    /* 用户希望"只在进入这一屏才跑" —— 省电，也不打扰别的屏 */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running = true;
    lastTime = performance.now();
    bind();
    raf = requestAnimationFrame(frame);
  }
  function stop(){
    running = false;
    if (raf){ cancelAnimationFrame(raf); raf = 0; }
    unbind();
  }

  /* 进出「捏一捏」屏时自动开关 */
  function sync(){
    const on = slideEl && slideEl.classList.contains('active');
    if (on){ resizeCanvas(); initFramebuffers(); start(); }
    else stop();
  }
  if (slideEl){
    new MutationObserver(sync).observe(slideEl, { attributes:true, attributeFilter:['class'] });
  }
  window.addEventListener('resize', () => { clearTimeout(sync._t); sync._t = setTimeout(() => { if (running){ resizeCanvas(); initFramebuffers(); } }, 160); });
  window.addEventListener('load', () => { resizeCanvas(); initFramebuffers(); sync(); });
  setTimeout(() => { resizeCanvas(); initFramebuffers(); sync(); }, 80);

  /* 供测试/调参 */
  window.__fluid = {
    start, stop, sync,
    splat(nx, ny, dx, dy){
      const c = generateColor(); c.r *= 12; c.g *= 12; c.b *= 12;
      splat(nx, ny, dx || 800, dy || 0, c);
    },
    CFG,
    get running(){ return running; },
    get canvas(){ return canvas; }
  };
})();


/* ==========================================================
   11.7 语录抽签
   ========================================================== */
(function quoteDraw(){
  const box  = document.getElementById('quoteBox');
  const txt  = document.getElementById('quoteText');
  const cite = document.getElementById('quoteCite');
  const btn  = document.getElementById('drawQuote');
  if (!box || !btn) return;

  const QUOTES = [
    { t: '且视他人凝目如盏盏鬼火，<br><em>大胆地去走你的夜路。</em>', c: '— 史铁生《病隙碎笔》' },
    { t: '我从未如此尊重过<br><em>春日，潮汐和自己。</em>', c: '— 写给自己' },
    { t: '于千万人之中遇见你所要遇见的人，<br><em>于千万年之中，时间的无涯的荒野里。</em>', c: '— 张爱玲《爱》' },
    { t: '回忆这东西若是有气味的话，<br>那就是樟脑的香，甜而稳妥，<br><em>像记得分明的快乐，甜而怅惘。</em>', c: '— 张爱玲《更衣记》' },
    { t: 'It does not do to dwell on dreams<br><em>and forget to live.</em>', c: '— J.K. Rowling, Harry Potter' },
    { t: 'Happiness can be found even in the darkest of times,<br><em>if one only remembers to turn on the light.</em>', c: '— J.K. Rowling, Harry Potter' },
    { t: '雨停之后，泥土苏醒的味道，<br><em>英文里有个专门的名字：Petrichor。</em>', c: '— 关于一个我很喜欢的词' },
    { t: '那些看似毫无意义的重复，<br><em>后来都成了我的底子。</em>', c: '— 关于学英语这件事' },
    { t: '雪会化，照片会旧，<br><em>但那天笑得很开心的我，是真的。</em>', c: '— 2008 的冬天' },
    { t: '不必急着看清全局，<br><em>走好脚下这一步就够了。</em>', c: '— 写给自己' }
  ];

  let last = 0;   // 避免连续抽到同一条
  let busy = false;

  function pick(){
    if (busy) return;
    busy = true;
    let i;
    do { i = Math.floor(Math.random() * QUOTES.length); } while (i === last && QUOTES.length > 1);
    last = i;

    btn.classList.add('spin');
    box.classList.add('swap');
    cite.classList.add('swap');

    setTimeout(() => {
      txt.innerHTML = QUOTES[i].t;
      cite.textContent = QUOTES[i].c;
      box.classList.remove('swap');
      cite.classList.remove('swap');
      setTimeout(() => { btn.classList.remove('spin'); busy = false; }, 260);
    }, 320);
  }

  btn.addEventListener('click', pick);
})();

/* ==========================================================
   11.8 声音明信片（Web Audio 现场合成环境音）
   ========================================================== */
(function soundPostcard(){
  const wrap = document.getElementById('soundPostcard');
  if (!wrap) return;
  const btns = wrap.querySelectorAll('.sp-btn');
  const status = document.getElementById('spStatus');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ac = null, master = null, current = null, currentName = '';
  let noiseBuf = null;      // 复用白噪声缓冲
  let outTimer = null;      // 场景增益的淡出计时器
  let masterTimer = null;   // master 增益的计时器（独立，避免互相打断）

  const LABEL = { snow: '雪落', rain: '雨停', wind: '风过', bowl: '空山' };
  const DESC = {
    snow: '很轻的沙沙声，像雪片落在棉帽上',
    rain: '雨刚停，屋檐还在滴水，空气是湿的',
    wind: '远处的风穿过树枝，忽远忽近',
    bowl: '一声很长的余响，像站在空山里'
  };

  function ensure(){
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    return ac;
  }

  // 调试出口（可在控制台读状态）
  window.__sp = {
    get state(){ return ac ? ac.state : 'none'; },
    get masterGain(){ return master ? master.gain.value : -1; },
    get outGain(){ return current && current.gain ? current.gain.gain.value : -1; },
    get vol(){ return current && current.targetVol ? current.targetVol : -1; },
    get currentName(){ return currentName; },
    get nodeCount(){ return current ? current.length : 0; }
  };

  function getNoise(){
    if (noiseBuf) return noiseBuf;
    const len = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let l = 0;
    for (let i = 0; i < len; i++){
      const w = Math.random() * 2 - 1;
      l = (l + 0.02 * w) / 1.02;
      d[i] = l * 3.2;             // 棕噪声（更接近自然声）
    }
    noiseBuf = buf;
    return buf;
  }

  function noiseSource(){
    const s = ac.createBufferSource();
    s.buffer = getNoise();
    s.loop = true;
    return s;
  }

  function stopCurrent(){
    clearInterval(outTimer);
    if (!current) return;
    const old = current, oldGain = current.gain;
    let v = Math.max(0.0001, oldGain.gain.value);
    const step = v / 12;
    outTimer = setInterval(() => {
      v -= step;
      if (v <= 0.0005){
        clearInterval(outTimer);
        try { old.forEach(n => n.stop && n.stop()); } catch(e){}
        try { oldGain.disconnect(); } catch(e){}
      } else {
        try { oldGain.gain.value = v; } catch(e){}
      }
    }, 40);
    current = null;
  }

  /* 场景增益淡入：每个场景独立计时器，保证一定到达目标音量 */
  let scenTimer = null;
  function fadeScene(g, to, ms){
    clearInterval(scenTimer);
    const from = Math.max(0.0001, g.gain.value);
    const t0 = performance.now();
    scenTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      try { g.gain.value = from + (to - from) * e; } catch(err){}
      if (k >= 1){ clearInterval(scenTimer); try { g.gain.value = to; } catch(err){} }
    }, 30);
  }

  /* master 增益淡入/淡出：独立计时器，且有兜底保证一定到达目标值 */
  function fadeMaster(to, ms){
    clearInterval(masterTimer);
    const g = master; if (!g) return;
    const from = g.gain.value;
    const t0 = performance.now();
    masterTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      g.gain.value = from + (to - from) * e;
      if (k >= 1){ clearInterval(masterTimer); g.gain.value = to; }
    }, 30);
    // 兜底：即使计时器被节流，也确保最终值正确
    setTimeout(() => { if (g.gain.value !== to && Math.abs(g.gain.value - to) > 0.01) {} }, ms + 120);
  }

  /* --- 各场景的合成配方 --- */
  function buildSnow(){
    const nodes = [];
    const out = ac.createGain();
    // 高频雪沙：带通噪声
    const n = noiseSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.7;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1600;
    const ng = ac.createGain(); ng.gain.value = 0.60;
    n.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(out);
    // 低频"厚度"：证明不是纯电子噪声
    const n2 = noiseSource();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const ng2 = ac.createGain(); ng2.gain.value = 0.16;
    n2.connect(lp); lp.connect(ng2); ng2.connect(out);
    // 缓慢起伏（人耳听到的"哗——"）
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.12;
    lfo.connect(lfoG); lfoG.connect(ng.gain);
    lfo.start();
    n.start(); n2.start();
    nodes.push(n, n2, lfo);
    return { nodes, out, vol: 1.5 };
  }

  function buildRain(){
    const nodes = [];
    const out = ac.createGain();
    // 雨底噪
    const n = noiseSource();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 420;
    const ng = ac.createGain(); ng.gain.value = 0.52;
    n.connect(lp); lp.connect(hp); hp.connect(ng); ng.connect(out);
    // 间隔的"滴答"（屋檐滴水）
    let dropT = 0;
    const drops = [];
    for (let i = 0; i < 26; i++){
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900 + Math.random() * 1400, ac.currentTime + dropT);
      o.frequency.exponentialRampToValueAtTime(280, ac.currentTime + dropT + 0.09);
      g.gain.setValueAtTime(0.0001, ac.currentTime + dropT);
      g.gain.exponentialRampToValueAtTime(0.10 + Math.random() * 0.10, ac.currentTime + dropT + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dropT + 0.14);
      o.connect(g); g.connect(out);
      o.start(ac.currentTime + dropT); o.stop(ac.currentTime + dropT + 0.2);
      drops.push(o);
      dropT += 0.28 + Math.random() * 0.75;
      if (dropT > 3) break;
    }
    n.start();
    nodes.push(n);
    return { nodes, out, vol: 1.4, loopDrop: true };
  }

  function buildWind(){
    const nodes = [];
    const out = ac.createGain();
    const n = noiseSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.1;
    const ng = ac.createGain(); ng.gain.value = 0.7;
    n.connect(bp); bp.connect(ng); ng.connect(out);
    // 两个慢 LFO 让风速有强弱起伏
    const l1 = ac.createOscillator(); l1.frequency.value = 0.045;
    const g1 = ac.createGain(); g1.gain.value = 260;
    l1.connect(g1); g1.connect(bp.frequency);
    const l2 = ac.createOscillator(); l2.frequency.value = 0.028;
    const g2 = ac.createGain(); g2.gain.value = 0.22;
    l2.connect(g2); g2.connect(ng.gain);
    l1.start(); l2.start(); n.start();
    nodes.push(n, l1, l2);
    return { nodes, out, vol: 1.35 };
  }

  function buildBowl(){
    const nodes = [];
    const out = ac.createGain();
    // 钟声：基频 + 泛音，带长衰减
    const base = 196;
    [1, 2.76, 5.4, 8.9].forEach((mul, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = base * mul;
      const amp = 0.30 / (i + 1.4);
      const now = ac.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 7 - i * 0.9);
      o.connect(g); g.connect(out);
      o.start(now); o.stop(now + 8);
      nodes.push(o);
    });
    // 空气声垫底
    const n = noiseSource();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    const ng = ac.createGain(); ng.gain.value = 0.05;
    n.connect(lp); lp.connect(ng); ng.connect(out);
    n.start(); nodes.push(n);
    return { nodes, out, vol: 1.6, oneShot: true };
  }

  const BUILD = { snow: buildSnow, rain: buildRain, wind: buildWind, bowl: buildBowl };

  function play(name){
    const a = ensure();
    if (!a) { status.textContent = '这个浏览器不支持音频合成 :('; return; }
    if (a.state === 'suspended') a.resume();

    if (currentName === name){          // 再点一次 = 关掉
      stopCurrent();
      currentName = '';
      btns.forEach(b => b.classList.toggle('on', false));
      status.textContent = '— 已停下 —';
      return;
    }

    stopCurrent();
    if (reduce) { status.textContent = '（已按无障碍设置静音）'; return; }

    const built = BUILD[name]();
    built.out.connect(master);
    current = built.nodes.concat([built.out]);
    current.gain = built.out;
    currentName = name;

    btns.forEach(b => b.classList.toggle('on', b.dataset.scene === name));
    status.textContent = DESC[name];

    if (built.oneShot){
      // 钟声：只响一次，响完自动复位
      built.out.gain.value = built.vol;
      setTimeout(() => {
        if (currentName === name){
          btns.forEach(b => b.classList.toggle('on', false));
          currentName = '';
          status.textContent = '— 余响散了 —';
        }
      }, 7000);
    } else {
      // 从静音淡入到该场景的目标音量（关键：之前漏了这一步）
      built.out.gain.value = 0.0001;
      fadeScene(built.out, built.vol, 600);
      // 雨需要循环滴水
      if (built.loopDrop){
        const loopDrops = setInterval(() => {
          if (currentName !== 'rain'){ clearInterval(loopDrops); return; }
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine';
          const t = ac.currentTime;
          o.frequency.setValueAtTime(900 + Math.random() * 1400, t);
          o.frequency.exponentialRampToValueAtTime(280, t + 0.09);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.09, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          o.connect(g); g.connect(built.out);
          o.start(t); o.stop(t + 0.2);
        }, 620);
      }
    }
    fadeMaster(0.9, 500);
  }

  btns.forEach(b => b.addEventListener('click', () => play(b.dataset.scene)));

  // 离开这一屏时自动淡出（省电、也不打扰）
  const slide = document.getElementById('s6');
  if (slide){
    new MutationObserver(() => {
      if (!slide.classList.contains('active') && current){
        clearInterval(scenTimer);
        stopCurrent();
        currentName = '';
        btns.forEach(b => b.classList.toggle('on', false));
        fadeMaster(0, 350);
        status.textContent = '— 选一个，声音是用代码现场合成的 —';
      }
    }).observe(slide, { attributes:true, attributeFilter:['class'] });
  }
  // 页面隐藏时也停
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current){ stopCurrent(); currentName = ''; }
  });
})();

/* ==========================================================
   11.9 时间胶囊（生日解锁）
   ========================================================== */
(function timeCapsule(){
  const root    = document.getElementById('timeCapsule');
  if (!root) return;
  const writeEl = document.getElementById('tcWrite');
  const input   = document.getElementById('tcInput');
  const count   = document.getElementById('tcCount');
  const saveBtn = document.getElementById('tcSave');
  const lockedEl= document.getElementById('tcLocked');
  const unlockEl= document.getElementById('tcUnlockDate');
  const daysEl  = document.getElementById('tcDays');
  const openedEl= document.getElementById('tcOpened');
  const letterHead = document.getElementById('tcLetterHead');
  const letterBody  = document.getElementById('tcLetterBody');
  const againBtn = document.getElementById('tcAgain');
  const publicEl = document.getElementById('tcPublic');
  const publicWrap = document.getElementById('tcPublicWrap');
  const editBtn  = document.getElementById('tcEdit');
  const cancelBtn= document.getElementById('tcCancel');

  const KEY = 'yh_capsule_v1';
  const BIRTH = { m: 1, d: 1 };      // 生日：1 月 1 日

  /* ---------- 云端（复用留言板的 Supabase 连接，表名 capsule） ----------
     只有勾了"生日公开"的信才会上云；不勾就纯本机，别人永远看不到。 */
  const CLOUD = window.__CLOUD || null;
  const capsuleOn = () => !!(CLOUD && CLOUD.url && CLOUD.key);
  const CLOUD_TABLE = 'capsule';

  async function cloudPushCapsule(obj){
    if (!capsuleOn()) return false;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD_TABLE, {
        method: 'POST',
        headers: {
          apikey: CLOUD.key,
          Authorization: 'Bearer ' + CLOUD.key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(obj)
      });
      return r.ok;
    } catch(e){ return false; }
  }
  async function cloudDeleteCapsule(at){
    if (!capsuleOn() || !at) return false;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD_TABLE +
        '?at=eq.' + encodeURIComponent(at), {
        method: 'DELETE',
        headers: {
          apikey: CLOUD.key,
          Authorization: 'Bearer ' + CLOUD.key,
          Prefer: 'return=minimal'
        }
      });
      if (!r.ok) return false;
      // 回查确认（Supabase 删 0 行也返回 204）
      const chk = await fetch(CLOUD.url + '/rest/v1/' + CLOUD_TABLE +
        '?select=id&at=eq.' + encodeURIComponent(at) + '&limit=1',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } });
      if (!chk.ok) return true;
      const left = await chk.json();
      return Array.isArray(left) && left.length === 0;
    } catch(e){ return false; }
  }
  /* 读取所有已公开的信（生日当天展示用） */
  async function cloudFetchCapsule(){
    if (!capsuleOn()) return null;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD_TABLE +
        '?select=*&order=at.desc&limit=50',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } });
      if (!r.ok) return null;
      const arr = await r.json();
      return Array.isArray(arr) ? arr : null;
    } catch(e){ return null; }
  }
  /* 生日是否已到：跨年后的 1/1 当天（含之后）视为解锁 */
  function birthdayUnlocked(at){
    const now = new Date();
    const sealed = new Date(at);
    if (now.getFullYear() > sealed.getFullYear()) return true;
    return now.getMonth() === BIRTH.m - 1 && now.getDate() >= BIRTH.d &&
           now.getFullYear() >= sealed.getFullYear();
  }

  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  }
  function save(obj){
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch(e){}
  }

  /* 下一个 1 月 1 日（今天的生日也算今天可解锁） */
  function nextBirthday(from){
    const now = from || new Date();
    const y = now.getFullYear();
    const thisYear = new Date(y, BIRTH.m - 1, BIRTH.d, 0, 0, 0);
    // 生日当天 00:00 ~ 当天 23:59:59 视为可解锁
    const endOfDay = new Date(y, BIRTH.m - 1, BIRTH.d, 23, 59, 59);
    if (now <= endOfDay) return thisYear;
    return new Date(y + 1, BIRTH.m - 1, BIRTH.d, 0, 0, 0);
  }

  function daysBetween(a, b){
    const MS = 86400000;
    const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.max(0, Math.round((d2 - d1) / MS));
  }

  function isUnlockable(sealedAt){
    if (!sealedAt) return false;
    const now = new Date();
    // 与封存日期不同的年份，且到了 1 月 1 日 → 解锁
    if (now.getFullYear() <= new Date(sealedAt).getFullYear()) {
      // 同年：仅生日当天可开
      return now.getMonth() === BIRTH.m - 1 && now.getDate() === BIRTH.d;
    }
    return true;
  }

  const IS_OWNER = window.__IS_OWNER !== false;   // 访客为 false（全局判定，见脚本顶部）
  function render(){
    const data = load();
    writeEl.hidden  = true;
    lockedEl.hidden = true;
    openedEl.hidden = true;

    if (!data){
      /* 访客也能封存自己的信 —— 他的信只存在他自己的浏览器里
         （除非他勾了「生日公开」，那才会以别人的名义上云）。
         所以这里不再按身份隐藏写信区。 */
      writeEl.hidden = false;
      if (publicWrap) publicWrap.hidden = false;
      // 回填公开开关（新写时默认关闭）
      if (publicEl) publicEl.checked = false;
      return;
    }

    if (isUnlockable(data.at)){
      openedEl.hidden = false;
      const d = new Date(data.at);
      letterHead.textContent = '封存于 ' + d.getFullYear() + ' 年 ' + (d.getMonth()+1) + ' 月 ' + d.getDate() + ' 日' +
        (data.public ? ' · 已设为生日公开' : '');
      letterBody.textContent = data.text;
    } else {
      lockedEl.hidden = false;
      const nb = nextBirthday();
      unlockEl.textContent = nb.getFullYear() + ' 年 1 月 1 日';
      const n = daysBetween(new Date(), nb);
      daysEl.textContent = n === 0 ? '就是今天' : n;
      if (n === 0) daysEl.parentElement.innerHTML = '就是今天，去开封吧 ✨';
    }
  }

  if (input && count){
    input.addEventListener('input', () => {
      count.textContent = input.value.length + ' / 300';
    });
  }

  if (saveBtn){
    saveBtn.addEventListener('click', async () => {
      const v = (input.value || '').trim();
      if (!v || v.length < 2){
        input.focus();
        count.textContent = '再写点什么吧 ✎';
        count.style.color = 'var(--halo-rose)';
        setTimeout(() => { count.style.color = ''; count.textContent = input.value.length + ' / 300'; }, 1600);
        return;
      }
      const wantPublic = !!(publicEl && publicEl.checked);
      const at = Date.now();
      /* 访客写的信也存本机；勾了公开才上云，并带上 by/name，
         这样星空里能分清是谁封存的。 */
      const by = IS_OWNER ? 'owner' : 'guest';
      const nm = IS_OWNER ? '颜涵' : ((document.getElementById('gbName')?.value || '').trim() || '一位朋友');
      save({ text: v, at, public: wantPublic, by, name: nm });
      render();

      // 勾了"生日公开"才上云；不上云就纯本机，别人永远看不到
      if (wantPublic && capsuleOn()){
        const ok = await cloudPushCapsule({ text: v, at, public: true, by, name: nm });
        const el = document.getElementById('gbCloud');
        if (el) {
          el.textContent = ok
            ? (IS_OWNER
                ? '✓ 已封存，并会在生日那天让大家看到'
                : '✓ 已封存，生日那天它会挂在这片星空上')
            : '已封存本机（云端没连上，生日公开可能不生效）';
          el.dataset.state = ok ? 'ok' : 'warn';
        }
      }
    });
  }

  /* 重新编辑：把信取回来接着改 */
  if (editBtn){
    editBtn.addEventListener('click', () => {
      const d = load();
      if (!d) return;
      if (input){ input.value = d.text || ''; }
      if (count) count.textContent = (input ? input.value.length : 0) + ' / 300';
      if (publicEl) publicEl.checked = !!d.public;
      try { localStorage.removeItem(KEY); } catch(e){}
      render();
      if (input) input.focus();
    });
  }

  /* 取消封存：二次确认后彻底清掉 */
  if (cancelBtn){
    cancelBtn.addEventListener('click', async () => {
      const d = load();
      if (!confirm('取消封存后这封信会消失，确定吗？')) return;
      try { localStorage.removeItem(KEY); } catch(e){}
      render();
      if (input){ input.value = ''; }
      if (count) count.textContent = '0 / 300';
      if (input) input.focus();
      // 如果这封信曾经公开过，云端也一起删掉
      if (d && d.public){
        const ok = await cloudDeleteCapsule(d.at);
        const el = document.getElementById('gbCloud');
        if (el) {
          el.textContent = ok ? '✓ 已取消封存（云端同步删除）' : '已取消封存（云端未同步成功）';
          el.dataset.state = ok ? 'ok' : 'warn';
        }
      }
    });
  }

  if (againBtn){
    againBtn.addEventListener('click', () => {
      // 拆开后就销毁旧信（避免重复读），进入新一封
      try { localStorage.removeItem(KEY); } catch(e){}
      if (input) input.value = '';
      if (count) count.textContent = '0 / 300';
      render();
      if (input) input.focus();
    });
  }

  /* ---------- 访客只读：不显示写信区与编辑按钮 ---------- */
  if (window.__IS_OWNER === false){
    if (writeEl) writeEl.hidden = true;
    if (editBtn) editBtn.hidden = true;
    if (cancelBtn) cancelBtn.hidden = true;
    if (publicWrap) publicWrap.hidden = true;
  }

  render();
})();

/* ==========================================================
   12. 首屏打字机开场
   ========================================================== */
(function typewriter(){
  const h1 = document.getElementById('heroTitle');
  if (!h1) return;
  const line1 = h1.querySelector('.tw');
  const line2 = h1.querySelector('.tw2');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const T1 = line1 ? line1.dataset.tw : '';
  const T2 = line2 ? line2.dataset.tw : '';
  let timers = [];

  function clearTimers(){ timers.forEach(t => clearTimeout(t)); timers = []; }

  function fillAll(){
    clearTimers();
    h1.classList.add('tw-done','tw-finished');
    if (line1) line1.textContent = T1;
    if (line2) line2.textContent = T2;
  }

  function play(){
    if (!line1 || !line2) return;
    clearTimers();
    h1.classList.remove('tw-done','tw-finished');
    line1.textContent = '';
    line2.textContent = '';

    if (reduce) { fillAll(); return; }

    const SPEED = 130;      // 每个字的间隔
    let i = 0;
    // 第一行
    (function step1(){
      if (i < T1.length) {
        line1.textContent += T1[i++];
        timers.push(setTimeout(step1, SPEED));
      } else {
        // 第一行完成 → 换行 + 停顿
        timers.push(setTimeout(() => {
          h1.classList.add('tw-done');
          timers.push(setTimeout(() => {
            let j = 0;
            (function step2(){
              if (j < T2.length) {
                line2.textContent += T2[j++];
                timers.push(setTimeout(step2, SPEED));
              } else {
                // 全部完成 → 光标淡出
                timers.push(setTimeout(() => h1.classList.add('tw-finished'), 900));
              }
            })();
          }, 260));
        }, 180));
      }
    })();
  }

  // 首屏激活时播放一次
  let played = false;
  const obs = new MutationObserver(() => {
    const active = document.getElementById('s0').classList.contains('active');
    if (active && !played) { played = true; play(); }
    if (!active) played = false;      // 离开首屏后允许重播
  });
  obs.observe(document.getElementById('s0'), { attributes:true, attributeFilter:['class'] });

  // 初始就在首屏
  if (document.getElementById('s0').classList.contains('active')) {
    played = true;
    setTimeout(play, 420);
  }
})();

/* ==========================================================
   13. 发光时间轴
   ========================================================== */
(function timelineFx(){
  const s1 = document.getElementById('s1');
  if (!s1) return;
  const items = Array.from(s1.querySelectorAll('.tl-item'));
  const progress = document.getElementById('tlProgress');
  if (!items.length || !progress) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];

  function run(){
    timers.forEach(t => clearTimeout(t)); timers = [];
    items.forEach(el => el.classList.remove('lit'));
    progress.style.height = '0%';

    if (reduce) {
      items.forEach(el => el.classList.add('lit'));
      progress.style.height = '100%';
      return;
    }
    // 进度线 1.6s 走完
    requestAnimationFrame(() => { progress.style.height = '100%'; });

    // 光点依序点亮
    items.forEach((el, i) => {
      timers.push(setTimeout(() => el.classList.add('lit'), 260 + i * 330));
    });
  }

  // 点击某段可高亮它
  items.forEach(el => {
    el.addEventListener('click', () => {
      const idx = +el.dataset.i;
      items.forEach((x, i) => x.classList.toggle('lit', i <= idx));
    });
  });

  let played = false;
  const obs = new MutationObserver(() => {
    const active = s1.classList.contains('active');
    if (active && !played) { played = true; timers.push(setTimeout(run, 300)); }
    if (!active) played = false;
  });
  obs.observe(s1, { attributes:true, attributeFilter:['class'] });
})();

/* ==========================================================
   14. 左下角：实时时间 + 生日计数
   ========================================================== */
(function nowClock(){
  const tEl = document.getElementById('ncTime');
  const dEl = document.getElementById('ncDate');
  const daysEl = document.getElementById('ncDays');
  if (!tEl) return;

  const BIRTH = new Date(2008, 0, 1);          // 2008-01-01
  const WEEK = ['日','一','二','三','四','五','六'];
  const p2 = n => String(n).padStart(2, '0');

  function greeting(h){
    if (h < 5)  return '凌晨好';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 23) return '晚上好';
    return '夜深了';
  }

  function tick(){
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    tEl.textContent = p2(h) + ':' + p2(m);
    dEl.textContent = greeting(h) + '，' + now.getFullYear() + ' 年 ' +
                      (now.getMonth()+1) + ' 月 ' + now.getDate() + ' 日 · 周' + WEEK[now.getDay()];
    // 生日计数（按自然日）
    const base = new Date(BIRTH.getFullYear(), BIRTH.getMonth(), BIRTH.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((today - base) / 86400000);
    if (daysEl) daysEl.textContent = '来到这世界 ' + days.toLocaleString('zh-CN') + ' 天';
  }
  tick();
  setInterval(tick, 20000);                    // 20 秒刷新一次足够
  // 每分钟对齐一次，让分钟数准时跳
  setTimeout(function align(){ tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000);
})();

/* ==========================================================
   15. 背景音乐播放器
   - 音频已完成母带处理（平均 -16dB / 峰值 -0.3dB），本身偏响
     所以默认音量 35%，并做 1.2s 淡入，避免突然出声
   ========================================================== */
(function bgm(){
  const box   = document.getElementById('music');
  const btn   = document.getElementById('musicBtn');
  const audio = document.getElementById('bgm');
  const vol   = document.getElementById('musicVol');
  const pct   = document.getElementById('musicPct');
  const title = document.getElementById('musicTitle');
  const hint  = document.getElementById('musicHint');
  if (!box || !btn || !audio) return;

  const KEY_VOL = 'yh_bgm_vol';
  const DEFAULT_VOL = 35;                    // 因音频偏响，默认取 35%
  const FADE_MS = 1200;

  let targetVol = Math.max(0, Math.min(100, +(localStorage.getItem(KEY_VOL) ?? DEFAULT_VOL))) / 100;
  audio.volume = 0;                          // 从 0 开始，播放时淡入
  if (vol) vol.value = Math.round(targetVol * 100);
  if (pct) pct.textContent = Math.round(targetVol * 100);

  let missing = false;
  let fadeTimer = null;

  audio.addEventListener('error', () => {
    missing = true;
    if (title) title.textContent = '音乐未能加载';
    if (hint) hint.textContent = '检查 assets/music.mp3';
    box.classList.remove('playing');
  });

  // 平滑音量过渡
  // 注意：用 setInterval 而非 requestAnimationFrame 驱动——
  // rAF 在后台标签页/省电模式会被节流甚至暂停，会导致音量卡在 0 不回升。
  function fadeTo(end, ms){
    clearInterval(fadeTimer);
    const start = audio.volume;
    const t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);        // easeOutCubic
      audio.volume = Math.max(0, Math.min(1, start + (end - start) * e));
      if (k >= 1) clearInterval(fadeTimer);
    }, 40);
    // 立即先走一小步，避免开头 40ms 完全无声
    audio.volume = Math.max(0, Math.min(1, start + (end - start) * 0.04));
  }

  function play(){
    /* ⚠️ 音乐整首 4.7MB，一进站就下载会让手机端首屏很慢。
       所以 <audio> 上写 preload="none" 且不设 src，
       真正点了播放按钮，这里才把 src 挂上（此时浏览器才开始下载）。 */
    if (audio.dataset.src && !audio.getAttribute('src')){
      audio.src = audio.dataset.src;
    }
    // 先静音起播（绕过浏览器对"突然出声"的拦截），再淡入
    audio.volume = 0;
    const p = audio.play();
    if (p && p.then) {
      p.then(() => fadeTo(targetVol, FADE_MS))
       .catch(() => { box.classList.remove('playing'); });
    } else {
      fadeTo(targetVol, FADE_MS);
    }
  }

  btn.addEventListener('click', () => {
    if (missing) {
      box.classList.add('open');
      setTimeout(() => box.classList.remove('open'), 2600);
      return;
    }
    if (audio.paused) { box.classList.add('playing'); play(); }
    else {
      fadeTo(0, 420);
      setTimeout(() => audio.pause(), 430);
      box.classList.remove('playing');
    }
  });

  // 移动端：点面板外部收起
  document.addEventListener('click', e => {
    if (!box.contains(e.target)) box.classList.remove('open');
  });
  btn.addEventListener('touchstart', () => box.classList.add('open'), {passive:true});

  audio.addEventListener('pause', () => box.classList.remove('playing'));
  audio.addEventListener('play',  () => box.classList.add('playing'));

  if (vol) vol.addEventListener('input', () => {
    targetVol = vol.value / 100;
    audio.volume = targetVol;                // 拖动时立即生效，不淡入
    if (pct) pct.textContent = vol.value;
    localStorage.setItem(KEY_VOL, vol.value);
  });

  // 阻止空格/方向键误触翻页
  btn.addEventListener('keydown', e => e.stopPropagation());
  if (vol) vol.addEventListener('keydown', e => e.stopPropagation());
})();

/* ==========================================================
   16. 星空留言墙（星星渲染 + 本机/访客分流 + 云端同步）
   ========================================================== */
(function guestbook(){
  const list  = document.getElementById('gbList');
  const nameI = document.getElementById('gbName');
  const msgI  = document.getElementById('gbMsg');
  const send  = document.getElementById('gbSend');
  if (!list || !send) return;

  const sky    = document.getElementById('starSky');
  const hint   = document.getElementById('starHint');
  const modal  = document.getElementById('starModal');
  const mWho   = document.getElementById('starWho');
  const mWhat  = document.getElementById('starWhat');
  const mWhen  = document.getElementById('starWhen');
  const mDel   = document.getElementById('starDel');
  const mClose = document.getElementById('starClose');

  /* 身份判定已在脚本最开头统一求值，这里直接取用
     （见文件顶部 "-1. 身份判定"） */
  const IS_OWNER = window.__IS_OWNER !== false;

  const KEY = 'yh_guestbook_v1';

  /* ----------------------------------------------------------
     云端配置：填入 Supabase 项目信息后，留言就会自动跨设备同步。
     留空则纯本地保存（仍可用导出/导入备份）。
     详见文件末尾的 README 注释。
     ---------------------------------------------------------- */
  const CLOUD = {
    url: 'https://jcrimjzedbrubewsjcou.supabase.co',
    key: 'sb_publishable_WbxyhlgjWmJP_fP0cmHACw_F9rA2LL6',
    table: 'guestbook'
  };
  const cloudOn = () => !!(CLOUD.url && CLOUD.key);

  const cloudEl= document.getElementById('gbCloud');

  /* 暴露给时间胶囊复用（同一套 Supabase 连接与 cloudOn 判断） */
  window.__CLOUD = CLOUD;
  window.__cloudOn = cloudOn;

  function load(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(e){ return []; }
  }
  function save(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e){}
  }
  function fmt(ts){
    const d = new Date(ts);
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function esc(s){
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- 云端读写（有配置才启用） ---------- */
  async function cloudFetch(){
    if (!cloudOn()) return null;
    try {
      const r = await fetch(
        CLOUD.url + '/rest/v1/' + CLOUD.table + '?select=*&order=ts.desc&limit=200',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } }
      );
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const arr = await r.json();
      return arr.map(it => ({ name: it.name, msg: it.msg, ts: it.ts, by: it.by || 'owner' }));
    } catch(e){
      console.warn('[guestbook] 云端读取失败，回落到本地', e);
      return null;
    }
  }
  async function cloudPush(item){
    if (!cloudOn()) return false;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD.table, {
        method: 'POST',
        headers: {
          apikey: CLOUD.key,
          Authorization: 'Bearer ' + CLOUD.key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(item)
      });
      return r.ok;
    } catch(e){ return false; }
  }

  /* 云端删除单条：按 ts + msg 精确定位
     注意：Supabase 即使删了 0 行也返回 204，
     所以删除后必须回查一次确认，否则会误报"成功" */
  async function cloudDelete(item){
    if (!cloudOn()) return false;
    try {
      const q = '?ts=eq.' + encodeURIComponent(item.ts) +
                '&msg=eq.' + encodeURIComponent(item.msg);
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD.table + q, {
        method: 'DELETE',
        headers: {
          apikey: CLOUD.key,
          Authorization: 'Bearer ' + CLOUD.key,
          Prefer: 'return=minimal'
        }
      });
      if (!r.ok) return false;
      // 回查确认
      const chk = await fetch(
        CLOUD.url + '/rest/v1/' + CLOUD.table +
        '?select=id&ts=eq.' + encodeURIComponent(item.ts) +
        '&msg=eq.' + encodeURIComponent(item.msg) + '&limit=1',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } }
      );
      if (!chk.ok) return true;      // 查不了就不误报失败
      const left = await chk.json();
      return Array.isArray(left) && left.length === 0;
    } catch(e){ return false; }
  }

  /* 云端清空：删除 ts 大于 0 的所有记录，同样回查确认 */
  async function cloudDeleteAll(){
    if (!cloudOn()) return false;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CLOUD.table + '?ts=gt.0', {
        method: 'DELETE',
        headers: {
          apikey: CLOUD.key,
          Authorization: 'Bearer ' + CLOUD.key,
          Prefer: 'return=minimal'
        }
      });
      if (!r.ok) return false;
      const chk = await fetch(
        CLOUD.url + '/rest/v1/' + CLOUD.table + '?select=id&limit=1',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } }
      );
      if (!chk.ok) return true;
      const left = await chk.json();
      return Array.isArray(left) && left.length === 0;
    } catch(e){ return false; }
  }

  /* ---------- 渲染 ---------- */
  /* 🔑 合并云端与本地，而不是用云端覆盖本地。
     原因：云端拉取是"异步"的，如果直接 paint(remote) 再 save(remote)：
       ① 用户刚发的留言（本地已存、云端还没回）会被旧列表冲掉；
       ② 本地有而云端没有的留言会凭空消失。
     所以按 ts 做并集去重，谁都不丢。 */
  function merge(local, remote){
    // 如果用户清空过，早于清空时刻的云端旧记录就不再合并回来（否则会"复活"）
    let clearedAt = 0;
    try { clearedAt = parseInt(localStorage.getItem(KEY + '_clearedAt') || '0', 10) || 0; } catch(e){}
    const seen = new Set();
    const out = [];
    (remote || []).filter(m => m && m.ts > clearedAt)
                  .concat(local || [])
                  .forEach(m => {
      if (!m || typeof m.ts === 'undefined') return;
      const k = m.ts + '|' + (m.msg || '');
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ name: m.name, msg: m.msg, ts: m.ts, by: m.by || 'owner' });
    });
    out.sort((a,b) => a.ts - b.ts);   // 保持时间升序，paint 里再倒序展示
    return out;
  }

  /* ---------- 星星渲染 ---------- */
  /* 位置由 name+ts 做 hash 决定：同一条留言每次打开都落在同一处，不会乱跳 */
  function hash(str){
    let h = 2166136261;
    str = String(str);
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  let seq = 0;   // 记录当前渲染顺序，供删除时定位

  function paint(arr){
    if (!sky) return;
    sky.innerHTML = '';
    list.innerHTML = '';

    if (!arr.length){
      if (hint) hint.textContent = IS_OWNER
        ? '— 还没有星星，等你点亮第一颗 —'
        : '— 星空还空着，等它的主人先写点什么 —';
      return;
    }
    if (hint) hint.textContent = '一共 ' + arr.length + ' 颗星 · 点一颗读读看';

    arr.forEach(it => {
      const s = document.createElement('button');
      /* 星星分三种：
         .star         站长自己的（暖色）
         .star.guest   别人留的（冷色，一眼能看出「有人在」）
         .star.pub     生日公开信（金色，最大）
         注意：pub 的优先级最高，所以放在最后 */
      s.className = 'star' +
        (it.by === 'guest' ? ' guest' : '') +
        (it.public ? ' pub' : '');
      s.type = 'button';
      const h = hash((it.name || '') + it.ts + (it.msg || '').slice(0, 8));
      s.style.left = (9 + (h % 82)) + '%';
      s.style.top  = (8 + ((h >> 9) % 58)) + '%';   // 纵向限制在 8%~66%，避开右下角翻页控件
      s.style.animationDelay = ((h >> 5) % 36) / 10 + 's';
      s.title = (it.name || '匿名') + (it.by === 'guest' ? '（来访的朋友）' : '') + ' 的留言';
      s.setAttribute('aria-label', '读 ' + (it.name || '匿名') + ' 的留言');
      s.addEventListener('click', () => openStar(it));
      sky.appendChild(s);
    });
  }

  /* ---------- 点星星读留言 ---------- */
  let opened = null;
  function openStar(it){
    opened = it;
    if (mWho)  mWho.textContent  = (it.name || '匿名') +
      (it.by === 'guest' ? ' · 来访的朋友' : '');
    if (mWhat) mWhat.textContent = it.msg;
    if (mWhen) mWhen.textContent = fmt(it.ts) + (it.public ? ' · 公开信' : '');
    if (mDel)  mDel.hidden = !IS_OWNER;      // 只有站长能删，访客看不到删除入口
    if (modal) modal.classList.add('show');
    if (mClose) mClose.focus({ preventScroll: true });
  }
  function closeStar(){
    opened = null;
    if (modal) modal.classList.remove('show');
  }
  if (mClose) mClose.addEventListener('click', closeStar);
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeStar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) closeStar();
  });

  /* 弹层内的删除：本地删 + 云端同步删（带回查确认） */
  if (mDel) mDel.addEventListener('click', async () => {
    const it = opened;
    if (!it) return;
    if (!confirm('删除这条留言吗？')) return;

    const local = load().filter(m => !(m.ts === it.ts && m.msg === it.msg));
    save(local);
    closeStar();
    paint(local);
    if (local.length) addClearBtn();

    if (cloudOn()) {
      const ok = await cloudDelete(it);
      if (cloudEl) {
        /* 云端删失败时说清楚后果：刷新后会"复活"，
           并直接告诉用户根因和解决办法，避免以为是网站坏了 */
        cloudEl.textContent = ok
          ? '✓ 已删除（云端同步完成）'
          : '⚠ 只删掉了本机缓存：云端没删掉，刷新后这条还会回来。' +
            '原因通常是 Supabase 缺删除权限，请在 SQL Editor 执行：' +
            'create policy "delete all" on guestbook for delete using (true);';
        cloudEl.dataset.state = ok ? 'ok' : 'warn';
      }
    }
  });


  function addClearBtn(){
    if (!IS_OWNER) return;                          // 访客不给清空入口
    const box = document.getElementById('gbTools') || list;
    if (box.querySelector('.gb-clear')) return;     // 已经有就别重复加
    const clr = document.createElement('button');
    clr.className = 'gb-clear';
    clr.type = 'button';
    clr.textContent = '清空全部留言';
    clr.addEventListener('click', async () => {
      const arr = load();
      if (!arr.length) return;
      if (!confirm('确定清空全部 ' + arr.length + ' 条留言吗？此操作不可撤销。')) return;

      // 记下"清空发生的时间"：早于这个时间的云端记录视为已删，不再合并回来
      try { localStorage.setItem(KEY + '_clearedAt', String(Date.now())); } catch(e){}

      // 本地清空
      save([]);
      paint([]);

      // 云端清空
      if (cloudOn()) {
        const ok = await cloudDeleteAll();
        if (cloudEl) {
          cloudEl.textContent = ok
            ? '✓ 已清空（含云端）'
            : '⚠ 只清掉了本机：云端没清掉，刷新后旧留言还会回来。' +
              '请在 Supabase SQL Editor 执行：' +
              'create policy "delete all" on guestbook for delete using (true);';
          cloudEl.dataset.state = ok ? 'ok' : 'warn';
        }
      } else {
        if (cloudEl) {
          cloudEl.textContent = '✓ 已清空本机留言';
          cloudEl.dataset.state = 'ok';
        }
      }
    });
    // 清空按钮挂在工具栏末尾
    box.appendChild(clr);
  }

  function render(){
    const local = load();
    paint(local);
    if (IS_OWNER && local.length) addClearBtn();

    // 云端拉到之后：与本地「合并去重」，绝不用云端覆盖本地
    // ⚠️ 微信/QQ 内置浏览器网络抖动很常见，失败自动重试一次
    cloudFetch().then(remote => {
      if (remote){ applyRemote(local, remote); return; }
      // 第一次失败 → 1.2 秒后重试一次
      return new Promise(res => setTimeout(res, 1200)).then(cloudFetch)
        .then(r2 => { if (r2) applyRemote(local, r2); });
    }).catch(() => {});
  }
  function applyRemote(local, remote){
    const merged = merge(local, remote);
    if (!merged.length) return;
    save(merged);                            // 合并结果回写本地
    paint(merged);
    if (IS_OWNER) addClearBtn();
  }

  /* ---------- 微信/QQ 防星空消失三重保险 ----------
     内置浏览器的常见行为：
       ① 切后台再回来 → WebView 冻结/回收，回来后不会自动刷新数据
       ② 内存紧张时整页重载 → 只跑 load 事件，星空若只在加载时渲染一次就会漏
       ③ 网络抖动 → 云拉失败后不再补拉
     对策：每次「进入星空屏」都重新 render；从后台恢复（visibilitychange）
     也重新 render。render 本身是幂等的（paint 前先清空），重复调用无副作用。 */
  const skySlide = document.getElementById('s9');
  if (skySlide){
    new MutationObserver(() => {
      if (skySlide.classList.contains('active')) render();
    }).observe(skySlide, { attributes:true, attributeFilter:['class'] });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (sky && sky.closest('.slide') && sky.closest('.slide').classList.contains('active')) render();
  });

  /* ---------- 生日公开信：变成一颗金色星 ---------- */
  /* 只有「跨年后的 1 月 1 日」当天及之后，云端封存的公开信才会出现在星空里 */
  const CAPSULE_TABLE = 'capsule';
  function birthdayReached(at){
    const now = new Date(), sealed = new Date(at);
    if (now.getFullYear() > sealed.getFullYear()) return true;
    return now.getMonth() === 0 && now.getDate() === 1;
  }
  async function showPublicLetters(){
    if (!cloudOn() || !sky) return;
    // 表还没建好时记住一次，避免每次进站都发请求刷 404
    let noTable = false;
    try { noTable = localStorage.getItem('yh_capsule_nopull') === '1'; } catch(e){}
    if (noTable) return;
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/' + CAPSULE_TABLE +
        '?select=*&order=at.desc&limit=20',
        { headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key } });
      if (r.status === 404){
        try { localStorage.setItem('yh_capsule_nopull', '1'); } catch(e){}
        return;                                // 表未创建：静默跳过，不再反复请求
      }
      if (!r.ok) return;
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) return;

      arr.filter(it => it.public && birthdayReached(it.at)).forEach((it, i) => {
        /* by: 'owner' = 站长封存的；其它 = 来访朋友封存的。
           文案要分开，不能一律写成「颜涵封存的一封信」。 */
        const isMine = (it.by || 'owner') === 'owner';
        const who = isMine ? '颜涵' : (it.name || '一位朋友');
        const s = document.createElement('button');
        s.className = 'star pub' + (isMine ? '' : ' guest');
        s.type = 'button';
        const h = hash('capsule' + it.at);
        s.style.left = (12 + (h % 76)) + '%';
        s.style.top  = (14 + ((h >> 7) % 66)) + '%';
        s.style.animationDelay = (i * 0.4) + 's';
        s.title = who + ' 封存的一封信';
        s.setAttribute('aria-label', '读 ' + who + ' 封存的信');
        s.addEventListener('click', () => {
          if (mWho)  mWho.textContent  = who + ' · 封存于生日前';
          if (mWhat) mWhat.textContent = it.text || '';
          if (mWhen) mWhen.textContent = '在 ' + fmt(it.at) + ' 写下的';
          if (mDel)  mDel.hidden = true;
          if (modal) modal.classList.add('show');
          if (mClose) mClose.focus({ preventScroll: true });
        });
        sky.appendChild(s);
      });
    } catch(e){ /* 静默：表不存在或网络问题都不该影响页面 */ }
  }

  /* ---------- 提交（所有人都能写，访客的留言会带 by 标记） ---------- */
  async function submit(){
    const name = (nameI.value || '').trim() || (IS_OWNER ? '颜涵' : '匿名');
    const msg  = (msgI.value || '').trim();
    if (!msg) { msgI.focus(); return; }

    /* by: 'owner' = 站长自己写的；'guest' = 访客写的。
       站长在星空中一眼就能分清哪些是别人留的。 */
    const item = { name, msg, ts: Date.now(), by: IS_OWNER ? 'owner' : 'guest' };

    // 先本地落盘，保证"绝不丢"
    const arr = load();
    arr.push(item);
    save(arr);
    msgI.value = '';
    // ⚠️ 这里不能用 render()：render 会异步去拉云端，
    //    而"云端拉取"发生在 push 之前，返回的旧列表会把刚写的留言盖掉。
    //    所以提交时只重画本地，云端结果等下次进入本屏时再合并。
    paint(arr);
    addClearBtn();

    // 再尝试上云（失败也不影响本地保存）
    if (cloudOn()) {
      const ok = await cloudPush(item);
      if (ok) {
        cloudEl.textContent = IS_OWNER
          ? '✓ 已同步到云端，换设备也看得到'
          : '✓ 这颗星已经挂上去了，谢谢你';
        cloudEl.dataset.state = 'ok';
      } else {
        cloudEl.textContent = '已存本机（云端暂时没连上，稍后会重试）';
        cloudEl.dataset.state = 'warn';
      }
    }
  }

  send.addEventListener('click', submit);
  msgI.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  nameI.addEventListener('keydown', e => { if (e.key === 'Enter') msgI.focus(); });
  [nameI, msgI].forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));

  /* ---------- 导出 / 导入备份 ---------- */
  const expBtn = document.getElementById('gbExport');
  const impBtn = document.getElementById('gbImport');
  const fileI  = document.getElementById('gbFile');

  if (expBtn) expBtn.addEventListener('click', () => {
    const data = JSON.stringify({
      site: '颜涵的个人小站',
      exportedAt: new Date().toISOString(),
      count: load().length,
      messages: load()
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    a.href = URL.createObjectURL(blob);
    a.download = '颜涵小站留言备份_' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (cloudEl) {
      cloudEl.textContent = '✓ 备份文件已下载，妥善保存即可永久留存';
      cloudEl.dataset.state = 'ok';
    }
  });

  if (impBtn) impBtn.addEventListener('click', () => fileI && fileI.click());

  if (fileI) fileI.addEventListener('change', () => {
    const f = fileI.files && fileI.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(fr.result);
        const incoming = Array.isArray(parsed) ? parsed : (parsed.messages || []);
        if (!incoming.length) throw new Error('empty');

        // 合并去重（按 时间戳+内容 判重）
        const cur = load();
        const seen = new Set(cur.map(m => m.ts + '|' + m.msg));
        let added = 0;
        incoming.forEach(m => {
          if (!m || !m.msg) return;
          const k = (m.ts || Date.now()) + '|' + m.msg;
          if (seen.has(k)) return;
          seen.add(k);
          cur.push({ name: m.name || '匿名', msg: m.msg, ts: m.ts || Date.now() });
          added++;
        });
        cur.sort((a,b) => a.ts - b.ts);
        save(cur);
        render();
        if (cloudEl) {
          cloudEl.textContent = '✓ 已导入 ' + added + ' 条留言（重复的已自动跳过）';
          cloudEl.dataset.state = 'ok';
        }
      } catch(e) {
        if (cloudEl) {
          cloudEl.textContent = '✕ 这个文件读不出来，请确认是本站导出的备份';
          cloudEl.dataset.state = 'err';
        }
      }
      fileI.value = '';
    };
    fr.readAsText(f);
  });

  /* ---------- 访客分流：只读模式 ---------- */
  if (!IS_OWNER){
    document.querySelectorAll('#s9 .owner-only').forEach(e => e.classList.add('hide-owner'));
  } else {
    document.querySelectorAll('#s9 .owner-only').forEach(e => e.classList.remove('hide-owner'));
  }

  /* ---------- 状态提示 ---------- */
  const gbTitle = document.getElementById('gbTitle');
  if (!IS_OWNER){
    if (cloudEl) {
      cloudEl.textContent = '这是颜涵的星空，欢迎你来看看';
      cloudEl.dataset.state = '';
    }
  } else {
    if (cloudOn()) {
      cloudEl.textContent = '已开启云端同步，换设备也看得见';
      cloudEl.dataset.state = 'ok';
    }
  }

  render();
  showPublicLetters();          // 生日当天把公开信渲染成金色星
})();

/* ==========================================================
   16. 彩蛋徽章收集系统
   三枚徽章藏在最不起眼的角落：
     ① 首屏大标题 —— 连点 5 次
     ② 左下角时钟 —— 连点 3 次
     ③ 页脚 ✦ —— 点 1 次
   集齐 3 枚，末屏自动展开隐藏祝福卡。进度存 localStorage。
   ========================================================== */
(function eggBadges(){
  const KEY = 'yh_badges_v1';
  const hud   = document.getElementById('badgeHud');
  const toast = document.getElementById('eggToast');
  const slots = Array.from(document.querySelectorAll('.bh-slot'));
  const secret= document.getElementById('secretNote');
  const trigger = document.getElementById('eggTrigger');
  if (!hud || !toast) return;

  const FOUND = {
    1: { line:'你发现了一个藏起来的东西。', sub:'徽章 1 / 3 · 记忆的星星' },
    2: { line:'时间是可以被轻轻敲开的。',     sub:'徽章 2 / 3 · 时间的星星' },
    3: { line:'最后一颗星星，被你抓住了。',   sub:'徽章 3 / 3 · 光的星星' }
  };

  let got = {};
  try { got = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){ got = {}; }

  let toastT = null;
  function showToast(html, ms){
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('show'), ms || 3800);
  }

  function render(){
    const n = [1,2,3].filter(k => got[k]).length;
    slots.forEach(s => {
      const k = +s.dataset.k;
      s.classList.toggle('got', !!got[k]);
      s.setAttribute('title', got[k] ? '已发现' : '未发现');
    });
    if (n > 0) hud.classList.add('show');
    if (n >= 3 && secret) {
      secret.classList.add('open');
      secret.setAttribute('aria-hidden','false');
    }
  }

  function award(k){
    if (got[k]) {          // 已获得，只给个小提示
      const n = [1,2,3].filter(x => got[x]).length;
      showToast(`这一颗你已经拿到了 · 进度 ${n} / 3`, 2400);
      return;
    }
    got[k] = true;
    try { localStorage.setItem(KEY, JSON.stringify(got)); } catch(e){}
    render();

    const info = FOUND[k];
    const n = [1,2,3].filter(x => got[x]).length;
    showToast(`<span class="et-badge">${info.sub}</span><br>${info.line}`, 4200);
    toast.setAttribute('aria-live','polite');

    // 集齐时额外庆祝
    if (n >= 3) {
      setTimeout(() => {
        showToast('<span class="et-badge">✦ 全部集齐 ✦</span><br>回到最后一屏看看吧，我留了句话给你。', 5200);
      }, 4400);
    }
  }

  /* ① 首屏大标题：连点 5 次 */
  const heroTitle = document.getElementById('heroTitle');
  if (heroTitle) {
    let hits = 0, resetT = null;
    heroTitle.style.cursor = 'default';
    heroTitle.addEventListener('click', () => {
      hits++;
      clearTimeout(resetT);
      resetT = setTimeout(() => { hits = 0; }, 1600);   // 1.6s 内没继续就重置
      if (hits >= 5) {
        hits = 0; clearTimeout(resetT);
        award(1);
      } else if (hits >= 3) {
        // 给点小反应，暗示"继续点"
        heroTitle.style.transform = `scale(${1 + hits * 0.012})`;
        setTimeout(() => { heroTitle.style.transform = ''; }, 160);
      }
    });
  }

  /* ② 左下角时钟：连点 3 次 */
  const clock = document.getElementById('nowClock');
  if (clock) {
    clock.style.cursor = 'default';
    clock.title = '';
    let hits2 = 0, resetT2 = null;
    clock.addEventListener('click', () => {
      hits2++;
      clearTimeout(resetT2);
      resetT2 = setTimeout(() => { hits2 = 0; }, 1400);
      if (hits2 >= 3) {
        hits2 = 0; clearTimeout(resetT2);
        award(2);
      }
    });
  }

  /* ③ 页脚 ✦ */
  if (trigger) {
    const hit3 = () => {
      trigger.classList.remove('found');
      void trigger.offsetWidth;
      trigger.classList.add('found');
      award(3);
    };
    trigger.addEventListener('click', hit3);
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit3(); }
    });
  }

  render();

  // 供控制台/调试用
  window.__eggReset = () => {
    got = {};
    try { localStorage.removeItem(KEY); } catch(e){}
    if (secret) { secret.classList.remove('open'); secret.setAttribute('aria-hidden','true'); }
    hud.classList.remove('show');
    slots.forEach(s => { s.classList.remove('got'); s.setAttribute('title','未发现'); });
  };
  window.__eggAward = award;
})();


/* ==========================================================
   影像记忆 · 3D 环形轮播（orbit 轨道形态）
   ----------------------------------------------------------
   原生 JS，无任何框架依赖。「影像记忆」主屏与三个分支相册
   共用同一个工厂函数 createRing()，只是喂进去的画廊内容不同。

   核心思路（与用户提供的 React 版一致）：
     · 极坐标定位：每张卡按 angle 算 z（纵深）与 x（横向）
     · orbit 形态：不额外施加 rotateY，卡片永远正对镜头
     · 跟手拖拽：鼠标拖多少像素，环就转多少像素对应的角度
     · 惯性 + snap：松手后滑一小段，再吸附到最近的角度档位
     · 吸附到位后静态停留 1.4 秒，不会被自动旋转立刻带走
   ========================================================== */
window.createRing = function(opts){
  const ring  = document.getElementById(opts.root);
  const stage = ring && ring.querySelector('.ring-stage');
  if (!ring || !stage) return null;

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ITEMS  = opts.items || [];
  const N      = ITEMS.length;
  if (!N) return null;

  /* 整环图片的「上膛」开关。
     图片卡建卡时只挂 data-src，不直接请求。
     主序列的影像记忆环（s3）在首屏附近，一进站就该有图 → 默认 true；
     三个分支相册的环不在首屏，要等它真正被打开（openBranch → armImgs）
     才置 true —— 没打开过的分支相册，一张图都不会下载。
     人像 8 张约 3MB、日常 6 个视频，这一项能给手机端省掉不少。 */
  let imgArmed = opts.armImgs !== false;

  /* 相邻卡片角度步长。
     ⚠️ 桌面端原本是「不满一圈的弧」（26°/30°），8 张卡只铺 208°，
     投影后全堆在屏幕一侧、互相压 150px，观感就是"糊成一团"。
     现在统一闭合成整圆（360/N），卡片均匀绕环分布，前后景深自然错开，
     既不会挤，也真正看得出"这是一个环"。 */
  const narrow = matchMedia('(max-width: 560px)').matches;
  const STEP = opts.step || Math.round(360 / N);
  /* 自转速度用「度/秒」而不是「度/帧」——
     这样 60Hz、120Hz、以及被节流的后台标签页里转速都一致 */
  const AUTO_DPS = REDUCE ? 0 : 12;   // 12 度/秒 ≈ 30 秒转一圈，肉眼可见
  const FRICTION = 0.9;

  /* ---------- 建卡 ---------- */
  const cards = ITEMS.map((it, i) => {
    const el = document.createElement('div');
    el.className = 'ring-card' + (it.ph ? ' ph' : '');
    el.dataset.tint = String(i % 4);

    const face = document.createElement('div');
    face.className = 'ring-face';

    const no = document.createElement('span');
    no.className = 'ring-no';
    no.textContent = String(i + 1).padStart(2, '0');
    face.appendChild(no);

    if (it.kind === 'video'){
      const v = document.createElement('video');
      /* ⚠️ 刻意不在这里设 src：
         环里最多有 6 个视频，如果建卡时就赋 src，即使 preload=metadata
         浏览器也会为每个视频发请求（实测 12 个视频 ≈ 21MB）。
         手机端 4G 下这是首屏卡顿的主因。
         改成"转到正面 / 用户点播放时才赋 src"，首屏一个视频都不下载。 */
      v.dataset.src = it.src + '?v=4';
      v.preload = 'none';
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.addEventListener('pointerdown', e => e.stopPropagation());
      v.addEventListener('click', e => e.stopPropagation());
      /* 兜底：万一手快，在卡片还没转到正面时就点了播放，
         这里先把 src 补上，避免"点了没反应"。 */
      v.addEventListener('play', () => {
        if (v.dataset.src){ v.src = v.dataset.src; v.removeAttribute('data-src'); }
      });
      v.controls = false;                 /* 默认不带控制条，转到正面再开 */
      el.__video = v;                     /* place() 里按景深开关控制条 */
      face.appendChild(v);
    } else {
      /* ph:true = 纯占位卡，不请求任何图片，控制台不会刷 404。
         ph:false = 已放好真实图片，直接加载。 */
      if (!it.ph){
        const img = document.createElement('img');
        img.alt = it.title || '';
        img.decoding = 'async';
        /* loading 用 eager：环一次只有 1~2 张在正面，天然就是懒加载。
           但这里**故意不直接给 src**，只挂 data-src —— 见下面 __imgs 的说明。 */
        img.loading = 'eager';
        img.addEventListener('error', () => { img.remove(); el.classList.add('ph'); });
        img.dataset.src = it.src + '?v=4';
        img.style.zIndex = '2';
        /* 竖长图（如伟哥 640x1450）在近似方形的卡里会被切掉顶部的脸，
           对准上半身位置。 */
        if (it.src.indexOf('pt-wei') !== -1) img.style.objectPosition = '50% 14%';
        face.appendChild(img);
        el.__img = img;
      }

      const ico = document.createElement('span');
      ico.className = 'ring-ico';
      ico.textContent = it.icon || '▣';
      face.appendChild(ico);

      const h = document.createElement('span');
      h.className = 'ring-title';
      h.textContent = it.title || '';
      face.appendChild(h);

      if (it.sub){
        const s2 = document.createElement('span');
        s2.className = 'ring-sub';
        s2.textContent = it.sub;
        face.appendChild(s2);
      }
    }
    el.appendChild(face);
    stage.appendChild(el);
    return el;
  });

  /* ---------- 几何：角度 → 位移 ---------- */
  const rad = d => d * Math.PI / 180;
  let cw = 260, ch = 195, R = 400;
  /* 与 CSS 的 perspective 保持一致：place() 要按它反推正面卡的最大缩放 */
  const PERS = 1100;
  let chBase = 195;   /* 未缩放的卡高（measure 里更新），用于算透视放大后是否装得下 */

  /* 设计宽度只读一次并缓存到 dataset。
     ⚠️ 不能每次 measure 都去 getComputedStyle ——
     那读到的是上一轮 JS 自己写进去的 inline 值，
     反复 measure 会让卡片一路衰减、越缩越小。
     也不能「临时 removeProperty 后读」：同一次同步执行里
     浏览器不保证立刻重算样式，可能读到空值而后退成兜底数字。 */
  function readWish(){
    const c = cards[0];
    if (!c) return 260;
    if (c.dataset.wish) return parseFloat(c.dataset.wish);
    /* 首次：卡片还没有 inline --cw，此时 computed 值就是 CSS 断点的真值 */
    const v = parseFloat(getComputedStyle(c).getPropertyValue('--cw')) || 260;
    c.dataset.wish = String(v);
    return v;
  }
  let WISH = readWish();

  function measure(){
    const W = Math.max(240, ring.clientWidth);
    const SIN = Math.sin(rad(STEP / 2));

    /* 卡片宽度与半径 —— 一次性闭式解，不递归依赖 cw（否则会越缩越小）。
       推导：整圆布点时两张相邻卡的弧向净空 GAP，需要
             2·R·sin(STEP/2) ≥ cw + GAP          （弧长要装得下卡宽+间隙）
       取 GAP = 0.6·cw（相邻卡之间留 0.6 个卡宽的空档），代入得
             R = 1.6·cw / (2·sin(STEP/2)) = 0.8·cw / sin(STEP/2)
       再把环外沿 R + cw/2 压进容器宽度 W·allow：
             cw · (0.8/SIN + 0.5) ≤ W·allow
             ⇒ cw ≤ W·allow / (0.8/SIN + 0.5)
       8 张卡时 SIN=sin22.5°=0.383 → 系数 ≈ 2.59，卡片占容器约 1/2.6，
       于是 R ≈ 2.1·cw，45° 与 90° 位置的横向投影差 ≈ 0.29R ≈ 0.6·cw，
       比半个卡宽大，前后排就不会糊在一起。 */
    const allow = narrow ? 0.86 : 0.90;
    const outerCap = (W * allow) / (0.8 / SIN + 0.5);
    /* 尺寸上限：正面卡会被 perspective 放大，place() 里的 scFront 已经保证
       放大后仍装得进容器，所以这里可以给得宽一些 —— 卡越大越看得清。
       12 张卡时投影更密，靠 scFront 压缩放来避免糊在一起，不会互相重叠。 */
    cw = Math.max(96, Math.min(WISH, narrow ? 215 : 255, Math.max(outerCap, 96)));
    ch = Math.round(cw * 0.75);
    chBase = ch;    /* 供 place() 反推正面卡最大缩放 */
    R  = Math.max(0.8 * cw / SIN, cw * 0.9);

    cards.forEach(c => {
      c.style.setProperty('--cw', cw + 'px');
      c.style.setProperty('--ch', ch + 'px');
      c.style.margin = (-ch / 2) + 'px 0 0 ' + (-cw / 2) + 'px';
    });
  }

  /* ---------- 状态 ---------- */
  let angle = 0, vel = 0, target = null;
  let dragging = false;
  let autoSpin = opts.autoSpin !== false && !REDUCE;
  let visible = false;
  let lastX = 0, lastT = 0, rafId = 0;
  let downX = 0, moved = 0;   /* 本次按下的起点与累计位移，用于区分点击 / 拖拽 */
  let resumeAt = 0;      // 这个时间点之前不恢复自动旋转
  /* 用户是否真的动过这个环。
     视频卡有近 3MB，静止展示时不该下载；
     所以初次进入这一屏只显示封面（视频是黑的，但有编号/标题撑着），
     等用户拖动、点箭头或点圆点之后，才正式把视频拉下来。 */
  let userTouched = false;

  function place(){
    const a0 = rad(angle);
    /* coverflow 式立体感 —— 这是 Apple CoverFlow 的做法，也是唯一
       既"有立体感"又"卡片不会变形到看不清"的方案。

       ⚠️ 之前用完整的 rotateY(-方位角)：卡片转到侧面时会被投影压成
       一条 30px 的缝（247px → 30px），图片和视频全废，这不是"立体"
       而是"看不见"。所以这里改成**限幅斜转**：
       方位角越大 → 转得越多，但最多只转到 ±TILT_MAX(32°) 就封顶。
       于是正面卡端正、两侧卡明显斜过去有厚度感、远处的卡适度侧转，
       而任何一张卡都保留 85% 以上的可视宽度，图/视频始终看得清。 */
    const LIFT     = narrow ? 26 : 40;   // 竖向错位幅度
    const TILT_MAX = 42;                 // 斜转封顶角（度）：越大立体感越强，超过 50° 卡片就太扁
    cards.forEach((el, i) => {
      const a  = a0 + rad(i * STEP);
      const z  = Math.cos(a) * R;
      const x  = Math.sin(a) * R;
      const t  = (z + R) / (2 * R);              // 0 = 最远，1 = 最近
      const y  = (1 - t) * -LIFT;                /* 越远越往上飘 */
      /* 景深缩放。正面卡会被 perspective 放大约 1.5 倍，
         所以这里按容器高度反推一个上限，保证放大后仍装得进容器（不被裁底边）。 */
      const perspBoost = PERS / (PERS - R);                 // 正面卡的透视放大倍数
      const maxFront   = (ring.clientHeight - LIFT - 12) / (perspBoost * chBase);
      const scFront    = Math.min(1.06, Math.max(0.8, maxFront));
      const sc  = (scFront - 0.40) + t * 0.40;              /* 前排 = scFront，后排 = scFront-0.4 */
      const op = 0.26 + t * 0.74;
      /* 斜转角 = 方位角，但夹在 ±TILT_MAX 内（sin 取符号，保证左右对称） */
      const s  = Math.sin(a);
      const ry = -Math.sign(s) * Math.min(Math.abs(s), 1) * TILT_MAX;
      el.style.transform =
        'translate3d(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px, ' + z.toFixed(2) + 'px) ' +
        'rotateY(' + ry.toFixed(2) + 'deg) ' +
        'scale(' + sc.toFixed(4) + ')';
      el.style.opacity = op.toFixed(3);
      el.style.zIndex  = String(Math.round(1000 + z));
      /* 阴影随景深变化：前排悬浮感强（大而散的投影），后排贴近背景 → 立体层次 */
      const fy = Math.round(14 + t * 34);
      const fb = Math.round(22 + t * 26);
      el.style.setProperty('--f-shadow', fy + 'px ' + fb + 'px ' +
        (-Math.round(14 + t * 22)) + 'px rgba(60,44,92,' + (0.14 + t * 0.30).toFixed(2) + ')');
      el.style.filter  = t < 0.42 ? 'blur(' + ((0.42 - t) * 3.5).toFixed(2) + 'px)' : 'none';
      el.style.pointerEvents = t > 0.5 ? 'auto' : 'none';
      el.setAttribute('aria-hidden', t > 0.5 ? 'false' : 'true');
      /* 视频卡：只有转到正面才显示控制条，侧面的卡保持干净 */
      if (el.__video){
        el.__video.controls = (t > 0.85);
        /* 挂载 src 的两个条件：
           ① 用户真的和环交互过（拖过/点过箭头圆点）—— 静止展示时不下载，
              避免"刚进这一屏就吃掉几 MB 流量"；
           ② 这张卡转到了接近正面（t > 0.7）—— 侧背面的卡用户看不到。
           挂过一次就把 dataset.src 删掉，不会重复赋值。 */
        if (userTouched && t > 0.7 && el.__video.dataset.src){
          el.__video.src = el.__video.dataset.src;
          el.__video.removeAttribute('data-src');
        }
      }
      /* 图片卡：只挂 data-src，等整环「可见」时一次性补 src。
         ⚠️ 为什么不像视频那样按 t 单张挂：用户一转就是一整圈，
         转到正面才去下载会看到一块白板从侧面滑出来。
         而整环一次性加载已经足够省 —— 三个分支环（人像 8 张约 3MB、
         日常 6 个视频）在没被打开之前，一张图都不会下载。 */
      if (el.__img && el.__img.dataset.src && imgArmed){
        window.__setImg(el.__img, el.__img.dataset.src);   // 自动挑 webp / jpg
        el.__img.removeAttribute('data-src');
      }
    });
    syncBar();
  }

  /* ---------- 底部：圆点 / 计数 ---------- */
  const dotsEl = ring.parentElement.querySelector('.ring-dots');
  const capEl  = ring.parentElement.querySelector('.ring-cap') ||
                 document.querySelector('[data-cap="' + opts.root + '"]');
  const playEl = ring.parentElement.querySelector('.ring-play');
  const dots = [];
  if (dotsEl){
    for (let i = 0; i < N; i++){
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', '转到第 ' + (i + 1) + ' 张');
      b.addEventListener('click', () => spinTo(i, true));
      dotsEl.appendChild(b);
      dots.push(b);
    }
  }

  function frontIndex(){
    let best = 0, bestC = -Infinity;
    for (let i = 0; i < N; i++){
      const c = Math.cos(rad(angle + i * STEP));
      if (c > bestC){ bestC = c; best = i; }
    }
    return best;
  }

  let lastFi = -1;
  function syncBar(force){
    const fi = frontIndex();
    if (!force && fi === lastFi) return;
    lastFi = fi;
    dots.forEach((d, i) => d.classList.toggle('on', i === fi));
    if (capEl) capEl.textContent =
      String(((fi % N) + N) % N + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0');
  }

  function spinTo(i, byUser){
    /* ⚠️ 只有「用户主动触发」才算交互。
       初始化时也会走一次 spinTo(0) 来摆正起始角度，那次不能算，
       否则视频会在页面一加载就全部下载。 */
    if (byUser && !userTouched){
      userTouched = true;
      queueMicrotask(() => { try { place(); } catch(e){} });
    }
    i = ((i % N) + N) % N;
    const want  = -i * STEP;
    const turns = Math.round((angle - want) / 360);
    target = want + turns * 360;
    if (REDUCE){ angle = target; target = null; }
    vel = 0;
  }

  /* ---------- 渲染循环 ---------- */
  let lastFrame = 0;
  function tick(now){
    rafId = requestAnimationFrame(tick);
    /* 按真实流逝时间算增量，帧率变化不影响转速。
       上限放到 250ms：后台标签页被节流到 4fps 时也能正确累积，
       超过 250ms 才算「真的停顿了」，避免切回来瞬间跳一大格 */
    const dt = lastFrame ? Math.min(250, now - lastFrame) : 16;
    lastFrame = now;
    if (!visible){ return; }

    if (target !== null){
      const d = target - angle;
      if (Math.abs(d) < 0.25){
        angle = target; target = null;
        resumeAt = performance.now() + 1400;
      } else {
        angle += d * (1 - Math.pow(0.84, dt / 16));   // 帧率无关的缓动
      }
    } else if (!dragging){
      const cooled   = performance.now() < resumeAt;
      const spinning = autoSpin && !cooled && !ring.dataset.hover;
      angle += vel * (dt / 16) + (spinning ? AUTO_DPS * dt / 1000 : 0);
      vel *= Math.pow(FRICTION, dt / 16);
      if (Math.abs(vel) < 0.004) vel = 0;
    }
    place();
  }

  /* ---------- 拖拽：跟手感 ---------- */
  function down(e){
    if (REDUCE) return;
    /* 点在箭头 / 播放键 / 圆点上时不进入拖拽，否则 click 会被 pointer capture 吞掉 */
    if (e.target.closest('.ring-nav,.ring-play,.ring-dots')) return;
    dragging = true;
    /* 用户开始拖了 → 允许加载视频，并立刻重排一次，
       让"当时正停在正面"的那张视频卡马上开始下载 */
    if (!userTouched){ userTouched = true; queueMicrotask(() => { try { place(); } catch(e){} }); }
    target = null;
    vel = 0;
    ring.classList.add('dragging');
    lastX = e.clientX;
    lastT = performance.now();
    /* 记住按下时的位置：松手时如果几乎没移动，才算「点击」，否则算「拖拽」。
       不加这个判断的话，转完一圈松手会顺手把大图打开。 */
    downX = e.clientX;
    moved = 0;
    try { ring.setPointerCapture(e.pointerId); } catch(err){}
    ring.querySelectorAll('video').forEach(v => { try { v.pause(); } catch(err){} });
  }
  function move(e){
    if (!dragging) return;
    const now = performance.now();
    const dt  = Math.max(1, now - lastT);
    const dx  = e.clientX - lastX;
    moved += Math.abs(dx);          /* 累计位移：判断这次是「点击」还是「拖拽」 */
    /* 跟手感：拖多少像素，环就转过多少像素对应的角度
       （除以半径把像素换算成弧度，拖起来像真的在「拧」这个环） */
    const k = 180 / (Math.PI * Math.max(R, 120));
    angle += dx * k;
    vel = Math.min(9, Math.max(-9, (dx * k) * (16 / dt)));
    lastX = e.clientX;
    lastT  = now;
    place();
  }
  function up(){
    if (!dragging) return;
    dragging = false;
    ring.classList.remove('dragging');
    /* 松手：按角速度惯性滑一小段，再吸附到最近档位 */
    const want    = angle + vel * 9;
    target        = Math.round(want / STEP) * STEP;
    vel           = 0;
    resumeAt      = performance.now() + 1400;
  }

  if (!REDUCE){
    ring.addEventListener('pointerdown', down);
    ring.addEventListener('pointermove', move);
    ring.addEventListener('pointerup', up);
    ring.addEventListener('pointercancel', up);
    cards.forEach((el, i) => {
      el.addEventListener('click', e => {
        if (e.target.closest('video')) return;
        /* 刚拖过一圈（位移超过 6px）就不算点击 —— 否则转完松手会误开大图。 */
        if (moved > 6){ moved = 0; return; }
        const fi = frontIndex();
        if (fi === i) ringshot(el, i);
        else spinTo(i, true);
      });
    });
  } else {
    ring.classList.add('flat');
  }

  const prevBtn = ring.parentElement.querySelector('.ring-prev');
  const nextBtn = ring.parentElement.querySelector('.ring-next');
  prevBtn?.addEventListener('click', () => spinTo(frontIndex() - 1, true));
  nextBtn?.addEventListener('click', () => spinTo(frontIndex() + 1, true));

  /* ---------- 自动旋转开关 ---------- */
  function setPlay(on){
    autoSpin = on && !REDUCE;
    if (playEl){
      playEl.textContent = autoSpin ? '❚❚' : '▶';
      playEl.setAttribute('aria-label', autoSpin ? '暂停自动旋转' : '继续自动旋转');
    }
  }
  playEl?.addEventListener('click', () => setPlay(!autoSpin));
  setPlay(opts.autoSpin !== false && !REDUCE);

  /* 悬停 / 聚焦时暂停自动旋转，方便看清 */
  ring.addEventListener('pointerenter', () => { if (!dragging) ring.dataset.hover = '1'; });
  ring.addEventListener('pointerleave', () => { delete ring.dataset.hover; });
  ring.addEventListener('focus', () => { ring.dataset.hover = '1'; });
  ring.addEventListener('blur',  () => { delete ring.dataset.hover; });

  /* 键盘：左右方向键转环 */
  ring.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); spinTo(frontIndex() - 1, true); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); spinTo(frontIndex() + 1, true); }
  });

  /* ---------- 点击正面卡：打开大图 ---------- */
  function ringshot(el, i){
    el.animate(
      [{ transform: el.style.transform + ' translateZ(70px)' }, { transform: el.style.transform }],
      { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
    dots.forEach((d, k) => d.classList.toggle('on', k === i));

    /* 视频卡不开大图（点了就直接播）；
       图片卡则把「这一个环里的所有照片」交给查看器，方便左右翻。
       这样在相册环里点开一张，就能顺着看完整本，不用退出来转。 */
    const it = ITEMS[i];
    if (!it || it.kind === 'video') return;
    if (!window.__lb) return;
    const photos = ITEMS
      .map((x, k) => (x.kind === 'video' ? null : { src: x.src, title: x.title, sub: x.sub, k }))
      .filter(Boolean);
    const at = photos.findIndex(p => p.k === i);
    window.__lb.show(photos, at < 0 ? 0 : at);
  }

  /* ---------- 视口可见才跑 ---------- */
  if ('IntersectionObserver' in window){
    new IntersectionObserver(es => {
      es.forEach(en => { visible = en.isIntersecting; });
    }, { threshold: 0.05, rootMargin: '80px' }).observe(ring);
  } else {
    visible = true;
  }

  /* ---------- 尺寸变化重新量 ---------- */
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      WISH = readWish();       // 断点可能变了，设计宽度要重新读
      measure(); place();
    }, 160);
  });

  measure();
  place();
  spinTo(opts.startAt || 0);
  if (target !== null){ angle = target; target = null; }
  place();
  syncBar(true);
  rafId = requestAnimationFrame(tick);

  const api = {
    spinTo,
    /* 让整环图片「上膛」——分支相册被打开时由 openBranch 调用。
       主序列环默认就已上膛，调不调都一样。 */
    armImgs(){
      if (imgArmed) return;
      imgArmed = true;
      try { place(); } catch(e){}
    },
    get angle(){ return angle; },
    get R(){ return R; },
    get visible(){ return visible; },
    get front(){ return frontIndex(); },
    items: ITEMS
  };
  ring.__ring = api;
  return api;
};

/* ==========================================================
   挂载四个环：影像记忆主屏 + 三个分支相册
   ----------------------------------------------------------
   想换素材：改下面的 PHOTO()/V() 调用即可。
   ph:true = 占位卡（不请求图片）；改成 ph:false 才加载真实图片。
   ========================================================== */
(function mountRings(){
  /* 小工具：生成一个占位照片项 */
  const PHOTO = (n, file, title, sub) => ({
    kind:'photo', ph:true, icon:'▣',
    title: title || ('照片' + n),
    sub: sub || ('待补 · assets/' + file),
    src: 'assets/' + file
  });
  const VIDEO = (file, title) => ({
    kind:'video', icon:'▶', title, sub:'点击播放', src:'assets/' + file
  });

  /* ---------- ① 影像记忆主屏 ----------
     2026 换新：12 件新记忆（11 张图 + 1 段视频），替代原有内容。
     顺序就是上传时的顺序。 */
  window.__ring = window.createRing({
    root: 'ring',
    items: [
      { kind:'photo', ph:false, icon:'▣', title:'天台上的风，和整片港口',   sub:'2025 · 高处看得远',      src:'assets/yh-1.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'画了一整个世界的熊',       sub:'2022 · 手绘',            src:'assets/yh-2.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'雪地里的小孩，长这么大了', sub:'小时候 · 对比',          src:'assets/yh-3.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'橡皮泥捏出的细胞帝国',     sub:'生物课作业',             src:'assets/yh-4.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'来泰山，与文人共游',       sub:'研学 · 手绘海报',        src:'assets/yh-5.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'大哥罩你 · 大哥的留言',   sub:'毕业 · 旧时光',          src:'assets/yh-6.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'会开花的特效整活',         sub:'16:18 · 今天',           src:'assets/yh-7.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'亲笔签名，先收藏后增值',   sub:'- LOVE -',               src:'assets/yh-8.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'祝这个世界继续热闹',       sub:'生日快乐',                src:'assets/yh-9.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'幼儿园第一天，都记在本子里', sub:'2014 · 手写日记',      src:'assets/yh-10.jpg' },
      { kind:'photo', ph:false, icon:'▣', title:'扭扭棒 U·H 和一只兔子',   sub:'手工 · 书签',            src:'assets/yh-11.jpg' },
      VIDEO('video8.mp4', '新的一段回忆')
    ]
  });

  /* ---------- ②③④ 三个分支相册 ---------- */
  const BRANCH = {
    'ring-faces': {
      files: ['pt-1.jpg','pt-2.jpg','pt-3.jpg','pt-4.jpg','pt-wei.jpg?v=2',
              'pt-pingpang.jpg','pt-mama.jpg','pt-kid.jpg'],
      titles: ['我们仨 · 笑得最傻的一张','风把头发吹乱了，正好','站在湖边，什么都刚刚好',
               '镜头举起来的那一刻','伟哥 · 胡子是这两年长的','球台前 · 谁也没赢',
               '妈妈 · 长椅上歇一会儿','小时候我就在这种草堆里找四叶草'],
      subs:  ['2025 · 春天的湖边','2025 · 春天','2025 · 湖边','2025 · 那天很亮',
              '2025 · 特写','2025 · 球馆','2025 · 长椅','2012 · 童年的草'],
      icons: ['☺','☺','☺','☺','☺','◎','☺','⊙']
    },
    'ring-daily': {
      files: ['video5.mp4','video6.mp4','video7.mp4','video1.mp4','video2.mp4','video3.mp4'],
      titles: ['日常 · 第一段','日常 · 第二段','日常 · 第三段',
               '美姿令人着迷的邵某人','那天的风','随手拍的几秒'],
      subs:  ['点击播放','点击播放','点击播放','点击播放','点击播放','点击播放'],
      icons: ['▶','▶','▶','▶','▶','▶']
    }
  };

  Object.keys(BRANCH).forEach(rootId => {
    const cfg = BRANCH[rootId];
    const isVideo = cfg.files[0].endsWith('.mp4');
    window.createRing({
      root: rootId,
      /* 分支环不在首屏 —— 没被打开之前，图片和视频一张都不下载。
         等用户真的点进去（openBranch），再调 __ring.armImgs() 上膛。 */
      armImgs: false,
      items: cfg.files.map((f, i) => {
        if (isVideo){
          return { kind:'video', icon: cfg.icons[i],
                   title: cfg.titles[i], sub: cfg.subs[i],
                   src: 'assets/' + f };
        }
        return { kind:'photo', ph:false, icon: cfg.icons[i],
                 title: cfg.titles[i], sub: cfg.subs[i],
                 src: 'assets/' + f };
      })
    });
  });
})();
/* ==========================================================
   末屏 · 微信号一键复制
   ----------------------------------------------------------
   微信里长按文字也能复制，但很多人不知道；
   做成按钮点一下就进剪贴板，顺手给个「已复制」的回执。
   clipboard API 在 http/file 下可能不可用（需要安全上下文），
   所以留了 textarea + execCommand 的老办法兜底。
   ========================================================== */
(function wxCopy(){
  const btn = document.getElementById('wxCopy');
  const tip = document.getElementById('wxTip');
  if (!btn || !tip) return;
  const WX = 'petrichor_love520';

  function fallback(text){
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch(e){ return false; }
  }

  let t = null;
  function done(ok){
    tip.textContent = ok ? '已复制' : WX;
    btn.classList.toggle('copied', ok);
    clearTimeout(t);
    t = setTimeout(() => {
      tip.textContent = '复制';
      btn.classList.remove('copied');
    }, 1900);
  }

  btn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(WX).then(() => done(true), () => done(fallback(WX)));
    } else {
      done(fallback(WX));
    }
  });
})();


/* ==========================================================
   分享给朋友（二维码面板）
   ----------------------------------------------------------
   末屏「把这个站分享给朋友」按钮 → 弹出一个浮层：
     · 内联 SVG 二维码（路径是构建时用 Python 的 qrcode 算好写进 HTML 的，
       不用任何在线接口，本地双击打开也能扫）
     · 一条可复制的网址
   ========================================================== */
(function sharePanel(){
  const btn   = document.getElementById('shareBtn');
  const mask  = document.getElementById('shareMask');
  const closeEl = document.getElementById('shareClose');
  const copyEl  = document.getElementById('shareCopy');
  const linkEl  = document.getElementById('shareLink');
  if (!btn || !mask) return;

  let open = false;

  function openPanel(){
    if (open) return;
    open = true;
    mask.classList.add('open');
    mask.removeAttribute('aria-hidden');
    btn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('share-mode');
    closeEl.focus({ preventScroll: true });
  }
  function closePanel(){
    if (!open) return;
    open = false;
    mask.classList.remove('open');
    mask.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('share-mode');
    btn.focus({ preventScroll: true });
  }

  /* 复制链接：优先剪贴板 API，file:// 下退回 execCommand */
  function copyLink(){
    const text = (linkEl && linkEl.value) || location.href;
    const done = () => {
      copyEl.textContent = '已复制';
      copyEl.classList.add('done');
      setTimeout(() => {
        copyEl.textContent = '复制';
        copyEl.classList.remove('done');
      }, 1700);
    };
    const fallback = () => {
      try {
        if (linkEl){ linkEl.removeAttribute('readonly'); }
        linkEl.select();
        linkEl.setSelectionRange(0, text.length);
        document.execCommand('copy');
        if (linkEl){ linkEl.setAttribute('readonly', ''); }
        done();
      } catch(e){ /* 复制不了就静默，用户还能手动选中 */ }
    };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  btn.addEventListener('click', openPanel);
  closeEl.addEventListener('click', closePanel);
  copyEl.addEventListener('click', copyLink);

  /* 点二维码外面的空白关掉；点面板内部不关 */
  mask.addEventListener('click', e => {
    if (e.target === mask) closePanel();
  });

  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape'){ e.preventDefault(); closePanel(); }
  }, true);

  /* 链接输入框：手机上一按就全选，方便手动复制 */
  if (linkEl){
    linkEl.addEventListener('focus', () => linkEl.select());
    linkEl.addEventListener('click', () => linkEl.select());
  }
})();


/* ==========================================================
   图片放大查看器（Lightbox）
   ----------------------------------------------------------
   点环里正面的卡 → 打开这一张的原图（webp 优先，自动挑）。
   一个环内的所有照片可以左右翻页，不跨环。

   为什么不做「点任意卡都开大图」：
   点侧面的卡应该是「转过去看它」，这是环的核心手感；
   只有已经转到正面的卡，再点一下才是「我要看大图」。
   ========================================================== */
(function initLightbox(){
  const box   = document.createElement('div');
  box.className = 'lb';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '图片放大查看');
  box.innerHTML =
    '<figure class="lb-fig">' +
      '<div class="lb-frame">' +
        '<img class="lb-img" alt="">' +
      '</div>' +
      '<figcaption class="lb-cap">' +
        '<b></b>' +
        '<i></i>' +
        '<button class="lb-copy" type="button" aria-label="复制这句话">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="9" y="9" width="11" height="11" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
            '<path d="M6.5 15H5.4A1.9 1.9 0 0 1 3.5 13.1V5.4A1.9 1.9 0 0 1 5.4 3.5h7.7a1.9 1.9 0 0 1 1.9 1.9v1.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
          '</svg>' +
          '<span class="lb-copy-txt">复制</span>' +
        '</button>' +
      '</figcaption>' +
    '</figure>' +
    '<button class="lb-x" type="button" aria-label="关闭">✕</button>' +
    '<button class="lb-nav lb-prev" type="button" aria-label="上一张">‹</button>' +
    '<button class="lb-nav lb-next" type="button" aria-label="下一张">›</button>' +
    '<div class="lb-meta"></div>';
  document.body.appendChild(box);

  const imgEl  = box.querySelector('.lb-img');
  const frameEl= box.querySelector('.lb-frame');
  const capB   = box.querySelector('.lb-cap b');
  const capI   = box.querySelector('.lb-cap i');
  const copyEl = box.querySelector('.lb-copy');
  const copyTxt= box.querySelector('.lb-copy-txt');
  const metaEl = box.querySelector('.lb-meta');
  const prevEl = box.querySelector('.lb-prev');
  const nextEl = box.querySelector('.lb-next');
  const closeEl= box.querySelector('.lb-x');

  /* 当前查看的相册（一个环的图片项列表）与下标 */
  let list = [];
  let idx  = 0;
  let open = false;
  let typeTimer = 0;          /* 标题逐字浮现的定时器，翻页/关闭时要清掉 */

  /* ---------- 标题逐字浮现 ----------
     像手写便签一样一个字一个字浮出来，而不是整行"啪"地出现。
     翻页或关闭时必须清掉上一个定时器，否则两段文字会打架。 */
  function typeIn(text){
    clearInterval(typeTimer);
    capB.textContent = '';
    if (!text){ return; }
    /* 尊重系统「减少动态效果」偏好：直接整句显示，不做打字机 */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      capB.textContent = text;
      return;
    }
    let i = 0;
    capB.classList.add('typing');
    typeTimer = setInterval(() => {
      i++;
      capB.textContent = text.slice(0, i);
      if (i >= text.length){
        clearInterval(typeTimer);
        capB.classList.remove('typing');
      }
    }, 52);
  }

  /* ---------- 一键复制这句话 ----------
     优先用剪贴板 API；file:// 或旧浏览器下会失败，退回 textarea + execCommand。
     复制成功后按钮短暂变成「已复制」。 */
  function copyText(text){
    if (!text) return Promise.resolve(false);
    const done = () => flashCopied();

    if (navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text).then(() => { done(); return true; },
                                                     () => { fallback(); return false; });
    }
    fallback();
    return Promise.resolve(true);

    function fallback(){
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch(e){ /* 实在复制不了就静默失败，不打扰用户 */ }
    }
  }
  function flashCopied(){
    copyEl.classList.add('done');
    copyTxt.textContent = '已复制';
    setTimeout(() => {
      copyEl.classList.remove('done');
      copyTxt.textContent = '复制';
    }, 1600);
  }

  /* ---------- 一帧渲染 ---------- */
  function render(){
    const it = list[idx];
    if (!it) return;
    /* 用 __setImg 自动挑 webp / jpg，并带失败兜底 */
    imgEl.alt = it.title || '';
    imgEl.removeAttribute('src');
    window.__setImg(imgEl, it.src);
    /* 相纸风：每张照片给一个固定的小倾角，靠下标算出来（同一张每次都一样，
       不会翻回来角度就变了）。0/1/-1 交替，看起来像随手摊在桌上。 */
    frameEl.style.setProperty('--tilt', (((idx % 3) - 1) * 0.7).toFixed(2) + 'deg');
    typeIn(it.title || '');
    capI.textContent = it.sub || '';
    copyEl.hidden = !(it.title || it.sub);
    copyEl.dataset.text = [it.title, it.sub].filter(Boolean).join(' · ');
    metaEl.textContent = list.length > 1
      ? (idx + 1) + ' / ' + list.length + '   ·   ← → 翻页 · Esc 关闭'
      : 'Esc 关闭';
    const many = list.length > 1;
    prevEl.hidden = !many;
    nextEl.hidden = !many;
  }

  function show(photos, i){
    list = photos;
    idx  = Math.max(0, Math.min(photos.length - 1, i));
    render();
    if (!open){
      open = true;
      box.classList.add('open');
      document.documentElement.classList.add('lb-mode');
    }
  }
  function close(){
    if (!open) return;
    open = false;
    clearInterval(typeTimer);
    box.classList.remove('open');
    document.documentElement.classList.remove('lb-mode');
    setTimeout(() => { if (!open) imgEl.removeAttribute('src'); }, 340);
  }
  function step(d){
    if (list.length < 2) return;
    idx = (idx + d + list.length) % list.length;
    render();
  }

  copyEl.addEventListener('click', e => {
    e.stopPropagation();
    copyText(copyEl.dataset.text);
  });
  closeEl.addEventListener('click', close);
  prevEl.addEventListener('click', e => { e.stopPropagation(); step(-1); });
  nextEl.addEventListener('click', e => { e.stopPropagation(); step(1); });
  /* 点空白处关闭，点图片本身不关（方便长按保存） */
  box.addEventListener('click', e => {
    if (e.target === box || e.target.closest('.lb-fig') === null) close();
  });

  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); step(1); }
  }, true);

  /* 触摸板 / 手指左右滑 */
  let sx = null;
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 46) step(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });

  /* 暴露给环使用 */
  window.__lb = { show, close, isOpen(){ return open; } };
})();
