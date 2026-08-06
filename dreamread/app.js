/* 老人与海 · 鲜活的书 · MVP 主逻辑 */
(function () {
  'use strict';

  const BOOK = window.BOOK;
  const FN   = window.FOOTNOTES || {};
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const STORE_KEY = 'oldman_progress_v1';
  const EXPERIENCE_CODE = '666';

  /* ============== 书架 ============== */
  const SHELF_BOOKS = [
    { id: 'oldman', title: '老人与海', author: '海明威', cover: 'assets/act1.png', ready: true,
      summary: '八十四天一无所获后，老渔夫圣地亚哥独自出海，钓上一条比船还长的大马林鱼，搏斗三天三夜，归途却被鲨鱼啃尽。他带回一副鱼骨，与一个不肯认输的灵魂。' },
    { id: 'solitude', title: '百年孤独', author: '马尔克斯', cover: null, ready: false,
      summary: '布恩迪亚家族七代人在马孔多的兴衰轮回，魔幻与现实交织的孤独史诗。' },
    { id: 'prince', title: '小王子', author: '圣埃克苏佩里', cover: null, ready: false,
      summary: '来自 B612 星球的小王子游历各星球，最终在地球上懂得了爱与责任。' },
    { id: 'fortress', title: '围城', author: '钱钟书', cover: null, ready: false,
      summary: '方鸿渐归国后在爱情、婚姻与事业间进退失据——城外的想进去，城里的想出来。' }
  ];

  /* 对话预设话题（图片提前生成，暂用现有插图占位） */
  const DIALOG_PRESETS = [
    { ic: '🌊', label: '你为什么坚持出海？',   img: 'assets/act1.png', topic: 'sea',     q: '你为什么坚持出海？' },
    { ic: '🐟', label: '那条大鱼有多大？',     img: 'assets/act3.png', topic: 'fish',    q: '那条大鱼到底有多大？' },
    { ic: '👦', label: '马诺林是谁？',         img: 'assets/act1.png', topic: 'manolin', q: '马诺林是谁？' },
    { ic: '🦈', label: '鲨鱼来的那一刻',       img: 'assets/act4.png', topic: 'shark',   q: '鲨鱼来的时候你怎么想？' },
    { ic: '💪', label: '人真的不能被打败吗？', img: 'assets/act5.png', topic: 'defeat',  q: '人真的不能被打败吗？' },
    { ic: '🦁', label: '你梦见什么？',         img: 'assets/act2.png', topic: 'lion',    q: '你梦见什么？' }
  ];

  /* 每本书的锚点人物/场景，拼入 MiniMax 图片 prompt，保证前后一致 */
  const BOOK_ANCHORS = {
    oldman: {
      character: '古巴老渔夫圣地亚哥，消瘦憔悴，深褐色皮肤，白发白须，眼睛像海水一样蓝，穿褪色打补丁的衬衫',
      style: '电影感写实油画，暖金色调，加勒比海日落逆光，胶片颗粒质感',
      location: '1950年代古巴哈瓦那湾外海，破旧小木帆船，湾流'
    }
  };
  // 取某本书的锚点；自定义书从存储里取，缺省回退到老人与海
  function getAnchors(bookId) {
    if (BOOK_ANCHORS[bookId]) return BOOK_ANCHORS[bookId];
    const cb = loadCustomBooks().find(b => b.id === bookId);
    if (cb && cb.anchorSpec) return cb.anchorSpec;
    return BOOK_ANCHORS.oldman;
  }

  /* ============== 开发者配置 ============== */
  // localStorage 的"dev_*"是用户自定义覆盖（优先级最高）。
  // 服务端通过 /api/config 注入默认值（Railway 环境变量），页面启动时拉取。
  let srvCfg = {}; // { llm_base, llm_key, llm_model, mm_img, mm_voice }
  function getCfg(k) {
    // 本地覆盖优先；其次服务端注入；都没有则为空
    try {
      const local = localStorage.getItem('dev_' + k);
      if (local != null && local !== '') return local;
    } catch (e) {}
    return (srvCfg && srvCfg[k]) || '';
  }
  function setCfg(k, v) { try { localStorage.setItem('dev_' + k, v); } catch (e) {} }

  /* ============== 用户设置 ============== */
  // 与 dev_*（开发者/密钥）分开，user_* 存用户偏好：音色、语速、图片风格
  function getUserCfg(k, fallback) {
    try {
      const v = localStorage.getItem('user_' + k);
      if (v != null && v !== '') return v;
    } catch (e) {}
    return fallback;
  }
  function setUserCfg(k, v) { try { localStorage.setItem('user_' + k, v); } catch (e) {} }

  const VOICE_OPTIONS = [
    { id: 'audiobook_male_1', label: '沉稳男声（默认）' },
    { id: 'presenter_male', label: '播报男声' },
    { id: 'male-qn-jingying', label: '清亮男声' },
    { id: 'audiobook_female_1', label: '沉稳女声' },
    { id: 'female-shaonv', label: '少女音' },
    { id: 'female-yujie', label: '御姐音' },
    { id: 'qinghezhaohui_seven', label: '温和女声' },
  ];

  /* ============== 激活码解锁状态 ============== */
  // 激活后：可上传自定义书籍、可生成自定义素材。未激活用户只能查看已生成的素材。
  function isUnlocked() { try { return localStorage.getItem('unlocked') === '1'; } catch (e) { return false; } }
  function setUnlocked() { try { localStorage.setItem('unlocked', '1'); } catch (e) {} }

  /* ============== 账户：注册 / 登录 / 个人信息（纯本地演示） ============== */
  // 说明：这是纯前端 MVP，账户仅存于本地浏览器 localStorage，非真实鉴权。
  const ACCT_KEY = 'dr_accounts';      // { [username]: { pw, nickname, email } }
  const SESSION_KEY = 'dr_session';    // 当前登录用户名
  let acctTab = 'login';               // 'login' | 'register'

  function loadAccounts() { try { return JSON.parse(localStorage.getItem(ACCT_KEY) || '{}'); } catch (e) { return {}; } }
  function saveAccounts(o) { try { localStorage.setItem(ACCT_KEY, JSON.stringify(o)); } catch (e) {} }
  function currentUser() {
    try {
      const u = localStorage.getItem(SESSION_KEY);
      if (!u) return null;
      const acc = loadAccounts()[u];
      return acc ? Object.assign({ username: u }, acc) : null;
    } catch (e) { return null; }
  }
  function setSession(u) { try { u ? localStorage.setItem(SESSION_KEY, u) : localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  // 简单散列，避免明文存密码（非安全用途，仅演示）
  function hashPw(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }

  /* ============== 脚注 Tooltip ============== */
  let fnTooltip = null;
  function initFnTooltip() {
    if (fnTooltip) return;
    fnTooltip = document.createElement('div');
    fnTooltip.className = 'fn-tooltip';
    document.body.appendChild(fnTooltip);
    document.addEventListener('click', e => {
      if (!e.target.classList.contains('fn-ref')) hideFn();
    });
  }
  function showFn(el, num) {
    initFnTooltip();
    const text = FN[String(num)];
    if (!text) return;
    fnTooltip.textContent = '[' + num + '] ' + text;
    fnTooltip.classList.remove('show', 'above');
    const r = el.getBoundingClientRect();
    const tw = Math.min(300, window.innerWidth - 24);
    let left = r.left;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (left < 8) left = 8;
    fnTooltip.style.left = left + 'px';
    fnTooltip.style.top  = (r.bottom + 8) + 'px';
    fnTooltip.style.maxWidth = tw + 'px';
    fnTooltip.classList.add('show');
    const tipH = fnTooltip.offsetHeight;
    if (r.bottom + 8 + tipH > window.innerHeight - 8 && r.top - 8 - tipH > 0) {
      fnTooltip.style.top = (r.top - tipH - 8) + 'px';
      fnTooltip.classList.add('above');
    }
  }
  function hideFn() {
    if (fnTooltip) fnTooltip.classList.remove('show');
  }

  /* 把段落文字中的 [N] 替换成可点击角标 */
  function renderFnRefs(html) {
    return html.replace(/\[(\d+)\]/g, (_, n) =>
      '<sup class="fn-ref" data-fn="' + n + '">[' + n + ']</sup>'
    );
  }

  /* ============== 视图路由 ============== */
  const VIEWS = ['cover', 'acts', 'reader', 'chat', 'about', 'account'];
  function go(view) {
    stopSpeak();
    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('active', v === view);
    });
    // reader 没有对应的 nav-btn，高亮"幕次"作为父级
    const navKey = view === 'reader' ? 'acts' : view;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === navKey));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'reader') renderReader();
    if (view === 'acts')   renderActs();
    if (view === 'chat') renderChatInit();
    if (view === 'account') renderAccount();
  }

  /* ============== 书架 ============== */
  let shelfMode = 'nav'; // 'nav' | 'read' | 'chat'
  const SHELF_COPY = {
    nav:  { h: '鲜活的书架', en: 'A Living Bookshelf',        lede: '选一本书，让它开口说话。经典不再只是文字，而是可读、可听、可对话的世界。' },
    read: { h: '传统阅读',   en: 'Choose a book to read',      lede: '选择一本书，进入分幕图文阅读 · 配音朗读 · 名言高亮。' },
    chat: { h: '沉浸对话',   en: 'Choose a book to talk with', lede: '选择一本书，与书中人物对话——他会用原著里的话回答你。' }
  };

  // 显示书架并进入指定模式（由顶部导航调用）
  function showShelf(mode) {
    shelfMode = mode || 'nav';
    stopSpeak();
    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('active', v === 'cover');
    });
    const c = SHELF_COPY[shelfMode];
    const h1 = $('#shelf-h1');
    if (h1) h1.innerHTML = c.h + '<span class="en" id="shelf-en">' + c.en + '</span>';
    const lede = $('#shelf-lede');
    if (lede) lede.textContent = c.lede;
    const detail = $('#book-detail');
    if (detail) detail.style.display = 'none';
    renderShelf();
    const navKey = shelfMode === 'read' ? 'acts' : shelfMode === 'chat' ? 'chat' : 'cover';
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === navKey));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 在书架上点击一本可读的书：按当前模式分流
  function onPickBook(bookId) {
    // 目前只有《老人与海》有完整内容；其余可读书（自定义）仅提示
    if (bookId !== 'oldman') {
      alert('这本书已生成锚点与素材预览。完整的分幕阅读 / 沉浸对话正在开发中。');
      return;
    }
    if (shelfMode === 'read') enterRead();
    else if (shelfMode === 'chat') enterChat();
    else showBookDetail(); // 导航页模式 → 展开详情，让用户选模式
  }

  function enterRead() { go('acts'); }
  function enterChat() { go('chat'); }

  function renderShelf() {
    const shelf = $('#bookshelf');
    if (!shelf) return;
    const custom = loadCustomBooks();
    let html = SHELF_BOOKS.map((b, i) => {
      if (b.ready) {
        return bookCardHTML({ id: b.id, title: b.title, author: b.author, cover: b.cover, summary: b.summary, kind: 'builtin' });
      }
      return `<div class="shelf-book wip">
        <div class="spine">
          <span class="wip-badge">制作中</span>
          <div class="placeholder">${b.title}<br><small>${b.author}</small></div>
        </div>
        <div class="shelf-hover"><div class="sh-sum">${b.summary || ''}</div><div class="sh-wip">制作中 · 敬请期待</div></div>
      </div>`;
    }).join('');

    // 用户自定义生成的书
    html += custom.map((b) =>
      bookCardHTML({ id: b.id, title: b.title, author: b.author || '我的书', cover: b.cover, summary: b.intro || b.chapter1 || '', kind: 'custom' })
    ).join('');

    // 添加我的书
    html += `<div class="shelf-book add" data-shelf="add">
      <div class="spine"><span class="plus">＋</span><span class="lbl">添加我的书</span></div>
    </div>`;

    shelf.innerHTML = html;
    // 点击书脊 → 选书；点击「查看素材」→ 素材弹窗（阻止冒泡）
    $$('.shelf-book').forEach(el => {
      const kind = el.dataset.shelf;
      const bookId = el.dataset.book;
      if (kind === 'add') { el.onclick = () => openAdd(); return; }
      if (kind === 'book') {
        const spine = el.querySelector('.spine');
        if (spine) spine.onclick = () => onPickBook(bookId);
        // 悬停浮层：点「进入」或摘要空白区 → 进入书籍
        const enterBtn = el.querySelector('.sh-enter');
        if (enterBtn) enterBtn.onclick = (e) => { e.stopPropagation(); onPickBook(bookId); };
        const sum = el.querySelector('.sh-sum');
        if (sum) sum.onclick = (e) => { e.stopPropagation(); onPickBook(bookId); };
        // 「查看素材」独立动作，阻止冒泡
        const assetBtn = el.querySelector('.sh-assets');
        if (assetBtn) assetBtn.onclick = (e) => { e.stopPropagation(); openAssets(bookId); };
      }
    });
  }

  // 主操作文案随入口模式变化
  function enterLabel() {
    if (shelfMode === 'read') return '📖 开始阅读';
    if (shelfMode === 'chat') return '💬 开始对话';
    return '进入 →';
  }

  // 统一的可读书籍卡片（含悬停浮层：摘要 + 进入 + 查看素材）
  function bookCardHTML(b) {
    const bg = b.cover ? `style="background-image:url('${b.cover}')"` : '';
    const coverInner = b.cover ? '' : `<div class="no-cover">${b.title}</div>`;
    return `<div class="shelf-book ready" data-shelf="book" data-book="${b.id}">
      <div class="spine" ${bg}>
        ${coverInner}
        <div class="cap"><div class="t">${b.title}</div><div class="a">${b.author}</div></div>
      </div>
      <div class="shelf-hover">
        <div class="sh-sum">${b.summary || ''}</div>
        <div class="sh-actions">
          <button class="sh-enter">${enterLabel()}</button>
          <button class="sh-assets">🎨 查看素材</button>
        </div>
      </div>
    </div>`;
  }

  function showBookDetail() {
    const d = $('#book-detail');
    if (d) { d.style.display = 'block'; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  /* ============== 封面详情 ============== */
  function renderCover() {
    renderShelf();
    $('#book-intro').textContent = BOOK.intro;
    const charsBox = $('#book-chars');
    charsBox.innerHTML = BOOK.characters.map(c => `
      <div class="charcard">
        <div class="role">${c.role}</div>
        <div class="name">${c.name}</div>
        <div class="desc">${c.desc}</div>
      </div>
    `).join('');

    // 续读按钮
    const saved = loadProgress();
    const startBtn = $('.cover .start');
    if (saved > 0 && startBtn) {
      const actTitle = BOOK.acts[saved] ? BOOK.acts[saved].title : '';
      startBtn.textContent = '继续 · 第' + (saved + 1) + '幕' + (actTitle ? ' · ' + actTitle : '') + ' →';
      startBtn.onclick = () => app.openAct(saved);
      // 追加"从第一幕开始"小链接
      if (!$('#cover-restart')) {
        const lk = document.createElement('div');
        lk.id = 'cover-restart';
        lk.innerHTML = '<a href="#" onclick="event.preventDefault();app.openAct(0)">↺ 从第一幕开始</a>';
        lk.style.cssText = 'margin-top:12px;font-size:13px;color:var(--ink-3);';
        startBtn.insertAdjacentElement('afterend', lk);
      }
    }
  }

  /* ============== 幕次列表 ============== */
  function renderActs() {
    const grid = $('#acts-grid');
    const hasProgress = loadProgress() !== null; // 新用户不显示任何徽章
    grid.innerHTML = BOOK.acts.map((a, i) => {
      const done = hasProgress && i < curAct;
      const cur  = hasProgress && i === curAct;
      const badge = done
        ? '<span class="act-badge done">✓ 已读</span>'
        : cur
          ? '<span class="act-badge cur">▶ 阅读中</span>'
          : '';
      return `
      <div class="act-card" data-idx="${i}">
        <img class="illu" src="${a.image}" alt="">
        <div class="meta">
          <div class="tag">ACT ${i + 1}${badge}</div>
          <h3>${a.title}</h3>
          <div class="sub">${a.subtitle}</div>
          <div class="summary">${a.summary}</div>
        </div>
      </div>`;
    }).join('');
    $$('.act-card').forEach(card => {
      card.addEventListener('click', () => openAct(parseInt(card.dataset.idx, 10)));
    });
  }

  /* ============== 阅读器 ============== */
  let curAct = 0;
  let utterance = null;
  let isSpeaking = false;

  function openAct(idx) {
    curAct = idx;
    saveProgress(idx);
    go('reader');
  }

  function renderReader() {
    const a = BOOK.acts[curAct];
    $('#r-tag').textContent = 'ACT ' + (curAct + 1) + ' / ' + BOOK.acts.length;
    $('#r-title').textContent = a.title;
    $('#r-sub').textContent = a.subtitle;
    $('#r-illu').src = a.image;
    $('#r-summary').textContent = a.summary;

    // 进度条
    const prog = $('#progress');
    prog.innerHTML = BOOK.acts.map((_, i) => {
      const cls = i < curAct ? 'done' : i === curAct ? 'cur' : '';
      return `<span class="${cls}"></span>`;
    }).join('');

    // 正文段落
    const body = $('#r-body');
    body.innerHTML = a.paragraphs.map((p, i) =>
      `<p class="para" data-i="${i}" title="点击开始朗读，再次点击停止">${renderFnRefs(p)}</p>`
    ).join('');
    body.onclick = e => {
      const fn = e.target.closest('.fn-ref');
      if (fn) { e.stopPropagation(); showFn(fn, fn.dataset.fn); return; }
      const para = e.target.closest('.para');
      if (!para) return;
      const idx = parseInt(para.dataset.i, 10);
      // 当正在朗读且点击当前高亮段 → 停止；否则从该段开始朗读
      if (isSpeaking && para.classList.contains('speaking')) { stopSpeak(); return; }
      speakFromPara(idx);
    };

    // 名言
    const qb = $('#r-quote');
    if (a.quote && a.quote[0]) {
      qb.innerHTML = `${a.quote[0]}<span class="who">— ${a.quote[1]}</span>`;
      qb.style.display = 'block';
    } else {
      qb.style.display = 'none';
    }

    // 决策点
    const choice = BOOK.choices.find(c => c.actId === a.id);
    const cBox = $('#r-choice');
    if (choice) {
      cBox.innerHTML = `
        <div class="choice-card">
          <div class="label">这一刻你怎么选？</div>
          <h3>${choice.question}</h3>
          ${choice.options.map((o, i) => `
            <button class="choice-opt" data-i="${i}" data-feel="${o.feeling}">
              <span class="feel">${o.feeling}</span>${o.label}
            </button>
          `).join('')}
          <div class="choice-feedback" id="cfb"></div>
        </div>
      `;
      $$('.choice-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.i, 10);
          const o = choice.options[i];
          $$('.choice-opt').forEach(b => b.disabled = true);
          btn.style.borderColor = 'var(--accent)';
          btn.style.background = 'var(--accent-soft)';
          const f = $('#cfb');
          f.textContent = (i === (choice.canonical === 'A' ? 0 : 1) ? '✓ 和圣地亚哥一样的选择。' : '你的选择。') + ' ' + o.feedback;
          f.classList.add('show');
          speak(o.feedback);
        });
      });
    } else {
      cBox.innerHTML = '';
    }

    // 下一幕
    const nx = $('#r-next');
    if (curAct < BOOK.acts.length - 1) {
      nx.innerHTML = `<button class="tool-btn primary" onclick="app.nextAct()">下一幕 →</button>`;
    } else {
      nx.innerHTML = `<div class="quote-block" style="border:none;padding:20px;">— 全书完 —<br><br><button class="tool-btn primary" onclick="app.go('chat')">去和圣地亚哥聊聊</button></div>`;
    }
  }

  function nextAct() {
    if (curAct < BOOK.acts.length - 1) openAct(curAct + 1);
  }

  /* ============== TTS 配音 ============== */
  function getVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => /zh|Chinese|Mandarin/i.test(v.lang + ' ' + v.name))
        || voices.find(v => /zh/i.test(v.lang));
  }

  function speak(text, onend, rate) {
    stopSpeak();
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = rate || 0.95;
    u.pitch = 0.95;
    const v = getVoice();
    if (v) u.voice = v;
    if (onend) u.onend = onend;
    utterance = u;
    isSpeaking = true;
    window.speechSynthesis.speak(u);
  }

  function setToolbarState(speaking) {
    const btnSpeak = $('#btn-speak-act');
    const btnStop  = $('#btn-stop-speak');
    if (btnSpeak) {
      btnSpeak.style.display = speaking ? 'none' : '';
      if (speaking) {
        btnSpeak.textContent = '🔊 朗读本幕';
      }
    }
    if (btnStop)  btnStop.style.display  = speaking ? '' : 'none';
  }

  function stopSpeak() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (mmAudio) { try { mmAudio.pause(); mmAudio.currentTime = 0; } catch (e) {} mmAudio = null; }
    // 标记停止，避免异步链式回调继续推进到下一段
    _speakChainStopped = true;
    isSpeaking = false;
    utterance = null;
    $$('.para.speaking').forEach(p => p.classList.remove('speaking'));
    setToolbarState(false);
  }

  // 当前朗读链的停止信标：为 true 时链式回调不应继续
  let _speakChainStopped = false;

  function speakAct() {
    // 如果正在朗读，点击喇叭 = 停止
    if (isSpeaking) { stopSpeak(); return; }
    const a = BOOK.acts[curAct];
    speakFromPara(0, a.summary + '。');
  }

  /* 逐段链式朗读：使用 MiniMax TTS（降级浏览器语音），每读完一段自动推进 */
  async function speakFromPara(startIdx, prefix) {
    stopSpeak();
    _speakChainStopped = false;
    setToolbarState(true);
    const a = BOOK.acts[curAct];
    const paras = $$('#r-body .para');

    async function readNext(idx) {
      if (_speakChainStopped) return;
      if (idx >= a.paragraphs.length) {
        setToolbarState(false);
        isSpeaking = false;
        return;
      }
      const text = (idx === startIdx && prefix ? prefix : '') + a.paragraphs[idx];

      // 高亮当前段
      $$('.para.speaking').forEach(p => p.classList.remove('speaking'));
      const el = paras[idx];
      if (el) {
        el.classList.add('speaking');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      isSpeaking = true;

      // 检查是否被提前停止（例：stopSpeak 在 async 间隙调用）
      if (_speakChainStopped) { isSpeaking = false; return; }

      await speakAsync(text, { rate: 0.95 });
      readNext(idx + 1);
    }

    readNext(startIdx);
  }

  /* 返回一个在音频播放完成时 resolve 的 Promise */
  function speakAsync(text, opts) {
    return new Promise((resolve) => {
      const key = getCfg('mm_voice');
      const o = opts || {};
      if (!key) {
        // 降级浏览器 TTS
        if (!('speechSynthesis' in window)) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN'; u.rate = o.rate || parseFloat(getUserCfg('tts_rate', '0.95')); u.pitch = 0.95;
        const v = getVoice(); if (v) u.voice = v;
        u.onend = resolve;
        u.onerror = resolve;
        utterance = u;
        window.speechSynthesis.speak(u);
        return;
      }
      // MiniMax TTS
      fetch('https://api.minimaxi.com/v1/t2a_v2', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'speech-02-turbo',
          text: text,
          stream: false,
          output_format: 'hex',
          voice_setting: { voice_id: o.voice || getUserCfg('tts_voice', 'audiobook_male_1'), speed: o.rate || parseFloat(getUserCfg('tts_rate', '0.95')), vol: 1, pitch: 0 },
          audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 }
        })
      }).then(async (res) => {
        if (!res.ok || _speakChainStopped) { resolve(); return; }
        const data = await res.json();
        const hex = data && data.data && data.data.audio;
        if (!hex || _speakChainStopped) { resolve(); return; }
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
        if (mmAudio) { mmAudio.pause(); }
        mmAudio = new Audio(url);
        mmAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        mmAudio.onerror = resolve;
        mmAudio.play();
      }).catch(() => resolve());
    });
  }

  /* ============== 沉浸对话：对话式阅读引擎 ============== */
  let chatMuted = false;
  let storyStarted = false;
  let storyBusy = false;
  let curPersona = null;
  let storyHistory = []; // { role, content } 传给 LLM
  let storyPath = [];     // 已选择的路径（用户每一步输入），用于回合缓存键

  /* ============== 回合缓存：书+视角+路径 → { narrative, scene, choices, img } ============== */
  // 相同选项序列直接命中缓存：零 API 调用、剧情与配图完全一致。
  const STORY_CACHE_KEY = 'story_cache_v1';
  function loadStoryCache() {
    try { return JSON.parse(localStorage.getItem(STORY_CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function storyCacheKey(bookId, personaId, path) {
    // 归一化每步输入，避免空白差异导致不命中
    const norm = path.map(s => String(s).trim().replace(/\s+/g, ' '));
    return bookId + '|' + personaId + '|' + JSON.stringify(norm);
  }
  function getCachedTurn(bookId, personaId, path) {
    return loadStoryCache()[storyCacheKey(bookId, personaId, path)] || null;
  }
  function saveCachedTurn(bookId, personaId, path, turn) {
    try {
      const all = loadStoryCache();
      all[storyCacheKey(bookId, personaId, path)] = turn;
      localStorage.setItem(STORY_CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* 超配额则忽略，不影响体验 */ }
  }
  function clearStoryCache() {
    try { localStorage.removeItem(STORY_CACHE_KEY); } catch (e) {}
    const st = $('#cache-status');
    if (st) { st.textContent = '✓ 已清除'; setTimeout(() => { st.textContent = ''; }, 2000); }
  }

  const PERSONAS = [
    { id: 'observer', pic: '👁️', nm: '旁观者', rl: '第三人称视角', voice: 'audiobook_male_1', rate: 0.95,
      ds: '你是隐形的见证者，站在故事之外，决定镜头看向哪里、聚焦谁。',
      persp: '第三人称全知视角的隐形叙述者。用户不是角色，而是决定叙事焦点与走向的"读者之眼"。' },
    { id: 'santiago', pic: '🎣', nm: '圣地亚哥', rl: '古巴老渔夫', voice: 'presenter_male', rate: 0.88,
      ds: '你就是老人。八十四天空手而归，如今独自面对那条比船还长的大鱼。',
      persp: '第一人称，用户扮演老渔夫圣地亚哥本人。选项是他此刻可以做的事、可以想的念头。' },
    { id: 'manolin', pic: '👦', nm: '马诺林', rl: '老人的男孩', voice: 'male-qn-jingying', rate: 1.0,
      ds: '你是那个爱着老人的男孩，被父母调去别的船，却始终牵挂着他。',
      persp: '第一人称，用户扮演男孩马诺林。选项是他在岸上、在心里、面对老人时可以做的事。' }
  ];

  function toggleChatMute() {
    chatMuted = !chatMuted;
    if (chatMuted) stopSpeak();
    const btn = $('#btn-chat-mute');
    if (btn) btn.textContent = chatMuted ? '🔇' : '🔊';
    if (btn) btn.title = chatMuted ? '点击取消静音' : '点击静音';
  }

  // 进入沉浸对话视图：显示视角选择
  function renderChatInit() {
    if (!storyStarted) renderPersonaSelect();
  }

  function renderPersonaSelect() {
    const sel = $('#persona-select');
    const stage = $('#story-stage');
    if (sel) sel.style.display = 'block';
    if (stage) stage.style.display = 'none';
    const grid = $('#persona-grid');
    if (!grid) return;
    grid.innerHTML = PERSONAS.map(p => `
      <div class="persona-card" data-id="${p.id}">
        <div class="pic">${p.pic}</div>
        <div class="nm">${p.nm}</div>
        <div class="rl">${p.rl}</div>
        <div class="ds">${p.ds}</div>
      </div>`).join('');
    $$('.persona-card').forEach(c => { c.onclick = () => startStory(c.dataset.id); });
  }

  function restartStory() {
    storyStarted = false;
    storyHistory = [];
    storyPath = [];
    curPersona = null;
    stopSpeak();
    $('#chat-log').innerHTML = '';
    $('#story-choices').innerHTML = '';
    renderPersonaSelect();
  }

  async function startStory(personaId) {
    curPersona = PERSONAS.find(p => p.id === personaId);
    if (!curPersona) return;
    // 校验 LLM 配置
    if (!getCfg('llm_base') || !getCfg('llm_key') || !getCfg('llm_model')) {
      alert('沉浸对话需要 LLM。请按 Ctrl+Shift+D 打开开发者模式，填入 BaseURL / API Key / Model 后再试。');
      return;
    }
    storyStarted = true;
    storyHistory = [{ role: 'system', content: buildStorySystemPrompt(curPersona) }];
    storyPath = [];
    $('#persona-select').style.display = 'none';
    $('#story-stage').style.display = 'block';
    $('#story-persona').innerHTML = '视角：<b>' + curPersona.nm + '</b> · ' + curPersona.rl;
    $('#chat-log').innerHTML = '';
    $('#story-choices').innerHTML = '';
    await advanceStory('【开始】请从这个视角带我进入故事的开端。');
  }

  function buildStorySystemPrompt(persona) {
    const allText = BOOK.acts.map(a => `【${a.title}】` + a.summary).join('\n');
    return `你是《老人与海》（海明威著）的互动叙事引擎，负责把这部小说改写成"对话式阅读"体验。

【玩家视角】${persona.persp}

【原著脉络（务必忠于此，不得杜撰主线）】
${allText}

【你的任务】
每一轮，你都要：
1. 用 4-6 句富有画面感的中文叙述，推进当前情节（贴合玩家视角的所见所感），有起伏、有细节、有情绪的落点。
2. 恰当处自然引用一句原著台词或名句（用引号标出），让文字有海明威的原味；不要生硬堆砌。
3. 给出恰好 3 个玩家此刻可以做出的选择（简短，动词开头，各有不同倾向：行动 / 观察 / 内省）。
4. 玩家也可能自由输入行动，你要顺着他的输入合理推进，同时把故事拉回原著主线。
5. 随着轮次推进，故事应循原著五幕逐步走向结局（出海—搏鱼—归途遇鲨—空手而归—梦见狮子），不要原地打转。
6. 给出这一幕的"画面描述"scene：一句话客观描述此刻的场景（地点、人物动作、光线、氛围、色调），用于生成电影感插图。

【硬性要求】
- 严格忠于原著情节与人物，不发明与原著冲突的重大剧情。
- 语言凝练、有海明威式的克制质感。
- 只输出 JSON，不要任何多余文字，格式：
{"narrative":"这一段的叙述文字","scene":"这一幕的画面描述","choices":["选择一","选择二","选择三"]}`;
  }

  /* 推进一轮：把玩家输入加入历史 → 命中缓存则直出，否则请求 LLM → 渲染叙述+插图+选项 */
  async function advanceStory(userInput) {
    if (storyBusy) return;
    storyBusy = true;
    if (userInput && !/^【开始】/.test(userInput)) addUserMsg(userInput);
    storyHistory.push({ role: 'user', content: userInput });
    storyPath.push(userInput); // 记录路径用于缓存键
    setChoices([]); // 清空选项，避免重复点击

    const personaId = curPersona ? curPersona.id : 'observer';
    const cached = getCachedTurn('oldman', personaId, storyPath);

    if (cached) {
      // 命中缓存：零 API 调用，剧情与配图完全一致
      storyHistory.push({ role: 'assistant', content: JSON.stringify({ narrative: cached.narrative, scene: cached.scene, choices: cached.choices }) });
      const narrEl = addNarr(cached.narrative);
      if (cached.img) prependImage(narrEl, cached.img);
      setChoices(cached.choices || []);
      storyBusy = false;
      return;
    }

    const thinking = pushThinking();
    let turn;
    try {
      turn = await requestStoryTurn();
    } catch (e) {
      turn = { narrative: '（海上起了雾——叙事引擎出错了：' + e.message + '）', scene: '', choices: [] };
    }
    thinking.remove();
    if (thinking._timer) clearInterval(thinking._timer);
    storyHistory.push({ role: 'assistant', content: JSON.stringify(turn) });
    const narrEl = addNarr(turn.narrative);
    setChoices(turn.choices || []);
    storyBusy = false;

    // 生成这一幕插图（配置了 MiniMax 图片密钥时）；生成后连同整轮写入缓存
    let img = null;
    if (getCfg('mm_img') && turn.scene) {
      const skel = document.createElement('div');
      skel.className = 'img-skel';
      narrEl.insertBefore(skel, narrEl.firstChild);
      $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
      img = await generateImage(turn.scene, 'oldman');
      if (img) {
        const im = document.createElement('img');
        im.className = 'dialog-img';
        im.src = img;
        skel.replaceWith(im);
      } else {
        skel.remove();
      }
    }
    // 只缓存正常的一轮（出错的兜底不缓存）
    if (turn.choices && turn.choices.length) {
      saveCachedTurn('oldman', personaId, storyPath, {
        narrative: turn.narrative, scene: turn.scene, choices: turn.choices, img: img
      });
    }
  }

  function prependImage(narrEl, url) {
    const im = document.createElement('img');
    im.className = 'dialog-img';
    im.src = url;
    narrEl.insertBefore(im, narrEl.firstChild);
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  }

  async function requestStoryTurn() {
    const base = getCfg('llm_base').trim();
    const key = getCfg('llm_key').trim();
    const model = getCfg('llm_model').trim();
    const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: storyHistory,
        temperature: 0.85,
        max_tokens: 900,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error('LLM ' + res.status);
    const data = await res.json();
    let raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
    const obj = parseStoryJSON(raw);
    return {
      narrative: obj.narrative || '（无叙述）',
      scene: obj.scene || obj.narrative || '',
      choices: Array.isArray(obj.choices) ? obj.choices.slice(0, 3) : []
    };
  }

  /* 稳健解析：兼容推理模型的 <think> 标签、markdown 代码块、以及夹带解释文字的情况 */
  function parseStoryJSON(raw) {
    let s = String(raw);
    // 去掉推理模型的思考段：<think>…</think>、<reasoning>…</reasoning>
    s = s.replace(/<think[\s\S]*?<\/think>/gi, '')
         .replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '');
    // 去掉未闭合的思考起始标签之前的内容
    const openThink = s.search(/<\/think>|<\/reasoning>/i);
    if (openThink !== -1) s = s.slice(openThink).replace(/^<\/(think|reasoning)>/i, '');
    // 去掉 markdown 代码围栏
    s = s.replace(/```json|```/gi, '').trim();
    // 直接尝试
    try { return JSON.parse(s); } catch (e) {}
    // 提取第一个 { 到最后一个 } 之间的子串再试
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {}
    }
    // 仍失败：把整段当作叙述，给出兜底选项，避免中断阅读
    const fallback = s.replace(/[{}\[\]"]/g, '').trim().slice(0, 400) || '（叙事引擎没有返回有效内容，请再试一次。）';
    return { narrative: fallback, choices: ['继续', '换个做法', '停下来想一想'] };
  }

  function addNarr(text) {
    const log = $('#chat-log');
    const div = document.createElement('div');
    div.className = 'msg bot narr';
    div.title = '点击重新朗读';
    const span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);
    // 点击叙事气泡可重新朗读
    div.onclick = () => {
      if (!chatMuted) speakNarr(text, div);
    };
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    if (!chatMuted) speakNarr(text, div);
    return div;
  }

  function setChoices(choices) {
    const box = $('#story-choices');
    if (!box) return;
    if (!choices || !choices.length) { box.innerHTML = ''; return; }
    box.innerHTML = choices.map((c, i) =>
      `<button class="story-opt" data-i="${i}"><span class="no">${i + 1}</span>${c}</button>`
    ).join('');
    $$('.story-opt').forEach(btn => {
      btn.onclick = () => {
        const label = choices[parseInt(btn.dataset.i, 10)];
        $$('.story-opt').forEach(b => b.disabled = true);
        advanceStory(label);
      };
    });
  }

  /* ============== 角色知识库（主题 → 原文片段） ============== */
  const LORE = {
    fish: [
      '"鱼啊，"他轻轻地说出声来，"我跟你奉陪到死。"',
      '"鱼啊，"他说，"我爱你，非常尊敬你。不过今天无论如何要把你杀死。"',
      '"你要比我更加沉着，"老人想。"你只有你的力气，还有你的高贵气概。"',
      '鱼从水中高高跳起，把它那惊人的长度和宽度，它的力量和美，全都暴露无遗。',
      '"它从鼻子到尾巴有十八英尺长。"'
    ],
    sea: [
      '他是个独自在湾流中一条小船上钓鱼的老人，至今已去了八十四天，一条鱼也没逮住。',
      '看这海流，明儿会是个好日子。',
      '大海非常浩瀚，小船很小。但老人心里有片海，比大海还宽阔。',
      '他总是把大海看作女性，看作施予恩惠或拒绝施恩的女性。'
    ],
    lion: [
      '他不再梦见风暴，不再梦见女人，不再梦见伟大的事迹……他只梦见遥远的地方和狮子在落日余晖里上岸的景象。',
      '老人梦见狮子了。他觉得这是吉祥的预兆。',
      '狮子在黄昏的沙滩上嬉戏，这是他唯一的梦。'
    ],
    manolin: [
      '"我很想去。即使不能陪你钓鱼，我也很想给你多少做点事。"',
      '孩子爱老人，老人教会了这孩子捕鱼。',
      '"你头一回带我上船，我有多大？"  "五岁。"',
      '"你带我出海吧，"孩子说。"我已经长大了，可以有用了。"'
    ],
    defeat: [
      '"一个人可以被毁灭，但不能给打败。"',
      '"它们把我打垮了，马诺林，"他说。"它们确实把我打垮了。" "它没有把你打垮。那条鱼可没有。"',
      '他每次把那条鱼叉扎进去，他都感到那就是他自己的死亡，但他奉陪到底了。'
    ],
    shark: [
      '第一条鲨鱼来的时候，他用鱼叉扎它，把鱼叉扎得很深。',
      '鲨鱼一条接着一条，他用棍棒、用舵柄，用一切能拿到的东西还击。',
      '"别去想它了，老头儿。靠岸以后再说吧。"'
    ],
    pain: [
      '他把钓索放在背上，用肩膀扛着，让它替他扛着重量。',
      '双手抽筋了，但他把手伸进海水里，慢慢地张开，再慢慢地握紧。',
      '"要沉着，要有力，老头儿。"'
    ],
    eighty_four: [
      '连续八十四天没有捕到一条鱼——但他从未放弃。',
      '"八十五是个吉利的数目，"老人说。',
      '"不过你该记得，你有一回八十七天钓不到一条鱼，跟着有三个礼拜，我们每天都逮住了大鱼。"'
    ]
  };

  /* 话题关键词映射 */
  function detectTopic(q) {
    if (/大鱼|马林|鱼啊|那条鱼/.test(q)) return 'fish';
    if (/大海|海水|海流|湾流|海上/.test(q)) return 'sea';
    if (/狮子|梦/.test(q)) return 'lion';
    if (/马诺林|孩子|男孩/.test(q)) return 'manolin';
    if (/打败|毁灭|失败|坚持|放弃|不服/.test(q)) return 'defeat';
    if (/鲨鱼|被抢|鱼骨/.test(q)) return 'shark';
    if (/手|痛|抽筋|坚持|力气/.test(q)) return 'pain';
    if (/八十四|84|没捕到|空手|背运/.test(q)) return 'eighty_four';
    return null;
  }

  /* 语气模板（按意图 × 话题组合，引用 top 原文） */
  function buildReply(intent, topic, topPara) {
    const quote = topPara ? topPara.p.substring(0, 55) + '……' : '';
    const loreQuote = topic && LORE[topic]
      ? LORE[topic][Math.floor(Math.random() * LORE[topic].length)]
      : quote;

    const replies = {
      why: [
        '孩子，你问为什么。' + (loreQuote || '因为大海不容我退让。'),
        '人不是为失败而生的。就这么简单。孩子，你记着。',
        loreQuote || '鱼啊，我跟你奉陪到死。这不是选择，是必然。'
      ],
      how: [
        '要沉着，要有力，老头儿。' + (loreQuote ? ' ' + loreQuote : ''),
        '把钓索绕在肩上，让它替你扛着。双手血流不止，但不要松手。',
        loreQuote || '就一步一步来。海上没有别的办法。'
      ],
      what: [
        loreQuote || '那是我在大海上遇见的事，孩子。',
        loreQuote || '你说的是' + (topic ? { fish:'那条大马林鱼', sea:'大海', lion:'狮子', manolin:'马诺林', shark:'鲨鱼' }[topic] || '这件事' : '这件事') + '吗？'
      ],
      feel: [
        '嗯。' + (loreQuote || '大海就是这样，孩子。'),
        loreQuote || '老头儿我也这么想过。',
        '你说得对。' + (loreQuote || '')
      ],
      quote: [
        loreQuote || quote,
        '"一个人可以被毁灭，但不能给打败。" 这是我信的。'
      ]
    };

    const pool = replies[intent] || (loreQuote ? [loreQuote] : [quote || '孩子，海上的事，有时候说不清。']);
    return pool.filter(Boolean)[Math.floor(Math.random() * pool.filter(Boolean).length)];
  }

  /* 检索式回复：关键词检索 + 意图 × 话题模板 */
  function localReply(q) {
    const stops = new Set('的了是我你他她它们在和与吗呢啊吧啦把让给对也都还就才再很真这那'.split(''));
    const tokens = q.split(/\s+|[，。？！、：；""''【】()（）\[\]]/).flatMap(w =>
      w.split('').length > 4 ? [w] : [w]
    ).filter(t => t.length >= 2 && !stops.has(t));

    if (tokens.length === 0) return pickByCue(q);

    // 全文检索，加权：标题 × 2
    const hits = [];
    BOOK.acts.forEach(a => {
      a.paragraphs.forEach((p, idx) => {
        let score = 0;
        tokens.forEach(t => { if (p.includes(t)) score += 1; });
        if (score > 0) hits.push({ score, p, act: a.title, idx });
      });
    });
    hits.sort((x, y) => y.score - x.score);

    const intent = detectIntent(q);
    const topic  = detectTopic(q);

    if (hits.length === 0 && !topic) {
      return pickByCue(q);
    }

    const top = hits[0] || null;
    const refSnippet = hits.slice(0, 2).map(h => h.p.substring(0, 40)).join(' / ');
    const srcLabel = top ? ('—— 摘自《' + top.act + '》') : '—— 老人望了望海面';

    const text = buildReply(intent, topic, top);
    return { text, src: srcLabel + (refSnippet ? '：' + refSnippet + '……' : '') };
  }

  function detectIntent(q) {
    if (/为什么|为何|凭什么|怎么办/.test(q)) return 'why';
    if (/怎么|如何|方法|能不能/.test(q)) return 'how';
    if (/什么|谁|哪|多大|多少/.test(q)) return 'what';
    if (/感觉|觉得|心情|难过|害怕|孤独/.test(q)) return 'feel';
    if (/话|名言|说过|原文|引用/.test(q)) return 'quote';
    return 'what';
  }

  function pickByCue(q) {
    if (/你好|您好|嗨|hello/i.test(q)) return { text: '你好，孩子。坐下吧，海风不小。', src: '—— 老人朝你点了点头。' };
    if (/再见|拜拜|走了|回头见/.test(q)) return { text: '去吧，孩子。好好照顾自己。', src: '—— 老人目送你离开。' };
    if (/谢谢|感谢/.test(q)) return { text: '不用谢。我们都是打鱼人。', src: '—— 老人微微一笑。' };
    if (/加油|坚持|撑下去/.test(q)) return { text: '"一个人可以被毁灭，但不能给打败。" 孩子，你也是。', src: '—— 老人握了握你的手。' };
    return { text: '嗯。海上有时候就是这样，说不清。你再说说，我听着。', src: '—— 老人沉默了片刻，望着海面。' };
  }

  /* LLM 模式 */
  async function llmReply(q) {
    const base = getCfg('llm_base').trim();
    const key = getCfg('llm_key').trim();
    const model = getCfg('llm_model').trim();
    if (!base || !key || !model) {
      return { text: '孩子，LLM 还没配好——按 Ctrl+Shift+D 打开开发者模式，填入 BaseURL / API Key / Model。', src: '（没有 LLM 配置）' };
    }
    const sys = buildSystemPrompt();
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: q }
          ],
          temperature: 0.8,
          max_tokens: 200
        })
      });
      if (!res.ok) {
        const err = await res.text();
        return { text: '孩子，海上起了风浪——LLM 那边报错了：' + res.status + '。', src: err.substring(0, 200) };
      }
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '（没有回复）';
      return { text: text.trim(), src: '（由 ' + model + ' 生成 · 提示词含 5 幕原文）' };
    } catch (e) {
      return { text: '孩子，海上起了风浪——网络或者配置有问题：' + e.message, src: '' };
    }
  }

  function pushThinking() {
    const log = $('#chat-log');
    const t = document.createElement('div');
    t.className = 'msg bot thinking-msg';
    // 动态海明威式氛围文案，每 1.8s 轮换
    const lines = [
      '海风翻过一页稿纸…',
      '老人在湾流深处拉紧钓索…',
      '云层裂开，金色的光落进水里…',
      '远处传来马林鱼摆尾的闷响…',
      '船桨划过寂静的海面…',
      '圣地亚哥眯起眼，望向天际…'
    ];
    let i = 0;
    t.innerHTML = `<span class="thinking-line">${lines[0]}</span><span class="thinking-dots"><i>·</i><i>·</i><i>·</i></span>`;
    log.appendChild(t);
    log.scrollTop = log.scrollHeight;
    const timer = setInterval(() => {
      i = (i + 1) % lines.length;
      const span = t.querySelector('.thinking-line');
      if (span) span.textContent = lines[i];
    }, 2200);
    t._timer = timer;
    return t;
  }

  function addUserMsg(t) {
    const log = $('#chat-log');
    const div = document.createElement('div');
    div.className = 'msg user';
    div.textContent = t;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function addBotMsg(payload, img) {
    const log = $('#chat-log');
    const div = document.createElement('div');
    div.className = 'msg bot';
    const imgHtml = img ? `<img class="dialog-img" src="${img}" alt="">` : '';
    if (typeof payload === 'string') {
      div.innerHTML = imgHtml + payload;
    } else {
      div.innerHTML = imgHtml + payload.text + (payload.src ? `<span class="src">${payload.src}</span>` : '');
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    if (!chatMuted) {
      const textOnly = (typeof payload === 'string' ? payload : payload.text).replace(/<[^>]+>/g, '');
      speakMaybe(textOnly, curPersona ? { voice: curPersona.voice, rate: curPersona.rate } : null);
    }
    return div;
  }

  // 自定义输入：作为玩家的自由行动推进故事
  async function sendMsg() {
    const input = $('#chat-text');
    const q = input.value.trim();
    if (!q || !storyStarted || storyBusy) return;
    input.value = '';
    await advanceStory(q);
  }

  /* ============== 服务端图片持久化 ============== */
  // 将 MiniMax CDN 图片下载并保存到服务端 volume，返回永不失效的本地 URL
  async function persistImage(externalUrl) {
    if (!externalUrl) return null;
    try {
      const res = await fetch('/api/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: externalUrl })
      });
      if (!res.ok) return externalUrl; // 服务端不可用时回退原始 URL
      const data = await res.json();
      return data.url; // /api/asset/xxx.png
    } catch (e) {
      // 本地开发无服务端 → 直接返回原始 URL
      return externalUrl;
    }
  }

  /* ============== MiniMax 图片生成 ============== */
  // 场景插图：拼入锚点 + 以该书的人物三视图作为参考图（图生图）
  async function generateImage(scene, bookId) {
    const id = bookId || 'oldman';
    const a = getAnchors(id);
    const assets = loadAnchorAssets(id);
    const ref = assets.char_turnaround || null; // 参考图 → 图生图
    // 若是本地持久化的相对路径（/api/asset/...），补全为完整 URL，MiniMax 才能访问
    const refUrl = ref ? resolveAssetUrl(ref) : null;
    const hint = refUrl ? '（严格参照参考图中的人物长相、发须与服装，保持同一角色）' : '';
    const userStyle = getUserCfg('img_style', '');
    const style = userStyle ? `${a.style}，额外要求：${userStyle}` : a.style;
    const fullPrompt = `电影分镜插画，${style}。${a.character}${hint}。场景：${scene}。${a.location}。电影级构图与光影，景深层次，情绪饱满，细腻笔触，无文字水印。`;
    return generateImageRaw(fullPrompt, '16:9', refUrl);
  }

  // 将本地资产路径（/api/asset/xxx）解析为外部可访问的完整 URL
  function resolveAssetUrl(url) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/api/asset/')) return window.location.origin + url;
    return url;
  }

  // 原始生成：完整 prompt。若传入 subjectRef（图片URL），走图生图（主体参考）
  // 生成后自动通过 /api/asset 持久化到服务端 volume
  async function generateImageRaw(prompt, aspect, subjectRef) {
    const key = getCfg('mm_img');
    if (!key) return null;
    const body = { model: 'image-01', prompt: prompt, aspect_ratio: aspect || '1:1', n: 1 };
    if (subjectRef) {
      // MiniMax 主体参考：character reference（人物一致性）
      body.subject_reference = [{ type: 'character', image_file: subjectRef }];
    }
    try {
      const res = await fetch('https://api.minimaxi.com/v1/image_generation', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        // 图生图失败（如参考图不合规）→ 退回纯文生图，避免整幕无图
        if (subjectRef) return generateImageRaw(prompt, aspect, null);
        return null;
      }
      const data = await res.json();
      const rawUrl = (data && data.data && data.data.image_urls && data.data.image_urls[0]) || null;
      // 持久化到服务端 volume，避免 MiniMax CDN 过期
      return rawUrl ? await persistImage(rawUrl) : null;
    } catch (e) {
      if (subjectRef) return generateImageRaw(prompt, aspect, null);
      return null;
    }
  }

  /* ============== MiniMax TTS（降级 Web Speech + 本地缓存） ============== */
  let mmAudio = null;
  const TTS_CACHE_KEY = 'tts_cache_v1';

  function loadTTSCache() {
    try { return JSON.parse(localStorage.getItem(TTS_CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }

  // 缓存键：voice + rate + 文本前 60 字符的 hash
  function ttsCacheKey(text, voice, rate) {
    const head = text.slice(0, 60).trim();
    return voice + '|' + (rate || 0.95).toFixed(2) + '|' + simpleHash(head);
  }

  function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h.toString(36);
  }

  function getCachedTTS(text, voice, rate) {
    return loadTTSCache()[ttsCacheKey(text, voice, rate)] || null;
  }

  function saveCachedTTS(text, voice, rate, hex) {
    try {
      const all = loadTTSCache();
      all[ttsCacheKey(text, voice, rate)] = hex;
      localStorage.setItem(TTS_CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* 超配额则忽略 */ }
  }

  function playHexAudio(hex) {
    return new Promise((resolve) => {
      try {
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
        if (mmAudio) { mmAudio.pause(); }
        mmAudio = new Audio(url);
        mmAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        mmAudio.onerror = resolve;
        mmAudio.play();
      } catch (e) { resolve(); }
    });
  }

  // opts: { voice, rate } —— 沉浸对话按视角传入不同音色/语速
  async function speakMaybe(text, opts) {
    const key = getCfg('mm_voice');
    const o = opts || {};
    const voice = o.voice || getUserCfg('tts_voice', 'audiobook_male_1');
    const rate = o.rate || parseFloat(getUserCfg('tts_rate', '0.95'));

    // 1. 先查 TTS 缓存
    const cached = getCachedTTS(text, voice, rate);
    if (cached) { stopSpeak(); await playHexAudio(cached); return; }

    // 2. 未配置 MiniMax → 降级浏览器 TTS
    if (!key) { speak(text, null, rate); return; }

    // 3. 调 MiniMax T2A
    try {
      stopSpeak();
      const res = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'speech-02-turbo',
          text: text,
          stream: false,
          output_format: 'hex',
          voice_setting: { voice_id: voice, speed: rate, vol: 1, pitch: 0 },
          audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 }
        })
      });
      if (!res.ok) { speak(text, null, rate); return; }
      const data = await res.json();
      const hex = data && data.data && data.data.audio;
      if (!hex) { speak(text, null, rate); return; }

      // 4. 存入缓存 + 播放
      saveCachedTTS(text, voice, rate, hex);
      await playHexAudio(hex);
    } catch (e) { speak(text, null, rate); }
  }

  // 带视觉高亮的朗读：高亮指定 DOM 元素，播放结束后恢复
  async function speakNarr(text, el) {
    if (!el) { await speakMaybe(text, curPersona ? { voice: curPersona.voice, rate: curPersona.rate } : null); return; }
    el.classList.add('speaking');
    await speakMaybe(text, curPersona ? { voice: curPersona.voice, rate: curPersona.rate } : null);
    el.classList.remove('speaking');
  }

  /* ============== 开发者面板 ============== */
  function openDev() {
    $('#cfg-mm-img').value   = getCfg('mm_img');
    $('#cfg-mm-voice').value = getCfg('mm_voice');
    $('#cfg-llm-base').value  = getCfg('llm_base');
    $('#cfg-llm-key').value   = getCfg('llm_key');
    $('#cfg-llm-model').value = getCfg('llm_model');
    renderAnchorBookSelect();
    renderAnchorGrid();
    $('#dev-mask').classList.add('show');
  }
  function closeDev() {
    $('#dev-mask').classList.remove('show');
  }
  function saveDev() {
    setCfg('mm_img',   $('#cfg-mm-img').value.trim());
    setCfg('mm_voice', $('#cfg-mm-voice').value.trim());
    setCfg('llm_base',  $('#cfg-llm-base').value.trim());
    setCfg('llm_key',   $('#cfg-llm-key').value.trim());
    setCfg('llm_model', $('#cfg-llm-model').value.trim());
    const s = $('#dev-saved');
    s.textContent = '✓ 已保存';
    setTimeout(() => { s.textContent = ''; }, 2000);
  }

  /* ============== 用户设置面板 ============== */
  function openSettings(e) {
    if (e && e.target !== e.currentTarget) return;
    // 填充当前值到 UI
    const sel = $('#cfg-voice');
    sel.innerHTML = VOICE_OPTIONS.map(o => `<option value="${o.id}"${o.id === getUserCfg('tts_voice', 'audiobook_male_1') ? ' selected' : ''}>${o.label}</option>`).join('');
    const rate = parseFloat(getUserCfg('tts_rate', '0.95'));
    const slider = $('#cfg-rate');
    slider.value = rate;
    $('#cfg-rate-val').textContent = rate.toFixed(2);
    slider.oninput = () => { $('#cfg-rate-val').textContent = parseFloat(slider.value).toFixed(2); };
    $('#cfg-img-style').value = getUserCfg('img_style', '');
    $('#settings-mask').classList.add('show');
  }
  function closeSettings(e) {
    if (e && e.target !== e.currentTarget) return;
    $('#settings-mask').classList.remove('show');
  }
  function saveSettings() {
    setUserCfg('tts_voice', $('#cfg-voice').value);
    setUserCfg('tts_rate', $('#cfg-rate').value);
    setUserCfg('img_style', $('#cfg-img-style').value.trim());
    const s = $('#settings-saved');
    s.textContent = '✓ 已保存';
    setTimeout(() => { s.textContent = ''; }, 2000);
  }
  function resetSettings() {
    setUserCfg('tts_voice', 'audiobook_male_1');
    setUserCfg('tts_rate', '0.95');
    setUserCfg('img_style', '');
    // 回填 UI
    $('#cfg-voice').value = 'audiobook_male_1';
    $('#cfg-rate').value = '0.95';
    $('#cfg-rate-val').textContent = '0.95';
    $('#cfg-img-style').value = '';
    const s = $('#settings-saved');
    s.textContent = '✓ 已恢复默认';
    setTimeout(() => { s.textContent = ''; }, 2000);
    // 清除 TTS 缓存（旧音色/语速的缓存已不匹配，清掉释放空间）
    try { localStorage.removeItem('tts_cache_v1'); } catch (e) {}
  }
  function previewVoice() {
    const voice = $('#cfg-voice').value || 'audiobook_male_1';
    const rate = parseFloat($('#cfg-rate').value) || 0.95;
    // 用一段短文本试听
    speakMaybe('你好，这是当前音色的试听效果。', { voice: voice, rate: rate });
  }

  /* ============== 锚点资产：人物三视图 + 场景背景图（按书绑定） ============== */
  let devBookId = 'oldman'; // 开发者面板当前操作的书
  const ANCHOR_SPECS = [
    { key: 'char_turnaround', cap: '人物三视图',
      prompt: (a) => `角色设定三视图（character turnaround sheet），同一人物的正面、侧面、背面三个视角并排展示，白色背景，全身。人物：${a.character}。风格：${a.style}。` },
    { key: 'bg_scene', cap: '场景背景图',
      prompt: (a) => `场景概念图，无人物，空镜。${a.location}。${a.style}。` }
  ];

  // 全部书的资产：{ bookId: { char_turnaround: url, bg_scene: url } }
  function loadAllAnchors() {
    try { return JSON.parse(localStorage.getItem('anchor_assets') || '{}'); } catch (e) { return {}; }
  }
  function loadAnchorAssets(bookId) {
    return loadAllAnchors()[bookId || devBookId] || {};
  }
  function saveAnchorAsset(bookId, key, url) {
    const all = loadAllAnchors();
    if (!all[bookId]) all[bookId] = {};
    all[bookId][key] = url;
    try { localStorage.setItem('anchor_assets', JSON.stringify(all)); } catch (e) {}
  }

  // 可读书列表（内置 ready + 自定义），供开发者面板选择
  function readableBooks() {
    const builtin = SHELF_BOOKS.filter(b => b.ready).map(b => ({ id: b.id, title: b.title }));
    const custom = loadCustomBooks().map(b => ({ id: b.id, title: b.title }));
    return builtin.concat(custom);
  }

  function renderAnchorBookSelect() {
    const sel = $('#anchor-book');
    if (!sel) return;
    const books = readableBooks();
    if (!books.find(b => b.id === devBookId)) devBookId = books[0] ? books[0].id : 'oldman';
    sel.innerHTML = books.map(b => `<option value="${b.id}"${b.id === devBookId ? ' selected' : ''}>${b.title}</option>`).join('');
    sel.onchange = () => { devBookId = sel.value; renderAnchorGrid(); };
  }

  function renderAnchorGrid() {
    const grid = $('#anchor-grid');
    if (!grid) return;
    const saved = loadAnchorAssets(devBookId);
    grid.innerHTML = ANCHOR_SPECS.map(s => {
      const url = saved[s.key];
      const body = url
        ? `<img src="${url}" alt="${s.cap}">`
        : `<div class="ph" id="anchor-ph-${s.key}">未生成</div>`;
      return `<div class="anchor-item"><div class="cap">${s.cap}</div>${body}</div>`;
    }).join('');
  }

  async function genAnchors() {
    const status = $('#anchor-status');
    if (!getCfg('mm_img')) {
      status.style.color = 'var(--accent)';
      status.textContent = '请先填写并保存 MiniMax 图片密钥';
      return;
    }
    const anchors = getAnchors(devBookId);
    status.style.color = '';
    status.textContent = '生成中…';
    renderAnchorGrid();
    ANCHOR_SPECS.forEach(s => {
      if (!loadAnchorAssets(devBookId)[s.key]) {
        const ph = $('#anchor-ph-' + s.key);
        if (ph) ph.innerHTML = '<span class="spinner"></span>生成中';
      }
    });
    let ok = 0;
    for (const spec of ANCHOR_SPECS) {
      const url = await generateImageRaw(spec.prompt(anchors));
      if (url) { saveAnchorAsset(devBookId, spec.key, url); ok++; }
      renderAnchorGrid();
    }
    status.textContent = ok === ANCHOR_SPECS.length ? '✓ 已生成' : ('完成 ' + ok + '/' + ANCHOR_SPECS.length + '（部分失败）');
    setTimeout(() => { status.textContent = ''; }, 3000);
  }

  /* ============== 书架「查看素材」弹窗 ============== */
  function bookTitleById(id) {
    const b = SHELF_BOOKS.find(x => x.id === id) || loadCustomBooks().find(x => x.id === id);
    return b ? b.title : id;
  }

  function openAssets(bookId) {
    devBookId = bookId; // 与开发者面板共用当前书
    const assets = loadAnchorAssets(bookId);
    const unlocked = isUnlocked();
    const items = ANCHOR_SPECS.map(s => {
      const url = assets[s.key];
      const body = url
        ? `<img src="${url}" alt="${s.cap}">`
        : `<div class="ph">未生成</div>`;
      return `<div class="anchor-item"><div class="cap">${s.cap}</div>${body}</div>`;
    }).join('');
    const hasAny = ANCHOR_SPECS.some(s => assets[s.key]);
    const actionRow = unlocked
      ? `<div class="dev-actions"><button class="tool-btn primary" id="assets-gen">${hasAny ? '重新生成素材' : '生成素材'}</button><span id="assets-status" class="dev-saved"></span></div>`
      : `<p class="add-hint">🔒 生成自定义素材需要体验码解锁。你现在可以查看已生成的素材。</p>`;
    $('#add-body').innerHTML = `
      <p class="add-hint">《${bookTitleById(bookId)}》的视觉锚点素材——人物三视图与场景背景图，用于保证插图前后一致。</p>
      <div class="anchor-grid" id="assets-grid">${items}</div>
      ${actionRow}`;
    // 复用 add-mask 弹窗，但换标题
    const head = $('#add-mask .dev-head h3');
    if (head) head.textContent = '🎨 ' + bookTitleById(bookId) + ' · 素材';
    $('#add-mask').classList.add('show');
    if (unlocked) {
      $('#assets-gen').onclick = async () => {
        const st = $('#assets-status');
        if (!getCfg('mm_img')) { st.style.color = 'var(--accent)'; st.textContent = '请先在开发者模式填 MiniMax 图片密钥'; return; }
        st.style.color = ''; st.textContent = '生成中…';
        await genAnchors();
        openAssets(bookId); // 刷新弹窗
      };
    }
  }

  /* ============== 体验码 + 自定义书籍上传 ============== */
  function loadCustomBooks() {
    try { return JSON.parse(localStorage.getItem('custom_books') || '[]'); } catch (e) { return []; }
  }
  function saveCustomBook(book) {
    const arr = loadCustomBooks();
    arr.push(book);
    try { localStorage.setItem('custom_books', JSON.stringify(arr)); } catch (e) {}
  }

  function openAdd() {
    $('#add-mask').classList.add('show');
    if (isUnlocked()) renderAddUpload(); // 已激活用户跳过体验码
    else renderAddCode();
  }
  function closeAdd() { $('#add-mask').classList.remove('show'); }

  function renderAddCode() {
    $('#add-body').innerHTML = `
      <p class="add-hint">添加自定义书籍需要体验码。输入后即可上传 docx / txt 文件，由 AI 生成锚点、第一章插图与内容预览。</p>
      <div class="add-code"><input id="add-code-input" maxlength="6" placeholder="体验码" autocomplete="off"></div>
      <div class="add-err" id="add-err"></div>
      <div class="dev-actions" style="margin-top:16px;">
        <button class="tool-btn primary" id="add-code-btn">解锁</button>
      </div>`;
    const go = () => {
      const v = $('#add-code-input').value.trim();
      if (v === EXPERIENCE_CODE) { setUnlocked(); renderAddUpload(); }
      else $('#add-err').textContent = '体验码不正确，请重试。';
    };
    $('#add-code-btn').onclick = go;
    $('#add-code-input').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#add-code-input').focus();
  }

  function renderAddUpload() {
    $('#add-body').innerHTML = `
      <p class="add-hint">上传一本书的文本（支持 .txt / .docx；PDF 请先转为 txt）。我们会截取开头内容，用 LLM 生成书名、简介与第一章摘要。</p>
      <div class="drop-zone" id="drop-zone">点击选择文件<br><small>.txt / .docx</small></div>
      <input type="file" id="file-input" accept=".txt,.docx" style="display:none;">
      <div class="add-err" id="add-err"></div>`;
    const fi = $('#file-input');
    $('#drop-zone').onclick = () => fi.click();
    fi.onchange = () => { if (fi.files[0]) handleFile(fi.files[0]); };
  }

  async function handleFile(file) {
    $('#add-err').textContent = '';
    let text = '';
    try {
      if (/\.docx$/i.test(file.name) && window.mammoth) {
        const buf = await file.arrayBuffer();
        const r = await window.mammoth.extractRawText({ arrayBuffer: buf });
        text = r.value;
      } else {
        text = await file.text();
      }
    } catch (e) {
      $('#add-err').textContent = '文件解析失败：' + e.message;
      return;
    }
    text = (text || '').trim();
    if (text.length < 50) { $('#add-err').textContent = '文本内容太少，换一个文件试试。'; return; }
    await generateBook(text.slice(0, 8000), file.name);
  }

  async function generateBook(excerpt, fname) {
    const base = getCfg('llm_base').trim();
    const key = getCfg('llm_key').trim();
    const model = getCfg('llm_model').trim();
    $('#add-body').innerHTML = `<div class="gen-status"><span class="spinner"></span>正在用 AI 解析这本书…</div>`;
    if (!base || !key || !model) {
      $('#add-body').innerHTML = `<p class="add-hint">还没配置 LLM。请按 Ctrl+Shift+D 打开开发者模式填入 BaseURL / Key / Model 后再试。</p>`;
      return;
    }
    let meta;
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是图书解析助手。根据给定的书籍开头文本，输出严格的 JSON：{"title":书名,"author":作者(未知则"佚名"),"intro":一句话简介,"chapter1":第一章内容摘要(120字内),"character":主角外貌特征一句话(用于人物三视图生成),"style":整体美术风格一句话,"location":主要场景环境一句话}。只输出 JSON，不要多余文字。' },
            { role: 'user', content: excerpt }
          ],
          temperature: 0.5,
          max_tokens: 600
        })
      });
      const data = await res.json();
      let raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
      raw = raw.replace(/```json|```/g, '').trim();
      meta = JSON.parse(raw);
    } catch (e) {
      $('#add-body').innerHTML = `<p class="add-hint">解析失败：${e.message}。请检查 LLM 配置与网络。</p>`;
      return;
    }
    meta.title = meta.title || fname.replace(/\.[^.]+$/, '');
    renderPreview(meta, excerpt);
  }

  async function renderPreview(meta, excerpt) {
    $('#add-body').innerHTML = `
      <div class="gen-preview">
        <div class="gen-status" id="pv-imgstatus"><span class="spinner"></span>正在生成第一章插图…</div>
        <h4>${meta.title}</h4>
        <div class="pv-author">${meta.author || '佚名'}</div>
        <div class="pv-block"><b>简介</b><br>${meta.intro || ''}</div>
        <div class="pv-block"><b>锚点</b><br>${[meta.character, meta.style, meta.location].filter(Boolean).join(' · ')}</div>
        <div class="pv-block"><b>第一章</b><br>${meta.chapter1 || ''}</div>
        <div class="add-err" id="add-err"></div>
        <div class="dev-actions">
          <button class="tool-btn primary" id="pv-confirm">确认，加入书架</button>
          <button class="tool-btn" id="pv-cancel">取消</button>
        </div>
      </div>`;
    $('#pv-cancel').onclick = () => renderAddUpload();

    // 该书的锚点规格 + 唯一 id
    const bookId = 'cb_' + Date.now().toString(36);
    const anchorSpec = {
      character: meta.character || meta.intro || meta.title,
      style: meta.style || '电影感写实插画，柔和光线',
      location: meta.location || '故事的主要场景'
    };

    // 先生成人物三视图（作为后续插图的参考锚点），再据此生成第一章封面
    let cover = null;
    const st = $('#pv-imgstatus');
    if (getCfg('mm_img')) {
      st.innerHTML = '<span class="spinner"></span>正在生成人物三视图…';
      const turn = await generateImageRaw(ANCHOR_SPECS[0].prompt(anchorSpec));
      if (turn) saveAnchorAsset(bookId, 'char_turnaround', turn);
      st.innerHTML = '<span class="spinner"></span>正在生成第一章插图…';
      const bg = await generateImageRaw(ANCHOR_SPECS[1].prompt(anchorSpec));
      if (bg) saveAnchorAsset(bookId, 'bg_scene', bg);
      cover = await generateImage(meta.chapter1 || meta.intro || meta.title, bookId);
    }
    if (cover) {
      st.outerHTML = `<img class="pv-cover" src="${cover}" alt="">`;
    } else {
      st.textContent = getCfg('mm_img') ? '插图生成失败，可无图加入书架。' : '（未配置图片密钥，跳过插图）';
    }

    $('#pv-confirm').onclick = () => {
      saveCustomBook({ id: bookId, title: meta.title, author: meta.author || '佚名', intro: meta.intro || '', anchorSpec: anchorSpec, chapter1: meta.chapter1 || '', cover: cover || null });
      closeAdd();
      renderShelf();
    };
  }

  /* ============== 账户渲染 ============== */
  function renderAccount() { acctRenderImpl(); }

  function acctRenderImpl() {
    const box = $('#account-body');
    if (!box) return;
    const user = currentUser();
    if (user) { acctRenderProfile(box, user); return; }
    acctRenderAuth(box);
  }

  function acctRenderAuth(box) {
    const isReg = acctTab === 'register';
    box.innerHTML =
      '<h2>账户</h2>' +
      '<p class="acct-sub">注册 / 登录以保存你的个人信息与体验码解锁状态。此为纯前端演示，账户仅存于本机浏览器，不会上传。</p>' +
      '<div class="acct-card">' +
        '<div class="acct-tabs">' +
          '<button class="acct-tab' + (isReg ? '' : ' active') + '" id="tab-login">登录</button>' +
          '<button class="acct-tab' + (isReg ? ' active' : '') + '" id="tab-reg">注册</button>' +
        '</div>' +
        '<div class="acct-row"><label>用户名</label><input id="acct-user" autocomplete="off" placeholder="用户名"></div>' +
        (isReg ? '<div class="acct-row"><label>昵称（可选）</label><input id="acct-nick" autocomplete="off" placeholder="显示名称"></div>' : '') +
        '<div class="acct-row"><label>密码</label><input id="acct-pw" type="password" placeholder="密码"></div>' +
        (isReg ? '<div class="acct-row"><label>确认密码</label><input id="acct-pw2" type="password" placeholder="再次输入密码"></div>' : '') +
        '<div class="acct-err" id="acct-err"></div>' +
        '<div class="acct-actions">' +
          '<button class="tool-btn primary" id="acct-submit">' + (isReg ? '注册并登录' : '登录') + '</button>' +
        '</div>' +
      '</div>';
    $('#tab-login').onclick = () => { acctTab = 'login'; acctRenderImpl(); };
    $('#tab-reg').onclick = () => { acctTab = 'register'; acctRenderImpl(); };
    const submit = () => isReg ? acctRegister() : acctLogin();
    $('#acct-submit').onclick = submit;
    box.querySelectorAll('input').forEach(inp => {
      inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
    });
  }

  function acctRegister() {
    const err = $('#acct-err');
    const u = ($('#acct-user').value || '').trim();
    const nick = ($('#acct-nick') ? $('#acct-nick').value || '' : '').trim();
    const pw = $('#acct-pw').value || '';
    const pw2 = $('#acct-pw2').value || '';
    if (u.length < 2) { err.textContent = '用户名至少 2 个字符。'; return; }
    if (pw.length < 4) { err.textContent = '密码至少 4 位。'; return; }
    if (pw !== pw2) { err.textContent = '两次输入的密码不一致。'; return; }
    const accs = loadAccounts();
    if (accs[u]) { err.textContent = '该用户名已被注册，换一个或直接登录。'; return; }
    accs[u] = { pw: hashPw(pw), nickname: nick || u, email: '' };
    saveAccounts(accs);
    setSession(u);
    acctRenderImpl();
  }

  function acctLogin() {
    const err = $('#acct-err');
    const u = ($('#acct-user').value || '').trim();
    const pw = $('#acct-pw').value || '';
    const acc = loadAccounts()[u];
    if (!acc || acc.pw !== hashPw(pw)) { err.textContent = '用户名或密码不正确。'; return; }
    setSession(u);
    acctRenderImpl();
  }

  function acctLogout() { setSession(null); acctTab = 'login'; acctRenderImpl(); }

  function acctRenderProfile(box, user) {
    const unlocked = isUnlocked();
    box.innerHTML =
      '<h2>账户</h2>' +
      '<p class="acct-hi">你好，<b>' + (user.nickname || user.username) + '</b>' +
        '<span class="acct-badge ' + (unlocked ? 'on' : 'off') + '">' + (unlocked ? '✓ 已解锁体验' : '未解锁') + '</span></p>' +
      '<p class="acct-sub">在这里管理你的个人信息与体验码。</p>' +
      '<div class="acct-card">' +
        '<div class="acct-glabel">个人信息</div>' +
        '<div class="acct-row"><label>用户名（不可修改）</label><input id="pf-user" value="' + user.username + '" disabled></div>' +
        '<div class="acct-row"><label>昵称</label><input id="pf-nick" value="' + (user.nickname || '') + '" placeholder="显示名称"></div>' +
        '<div class="acct-row"><label>邮箱</label><input id="pf-email" value="' + (user.email || '') + '" placeholder="you@example.com"></div>' +
        '<div class="acct-ok" id="pf-ok"></div>' +
        '<div class="acct-actions"><button class="tool-btn primary" id="pf-save">保存信息</button></div>' +
        '<hr class="acct-divider">' +
        '<div class="acct-glabel">体验码</div>' +
        (unlocked
          ? '<p class="acct-sub" style="margin-bottom:0;">✓ 你已解锁，可上传自定义书籍并生成自定义素材。</p>'
          : '<div class="acct-row"><label>输入体验码解锁上传与素材生成</label><input id="pf-code" maxlength="6" autocomplete="off" placeholder="体验码"></div>' +
            '<div class="acct-err" id="pf-code-err"></div>' +
            '<div class="acct-actions"><button class="tool-btn primary" id="pf-code-btn">解锁</button></div>') +
        '<hr class="acct-divider">' +
        '<div class="acct-actions"><button class="tool-btn" id="pf-logout">退出登录</button></div>' +
      '</div>';
    $('#pf-save').onclick = () => {
      const accs = loadAccounts();
      if (!accs[user.username]) return;
      accs[user.username].nickname = ($('#pf-nick').value || '').trim() || user.username;
      accs[user.username].email = ($('#pf-email').value || '').trim();
      saveAccounts(accs);
      const ok = $('#pf-ok'); ok.textContent = '✓ 已保存';
      setTimeout(() => { ok.textContent = ''; }, 2000);
      acctRenderImpl();
    };
    $('#pf-logout').onclick = acctLogout;
    if (!unlocked) {
      $('#pf-code-btn').onclick = () => {
        const v = ($('#pf-code').value || '').trim();
        if (v === EXPERIENCE_CODE) { setUnlocked(); acctRenderImpl(); }
        else $('#pf-code-err').textContent = '体验码不正确，请重试。';
      };
      $('#pf-code').onkeydown = e => { if (e.key === 'Enter') $('#pf-code-btn').click(); };
    }
  }

  /* ============== 进度持久化 ============== */
  function saveProgress(idx) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ act: idx, t: Date.now() })); } catch (e) {}
  }
  function loadProgress() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      // 没有保存过则返回 null（区分"第一次"和"已读到第0幕"）
      return typeof d.act === 'number' ? d.act : null;
    } catch (e) { return null; }
  }

  /* ============== 绑定事件 ============== */
  document.addEventListener('DOMContentLoaded', async () => {
    // 从服务端拉取默认配置（Railway 环境变量注入）；本地 dev_* 仍优先
    try {
      const r = await fetch('/api/config');
      if (r.ok) srvCfg = await r.json();
    } catch (e) { /* 本地无服务端时忽略 */ }
    curAct = loadProgress() ?? 0;   // null = 新用户，默认 0
    renderCover();
    renderActs();

    $$('.nav-btn').forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.view;
        // 传统阅读 / 沉浸对话 先回到书架选书，而不是直接进入
        if (v === 'acts') showShelf('read');
        else if (v === 'chat') showShelf('chat');
        else if (v === 'cover') showShelf('nav');
        else go(v);
      });
    });
    $('#chat-text').addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => { /* warm up */ };
    }

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { stopSpeak(); closeDev(); closeAdd(); closeSettings(); }
      // 开发者模式：Ctrl+Shift+D
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const mask = $('#dev-mask');
        if (mask.classList.contains('show')) closeDev(); else openDev();
      }
      // 设置面板：Ctrl+Shift+S
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        const mask = $('#settings-mask');
        if (mask.classList.contains('show')) closeSettings(); else openSettings();
      }
    });
  });

  /* ============== 暴露 API ============== */
  window.app = {
    go,
    openAct,
    nextAct,
    sendMsg,
    speakAct: () => speakAct(),
    speakFromPara,
    stopSpeak,
    speak,
    toggleChatMute,
    openDev,
    closeDev,
    saveDev,
    openSettings,
    closeSettings,
    saveSettings,
    resetSettings,
    previewVoice,
    genAnchors,
    openAdd,
    closeAdd,
    showShelf,
    enterRead,
    enterChat,
    restartStory,
    openAssets,
    onPickBook,
    clearStoryCache
  };
})();