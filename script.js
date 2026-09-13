// ══════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════
const PAGES = ['overview', 'year', 'compare', 'income', 'bills', 'expenses', 'savings', 'debts', 'settings'];
const SECS = ['income', 'bills', 'expenses', 'savings', 'debts'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];

// ─── UNDO STACK ───
const undoStack = [];
const MAX_UNDO = 20;
function pushUndo() {
    try {
        const snapshot = { key: monthKey(curYear, curMonth), data: D };
        undoStack.push(JSON.stringify(snapshot));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    } catch (e) { }
}

// ══════════════════════════════════════════
//  DATA MODEL
// ══════════════════════════════════════════
function monthKey(y, m) { return `${y}-${String(m).padStart(2, '0')}` }

function defMonthData() {
    return {
        income: [{ name: 'الراتب', planned: 0, actual: 0, note: '', date: '', repeat: false }],
        bills: [
            { name: 'الماء والكهرباء', planned: 0, actual: 0, note: '', date: '', repeat: true },
            { name: 'الهاتف', planned: 0, actual: 0, note: '', date: '', repeat: true },
            { name: 'الويفي', planned: 0, actual: 0, note: '', date: '', repeat: true },
            { name: 'فاتورة 1', planned: 0, actual: 0, note: '', date: '', repeat: false },
        ],
        expenses: [
            { name: 'مصروف المنزل', planned: 0, actual: 0, note: '', date: '', repeat: false },
            { name: 'المواصلات', planned: 0, actual: 0, note: '', date: '', repeat: false },
            { name: 'الخرجات', planned: 0, actual: 0, note: '', date: '', repeat: false },
            { name: 'العناية الشخصية', planned: 0, actual: 0, note: '', date: '', repeat: false },
            { name: 'ملابس', planned: 0, actual: 0, note: '', date: '', repeat: false },
        ],
        savings: [
            { name: 'هدف ادخار 1', planned: 0, actual: 0, note: '', date: '', repeat: false },
            { name: 'طوارئ', planned: 0, actual: 0, note: '', date: '', repeat: false },
        ],
        debts: [{ name: 'دين 1', planned: 0, actual: 0, note: '', date: '', repeat: false }]
    };
}

// ── تحميل + تنقية أولية لبيانات localStorage ──
function sanitizeAllData(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const clean = {};
    Object.keys(raw).forEach(key => {
        if (!/^\d{4}-\d{2}$/.test(key)) return;
        const month = sanitizeMonthData(raw[key]);
        if (month) clean[key] = month;
    });
    return clean;
}

let ALL = (() => {
    try {
        const s = localStorage.getItem('myz_v4');
        if (!s) return {};
        return sanitizeAllData(JSON.parse(s));
    } catch {
        return {};
    }
})();

const now = new Date();
let curYear = now.getFullYear();
let curMonth = now.getMonth() + 1;
let viewYear = curYear;

function getMonth(y, m) {
    const k = monthKey(y, m);
    if (!ALL[k]) ALL[k] = defMonthData();
    return ALL[k];
}

function peekMonth(y, m) {
    return ALL[monthKey(y, m)] || null;
}

function monthHasRealData(y, m) {
    const data = peekMonth(y, m);
    if (!data) return false;
    return SECS.some(sec => data[sec].some(r => (r.actual || 0) > 0 || (r.planned || 0) > 0));
}

let D = getMonth(curYear, curMonth);

const save = () => {
    try {
        localStorage.setItem('myz_v4', JSON.stringify(ALL));
    } catch (e) {
        showAlert('danger', '⚠️ امتلأت ذاكرة المتصفح! صدّر نسخة احتياطية الآن');
    }
};

const sumD = (sec, f) => D[sec].reduce((s, r) => s + (r[f] || 0), 0);
const sumM = (data, sec, f) => data[sec].reduce((s, r) => s + (r[f] || 0), 0);

// ── M3: ملخص موحّد لشهر (income / bills / expenses / savings / debts) ──
// كيرجع القيم الموحّدة (للعرض) + القيم الخام (للحسابات الدقيقة)
function getMonthSummary(data) {
    if (!data) return null;
    const ia = sumM(data, 'income', 'actual'), ip = sumM(data, 'income', 'planned');
    const ba = sumM(data, 'bills', 'actual'), bp = sumM(data, 'bills', 'planned');
    const ea = sumM(data, 'expenses', 'actual'), ep = sumM(data, 'expenses', 'planned');
    const sa = sumM(data, 'savings', 'actual'), sp = sumM(data, 'savings', 'planned');
    const da = sumM(data, 'debts', 'actual'), dp = sumM(data, 'debts', 'planned');

    const income = ia || ip;
    const bills = ba || bp;
    const expenses = ea || ep;
    const savings = sa || sp;
    const debts = da || dp;
    const total = bills + expenses + savings + debts;
    const totalPlanned = bp + ep + sp + dp;
    const rem = income - total;

    return {
        income, bills, expenses, savings, debts, total, totalPlanned, rem,
        hasIncome: income > 0,
        ia, ip, ba, bp, ea, ep, sa, sp, da, dp
    };
}

// ── XSS PROTECTION ──
function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── ROW SANITIZER (protects against malformed rows) ──
function sanitizeRow(row) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;

    const clean = {};

    clean.name = String(row.name ?? '').slice(0, 100).trim();
    if (!clean.name) clean.name = 'بند بدون اسم';

    const toNum = v => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    clean.planned = toNum(row.planned);
    clean.actual = toNum(row.actual);

    clean.note = String(row.note ?? '').slice(0, 500);

    const d = String(row.date ?? '');
    clean.date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';

    clean.repeat = row.repeat === true;

    return clean;
}

// ── PROTOTYPE POLLUTION PROTECTION ──
function sanitizeMonthData(data) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    const allowedSections = ['income', 'bills', 'expenses', 'savings', 'debts', '_note'];
    const cleanData = {};
    Object.keys(data).forEach(key => {
        if (allowedSections.includes(key) && Array.isArray(data[key])) {
            cleanData[key] = data[key]
                .map(sanitizeRow)
                .filter(Boolean);
        }
    });
    ['income', 'bills', 'expenses', 'savings', 'debts'].forEach(sec => {
        if (!cleanData[sec]) cleanData[sec] = [];
    });
    if (data._note && typeof data._note === 'string') {
        cleanData._note = data._note.slice(0, 1000);
    }
    return cleanData;
}

// ── UTF-8 <-> Base64 (بدل escape/unescape المهجورة) ──
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

function base64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// ── CURRENCY ──
const CURRENCIES = { MAD: 'درهم', DZD: 'دينار جزائري', TND: 'دينار تونسي', SAR: 'ريال', EGP: 'جنيه', EUR: '€', USD: '$' };
let currency = localStorage.getItem('myz_currency') || 'MAD';
const getCurr = () => CURRENCIES[currency] || 'درهم';

const fmt = n => Number(n || 0).toLocaleString('ar-MA') + ' ' + getCurr();
const fmtN = n => Number(n || 0).toLocaleString('ar-MA');
const fmtShort = n => {
    const v = Math.abs(Number(n || 0));
    const curr = getCurr();
    if (v >= 1000) return (n < 0 ? '-' : '') + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k ' + curr;
    return Number(n || 0).toLocaleString('ar-MA') + ' ' + curr;
};

function changeCurrency(val) {
    currency = val;
    localStorage.setItem('myz_currency', val);
    const s1 = document.getElementById('currSelect');
    const s2 = document.getElementById('currSelectMobile');
    if (s1) s1.value = val;
    if (s2) s2.value = val;
    updateOverview();
    SECS.forEach(renderRows);
    if (cur === 'year') renderYearView();
    closeHeaderDrawer();
}

// ──────────────────────────────
//  HEADER DRAWER (mobile only)
// ──────────────────────────────
function toggleHeaderDrawer() {
    const d = document.getElementById('hDrawer');
    const o = document.getElementById('hDrawerOverlay');
    const open = d.classList.toggle('open');
    o.classList.toggle('open', open);
    document.getElementById('hToggler').textContent = open ? '✕' : '⚙️';
}
function closeHeaderDrawer() {
    document.getElementById('hDrawer')?.classList.remove('open');
    document.getElementById('hDrawerOverlay')?.classList.remove('open');
    document.getElementById('hToggler').textContent = '⚙️';
}

// ══════════════════════════════════════════
let cur = 'overview';
let isDark = localStorage.getItem('myz_dark') === '1' ||
    (!localStorage.getItem('myz_dark') && window.matchMedia('(prefers-color-scheme:dark)').matches);

function applyDark(d) {
    isDark = d;
    document.documentElement.classList.toggle('dark', d);
    const icon = d ? '☀️' : '🌙';
    const dBtn = document.getElementById('darkToggle');
    const dBtnM = document.getElementById('darkToggleMobile');
    if (dBtn) dBtn.textContent = icon;
    if (dBtnM) dBtnM.textContent = icon;
    localStorage.setItem('myz_dark', d ? '1' : '0');
    if (cur === 'overview') setTimeout(updateCharts, 50);
    if (cur === 'year') { setTimeout(renderYearLine, 50); setTimeout(renderMultiYearChart, 60); setTimeout(renderSavingsRateChart, 70); }
    closeHeaderDrawer();
}
function toggleDark() { applyDark(!isDark); }

function go(name) {
    cur = name;
    PAGES.forEach(p => document.getElementById('page-' + p)?.classList.toggle('active', p === name));
    document.querySelectorAll('.bnav-item').forEach((el, i) => el.classList.toggle('active', PAGES[i] === name));
    document.querySelectorAll('.tab-item').forEach((el, i) => el.classList.toggle('active', PAGES[i] === name));
    document.querySelectorAll('.sitem').forEach((el, i) => el.classList.toggle('active', PAGES[i] === name));
    if (name === 'overview') { updateCharts(); updateOverviewBarChart(); checkMonthlyComparison(); }
    if (name === 'year') renderYearView();
    if (name === 'compare') initCompare();
    if (name === 'settings') renderCatEditor();
    if (name === 'savings') updateSavingsPage();
    if (name === 'debts') updateDebtPage();
}

function goToMonth(y, m) {
    curYear = y; curMonth = m;
    D = getMonth(y, m);
    if (!monthHasRealData(y, m)) applyRepeatRows();
    updateMonthBadge();
    SECS.forEach(sec => {
        searchState[sec] = '';
        dateFilterState[sec] = { from: '', to: '' };
        const inp = document.getElementById('search-' + sec);
        if (inp) inp.value = '';
    });
    SECS.forEach(renderRows);
    updateOverview();
    loadMonthNote();
    go('overview');
}

function updateMonthBadge() {
    document.getElementById('monthBadge').textContent = '📅 ' + AR_MONTHS[curMonth - 1] + ' ' + curYear;
    updateCopyBar();
    loadMonthNote();
    const cl = document.getElementById('csv-month-label');
    if (cl) cl.textContent = 'ميزانية ' + AR_MONTHS[curMonth - 1] + ' ' + curYear;
    const yl = document.getElementById('csv-year-label');
    if (yl) yl.textContent = 'جميع شهور ' + curYear;
    const pml = document.getElementById('pdf-month-label');
    if (pml) pml.textContent = 'تقرير ' + AR_MONTHS[curMonth - 1] + ' ' + curYear + ' PDF';
    const pyl = document.getElementById('pdf-year-label');
    if (pyl) pyl.textContent = 'ملخص سنة ' + curYear + ' PDF';
    const sl = document.getElementById('share-month-label');
    if (sl) sl.textContent = 'مشاركة ميزانية ' + AR_MONTHS[curMonth - 1] + ' ' + curYear;
}

// ══════════════════════════════════════════
//  CATEGORY LABELS
// ══════════════════════════════════════════
const DEFAULT_CATS = {
    income: { icon: '💰', label: 'مصادر الدخل', addTxt: '＋ إضافة مصدر دخل', navLabel: 'الدخل' },
    bills: { icon: '🧾', label: 'الفواتير', addTxt: '＋ إضافة فاتورة', navLabel: 'الفواتير' },
    expenses: { icon: '🛍️', label: 'المصاريف', addTxt: '＋ إضافة بند', navLabel: 'المصاريف' },
    savings: { icon: '💎', label: 'أهداف الادخار', addTxt: '＋ إضافة هدف', navLabel: 'الادخار' },
    debts: { icon: '📋', label: 'الديون', addTxt: '＋ إضافة دين', navLabel: 'الديون' },
};

let CUSTOM_CATS = (() => {
    try { const s = localStorage.getItem('myz_cats'); return s ? JSON.parse(s) : {}; } catch { return {}; }
})();

function getCat(sec) {
    const custom = CUSTOM_CATS[sec] || {};
    const def = DEFAULT_CATS[sec];
    const label = custom.label || def.label;
    return {
        icon: custom.icon || def.icon,
        label,
        addTxt: def.addTxt,
        navLabel: label
    };
}

function saveCats() { localStorage.setItem('myz_cats', JSON.stringify(CUSTOM_CATS)); }

function updateCat(sec, field, val) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (!CUSTOM_CATS[sec]) CUSTOM_CATS[sec] = {};
    CUSTOM_CATS[sec][field] = val;
    saveCats();
    applyNavLabels();
    updateSecTitle(sec);
    const c = getCat(sec);
    const head = document.querySelector(`#card-${sec} .tracker-head span:first-child`);
    if (head) head.textContent = c.icon + ' ' + c.label;
    const addBtn = document.querySelector(`#card-${sec} .add-btn`);
    if (addBtn) addBtn.textContent = c.addTxt;
}

function updateSecTitle(sec) {
    const el = document.getElementById('sec-title-' + sec);
    if (el) el.textContent = getCat(sec).label;
}

function resetCats() {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (!confirm('إعادة تسميات الأقسام للافتراضية؟')) return;
    CUSTOM_CATS = {}; saveCats();
    applyNavLabels();
    SECS.filter(s => s !== 'income').forEach(sec => {
        updateSecTitle(sec);
        const c = getCat(sec);
        const head = document.querySelector(`#card-${sec} .tracker-head span:first-child`);
        if (head) head.textContent = c.icon + ' ' + c.label;
        const addBtn = document.querySelector(`#card-${sec} .add-btn`);
        if (addBtn) addBtn.textContent = c.addTxt;
    });
    renderCatEditor();
    showAlert('success', '✅ تمت إعادة التسميات للافتراضي');
}

function applyNavLabels() {
    SECS.filter(s => s !== 'income').forEach(sec => {
        const c = getCat(sec);
        document.querySelectorAll(`[data-nav-sec="${sec}"]`).forEach(el => {
            if (el.classList.contains('tab-item')) el.textContent = c.icon + ' ' + c.navLabel;
            else if (el.classList.contains('sitem')) el.innerHTML = `<span class="si">${esc(c.icon)}</span> ${esc(c.navLabel)}`;
            else if (el.classList.contains('bnav-item')) el.innerHTML = `<span class="bicon">${esc(c.icon)}</span><span>${esc(c.navLabel)}</span>`;
        });
    });
}

function renderCatEditor() {
    const wrap = document.getElementById('catEditorWrap');
    if (!wrap) return;
    let html = '';
    SECS.forEach(sec => {
        if (sec === 'income') return;
        const c = getCat(sec);
        html += `<div class="cat-editor-row">
      <input class="cat-icon-inp" type="text" value="${esc(c.icon)}" maxlength="2"
        onblur="updateCat('${sec}','icon',this.value)" title="الأيقونة">
      <input class="cat-name-inp" type="text" value="${esc(c.label)}" placeholder="اسم القسم"
        onblur="updateCat('${sec}','label',this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();}">
      <button class="cat-reset-btn" onclick="resetOneSec('${sec}')" title="إعادة تعيين">↩</button>
    </div>`;
    });
    wrap.innerHTML = html + `<div style="padding:8px 14px 10px">
    <button class="settings-btn" onclick="resetCats()" style="font-size:11px">↩ إعادة الكل للافتراضي</button>
  </div>`;
}

function resetOneSec(sec) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    delete CUSTOM_CATS[sec]; saveCats();
    applyNavLabels(); renderRows(sec); renderCatEditor();
}

// ══════════════════════════════════════════
//  M1: مساعدات renderRows (focus / build / filters)
// ══════════════════════════════════════════

// ── M1: التقاط حالة التركيز الحالية (قبل إعادة البناء) ──
function captureFocusState() {
    const el = document.activeElement;
    const idx = el?.closest('.data-row')?.dataset?.idx;
    if (idx === undefined) return { idx: null, field: null };
    const field = el.classList?.contains('amt-inp')
        ? (el.closest('.amt-field')?.querySelector('.amt-lbl')?.textContent?.includes('الفعلي')
            ? 'actual' : 'planned')
        : null;
    return { idx, field };
}

// ── M1: استعادة التركيز بعد إعادة البناء ──
function restoreFocus(container, idx, field) {
    if (idx === null || !field) return;
    setTimeout(() => {
        const row = container.querySelector(`.data-row[data-idx="${idx}"]`);
        if (!row) return;
        const inputs = row.querySelectorAll('.amt-inp');
        const target = field === 'actual' ? inputs[1] : inputs[0];
        if (target) target.focus({ preventScroll: true });
    }, 0);
}

// ── M1: بناء HTML ديال صف واحد ──
function buildRowHTML(row, i, sec) {
    const isInc = sec === 'income';
    const diff = (row.actual || 0) - (row.planned || 0);
    const has = (row.actual || 0) > 0;
    let dc = 'd-no', dt = '—';
    if (has) {
        if (isInc) { dc = diff >= 0 ? 'd-ok' : 'd-ov'; dt = (diff >= 0 ? '+' : '') + fmtN(diff); }
        else { dc = diff <= 0 ? 'd-ok' : 'd-ov'; dt = fmtN(diff); }
    }

    let savingsHTML = '';
    if (sec === 'savings') {
        const pct = row.planned > 0 ? Math.min((row.actual || 0) / row.planned * 100, 100) : 0;
        const barColor = pct < 30 ? '#c9615a' : pct < 70 ? '#e0b060' : '#4a9e7f';
        const remaining = (row.planned || 0) - (row.actual || 0);
        savingsHTML = `<div class="saving-goal">
      <div class="sg-bar-wrap"><div class="sg-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="sg-meta">
        <span style="color:${barColor};font-weight:800">${Math.round(pct)}%</span>
        <span style="color:var(--muted);font-size:11px">${remaining > 0 ? 'متبقي: ' + fmtN(remaining) + ' ' + getCurr() : '✅ اكتمل الهدف!'}</span>
      </div>
    </div>`;
    }

    const overspentAttr = (() => {
        const p = row.planned || 0, a = row.actual || 0;
        return (isStrictMode && p > 0 && a > p && sec !== 'income' && sec !== 'savings') ? 'data-overspent' : '';
    })();

    return `<div class="data-row" draggable="true" data-sec="${sec}" data-idx="${i}"
    ondragstart="onDragStart(event,${i})" ondragover="onDragOver(event)" ondrop="onDrop(event,'${sec}',${i})"
    ondragend="onDragEnd(event)" ondragleave="onDragLeave(event)">
    <div class="row-top">
      <span class="drag-handle" title="اسحب لإعادة الترتيب">⠿</span>
      <input class="row-name" type="text" value="${esc(row.name)}" placeholder="الاسم"
        onchange="upField('${sec}',${i},'name',this.value)">
      <button class="del-btn" onclick="delRow('${sec}',${i})">✕</button>
    </div>
    <div class="row-amounts">
      <div class="amt-field">
        <div class="amt-lbl">المخطط</div>
        <input class="amt-inp" type="number" value="${row.planned || ''}" placeholder="0"
          onchange="upField('${sec}',${i},'planned',+this.value)">
        <button class="copy-amt-btn" onclick="copyAmt(${row.planned || 0})" title="نسخ الرقم">⎘</button>
      </div>
      <div class="amt-field">
        <div class="amt-lbl">الفعلي</div>
        <input class="amt-inp${has ? ' filled' : ''}" type="number" value="${row.actual || ''}" placeholder="0"
          ${overspentAttr}
          onchange="upField('${sec}',${i},'actual',+this.value)">
        <button class="copy-amt-btn" onclick="copyAmt(${row.actual || 0})" title="نسخ الرقم">⎘</button>
      </div>
      ${!isInc ? `<div class="diff-field"><div class="amt-lbl">الفرق</div><span class="diff-chip ${dc}">${dt}</span></div>` : ''}
    </div>
    ${savingsHTML}
    <div class="note-wrap" id="note-${sec}-${i}" style="display:${row.note ? 'block' : 'none'}">
      <textarea class="note-inp" placeholder="أضف ملاحظة..."
        onchange="upField('${sec}',${i},'note',this.value)">${esc(row.note)}</textarea>
    </div>
    <button class="note-toggle ${row.note ? 'has-note' : ''}" onclick="toggleNote('${sec}',${i})">
      ${row.note ? '📝 ' + esc(row.note.substring(0, 20)) + (row.note.length > 20 ? '...' : '') : '＋ ملاحظة'}
    </button>
    <div class="date-field">
      <span class="date-lbl">📅</span>
      <input class="date-inp" type="date" value="${esc(row.date || '')}"
        onchange="upField('${sec}',${i},'date',this.value)" title="تاريخ الدفع">
      <button class="repeat-toggle${row.repeat ? ' active' : ''}" onclick="toggleRepeat('${sec}',${i})" title="تكرار شهري">
        🔁 ${row.repeat ? 'متكرر' : 'تكرار'}
      </button>
    </div>
  </div>`;
}

// ── M1: إعادة تطبيق الفلاتر النشيطة (بحث + تاريخ) ──
function applyActiveFilters(sec) {
    const savedSearch = searchState[sec];
    if (savedSearch) filterRows(sec, savedSearch);

    const df = dateFilterState[sec];
    if (df?.from || df?.to) {
        applyDateFilter(sec, df.from, df.to);
        const bar = document.getElementById('date-filter-' + sec);
        const btn = document.getElementById('dfbtn-' + sec);
        const fromEl = document.getElementById('dfrom-' + sec);
        const toEl = document.getElementById('dto-' + sec);
        if (bar) bar.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (fromEl && df.from) fromEl.value = df.from;
        if (toEl && df.to) toEl.value = df.to;
    }
}

// ══════════════════════════════════════════
//  RENDER ROWS (M1 — نسخة مختصرة)
// ══════════════════════════════════════════
function renderRows(sec) {
    const container = document.getElementById('card-' + sec);
    if (!container) return;

    const { idx: focusedIdx, field: focusedField } = captureFocusState();
    const rows = D[sec];
    const meta = getCat(sec);
    const total = sumD(sec, 'actual') || sumD(sec, 'planned');

    let rowsHTML = rows.length
        ? rows.map((row, i) => buildRowHTML(row, i, sec)).join('')
        : '<div class="empty-state">لا يوجد بيانات — اضغط + للإضافة</div>';

    container.innerHTML = `<div class="tracker-card">
    <div class="tracker-head"><span>${esc(meta.icon)} ${esc(meta.label)}</span><span class="total-chip" id="chip-${sec}">${fmt(total)}</span></div>
    <div class="rows-wrap">${rowsHTML}</div>
    <button class="add-btn" onclick="addRow('${sec}')">${meta.addTxt}</button>
  </div>`;

    if (sec === 'income') {
        const b = document.getElementById('income-big');
        if (b) b.textContent = fmt(total);
    }

    applyActiveFilters(sec);
    restoreFocus(container, focusedIdx, focusedField);
    updateOverview();
}

// ─── H4: تحديث صف واحد فقط بلا إعادة بناء القسم كامل ───
function updateRowInPlace(sec, i) {
    const container = document.getElementById('card-' + sec);
    if (!container) return;
    const row = container.querySelector(`.data-row[data-idx="${i}"]`);
    if (!row) return;
    const rowData = D[sec][i];
    if (!rowData) return;

    const isInc = sec === 'income';
    const has = (rowData.actual || 0) > 0;

    const diffChip = row.querySelector('.diff-chip');
    if (diffChip) {
        const diff = (rowData.actual || 0) - (rowData.planned || 0);
        let dc = 'd-no', dt = '—';
        if (has) {
            if (isInc) { dc = diff >= 0 ? 'd-ok' : 'd-ov'; dt = (diff >= 0 ? '+' : '') + fmtN(diff); }
            else { dc = diff <= 0 ? 'd-ok' : 'd-ov'; dt = fmtN(diff); }
        }
        diffChip.className = 'diff-chip ' + dc;
        diffChip.textContent = dt;
    }

    const amtInputs = row.querySelectorAll('.amt-inp');
    if (amtInputs[1]) {
        amtInputs[1].classList.toggle('filled', has);
        if (isStrictMode && sec !== 'income' && sec !== 'savings') {
            const p = rowData.planned || 0;
            const a = rowData.actual || 0;
            if (p > 0 && a > p) amtInputs[1].setAttribute('data-overspent', '');
            else amtInputs[1].removeAttribute('data-overspent');
        }
    }

    if (sec === 'savings') {
        const pct = rowData.planned > 0 ? Math.min((rowData.actual || 0) / rowData.planned * 100, 100) : 0;
        const barColor = pct < 30 ? '#c9615a' : pct < 70 ? '#e0b060' : '#4a9e7f';
        const remaining = (rowData.planned || 0) - (rowData.actual || 0);

        const fill = row.querySelector('.sg-bar-fill');
        if (fill) {
            fill.style.width = pct + '%';
            fill.style.background = barColor;
        }
        const metaSpans = row.querySelectorAll('.sg-meta span');
        if (metaSpans[0]) {
            metaSpans[0].style.color = barColor;
            metaSpans[0].textContent = Math.round(pct) + '%';
        }
        if (metaSpans[1]) {
            metaSpans[1].textContent = remaining > 0
                ? 'متبقي: ' + fmtN(remaining) + ' ' + getCurr()
                : '✅ اكتمل الهدف!';
        }
    }

    const total = sumD(sec, 'actual') || sumD(sec, 'planned');
    const chip = document.getElementById('chip-' + sec);
    if (chip) chip.textContent = fmt(total);

    if (sec === 'income') {
        const b = document.getElementById('income-big');
        if (b) b.textContent = fmt(total);
    }
}

// ══════════════════════════════════════════
//  MUTATIONS
// ══════════════════════════════════════════
function addRow(sec) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    const n = { income: 'مصدر جديد', bills: 'فاتورة جديدة', expenses: 'بند جديد', savings: 'هدف جديد', debts: 'دين جديد' };
    D[sec].push({ name: n[sec], planned: 0, actual: 0, note: '', date: '', repeat: false });
    save(); renderRows(sec);
    setTimeout(() => {
        const card = document.getElementById('card-' + sec);
        if (card) { const btn = card.querySelector('.add-btn'); if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }, 50);
}

function delRow(sec, i) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    const name = D[sec][i]?.name || 'هذا البند';
    if (!confirm(`هل تريد حذف "${name}"؟`)) return;
    pushUndo();
    D[sec].splice(i, 1); save(); renderRows(sec);
}

// ══════════════════════════════════════════
//  M6: ملاحظة على undo + save
//  ─────────────────────────────────────────
//  • الحقول planned/actual → كيدخلو لـ undo stack (تعديلات مالية)
//  • الحقول name/note/date/repeat → ما كيدخلوش (تعديلات نصية خفيفة، مو ضرورية)
//  • save() كيتدعى في كل الحالات (حتى name) — البيانات محفوظة دغيا في localStorage
//  ⚠️ لو بدّلنا onchange بـ oninput مستقبلاً، خاصنا debounce هنا:
//     const _saveDebounce = {};
//     clearTimeout(_saveDebounce[sec]);
//     _saveDebounce[sec] = setTimeout(save, 400);
// ══════════════════════════════════════════
function upField(sec, i, f, v) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (f === 'actual' && !checkStrictLimit(sec, i, v)) {
        const container = document.getElementById('card-' + sec);
        const row = container?.querySelector(`.data-row[data-idx="${i}"]`);
        const amtInputs = row?.querySelectorAll('.amt-inp');
        if (amtInputs && amtInputs[1]) amtInputs[1].value = D[sec][i].actual || '';
        return;
    }
    if (f !== 'name' && f !== 'note' && f !== 'date' && f !== 'repeat') pushUndo();
    D[sec][i][f] = v;
    save();

    if (f === 'name' || f === 'date') {
        return;
    }

    if (f === 'note') {
        const container = document.getElementById('card-' + sec);
        const row = container?.querySelector(`.data-row[data-idx="${i}"]`);
        const toggle = row?.querySelector('.note-toggle');
        if (toggle) {
            if (v) {
                toggle.classList.add('has-note');
                toggle.textContent = '📝 ' + v.substring(0, 20) + (v.length > 20 ? '...' : '');
            } else {
                toggle.classList.remove('has-note');
                toggle.textContent = '＋ ملاحظة';
            }
        }
        return;
    }

    if (f === 'repeat') {
        const container = document.getElementById('card-' + sec);
        const row = container?.querySelector(`.data-row[data-idx="${i}"]`);
        const toggle = row?.querySelector('.repeat-toggle');
        if (toggle) {
            toggle.classList.toggle('active', !!v);
            toggle.textContent = '🔁 ' + (v ? 'متكرر' : 'تكرار');
        }
        return;
    }

    updateRowInPlace(sec, i);
    updateOverview();
}

function toggleNote(sec, i) {
    const el = document.getElementById(`note-${sec}-${i}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ══════════════════════════════════════════
//  OVERVIEW (perf: getMonthSummary مرة وحدة)
// ══════════════════════════════════════════
function updateOverview() {
    // ⚡ حساب واحد بدل 10 استدعاءات sumD
    const s = getMonthSummary(D);
    const ip = s.ip, ia = s.ia;
    const bp = s.bp, ba = s.ba;
    const ep = s.ep, ea = s.ea;
    const sp = s.sp, sa = s.sa;
    const dp = s.dp, da = s.da;
    const totalP = bp + ep + sp + dp, totalA = ba + ea + sa + da;
    const hasIncome = (ia || ip) > 0;
    const remP = hasIncome ? ip - totalP : 0;
    const remA = hasIncome ? ia - totalA : 0;
    const pct = (v, t) => t > 0 ? Math.round(Math.abs(v) / t * 100) : 0;
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = fmt(v); };

    const incFmt = fmt(ia || ip);
    document.getElementById('headerIncome').textContent = incFmt;
    const mInc = document.getElementById('headerIncomeMobile');
    if (mInc) mInc.textContent = incFmt;
    setTxt('ov-inc', ia || ip);
    setTxt('ov-rem', hasIncome ? (remA || remP) : 0);
    document.getElementById('ov-rem-p').textContent = hasIncome ? pct(remA || remP, ia || ip) + '% من الدخل' : 'أدخل راتبك أولاً';
    setTxt('ov-spt', hasIncome ? (totalA || totalP) : 0);
    document.getElementById('ov-spt-p').textContent = hasIncome ? pct(totalA || totalP, ia || ip) + '% من الدخل' : '—';
    setTxt('ov-sav', hasIncome ? (sa || sp) : 0);
    document.getElementById('ov-sav-p').textContent = hasIncome ? pct(sa || sp, ia || ip) + '% من الدخل' : '—';
    setTxt('cf-ip', ip); setTxt('cf-ia', ia);
    setTxt('cf-bp', bp); setTxt('cf-ba', ba);
    setTxt('cf-ep', ep); setTxt('cf-ea', ea);
    setTxt('cf-sp', sp); setTxt('cf-sa', sa);
    setTxt('cf-dp', dp); setTxt('cf-da', da);
    setTxt('cf-rp', remP); setTxt('cf-ra', remA);
    const rpEl = document.getElementById('cf-rp');
    const raEl = document.getElementById('cf-ra');
    if (rpEl) rpEl.style.color = remP >= 0 ? 'var(--green)' : 'var(--danger)';
    if (raEl) raEl.style.color = remA >= 0 ? 'var(--green)' : 'var(--danger)';

    // ⚡ نمرّر نفس summary للدوال الفرعية
    if (cur === 'overview') updateCharts(s);
    checkAlerts();
    updateSpendingRate(totalA, totalP, ia || ip);
    updateHealthScore(s);
    if (cur === 'overview') updateOverviewBarChart(s);
    updateSettingsBadge();
}

// ══════════════════════════════════════════
//  ALERTS
// ══════════════════════════════════════════
let alertTimer = null;
let appReady = false;

function showAlert(type, msg) {
    if (type !== 'success' && isAlertSnoozed(msg)) return;
    const bar = document.getElementById('alertBar');
    const msgEl = document.getElementById('alertBarMsg');
    bar.className = 'alert-bar ' + type;
    if (msgEl) msgEl.textContent = msg;
    bar.style.display = 'flex';
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => bar.style.display = 'none', 5000);
}

function checkAlerts() {
    if (!appReady) return;
    const bp = sumD('bills', 'planned'), ba = sumD('bills', 'actual');
    const ep = sumD('expenses', 'planned'), ea = sumD('expenses', 'actual');
    const sp = sumD('savings', 'planned'), sa = sumD('savings', 'actual');
    const ip = sumD('income', 'planned'), ia = sumD('income', 'actual');
    const hasActual = ba > 0 || ea > 0 || sa > 0 || ia > 0;
    if (!hasActual) return;
    if (ba > bp && bp > 0) showAlert('danger', '🔴 تجاوزت ميزانية الفواتير!');
    else if (ea > ep && ep > 0) showAlert('danger', '🔴 تجاوزت ميزانية المصاريف!');
    else if (ba >= bp * 0.9 && bp > 0 && ba <= bp) showAlert('warning', '🟡 الفواتير وصلت 90% من الميزانية');
    else if (sa >= sp && sp > 0) showAlert('success', '🎉 أحسنت! حققت هدف الادخار هذا الشهر');
    else if (ia > ip && ip > 0) showAlert('success', '💪 دخلك الفعلي تجاوز المخطط!');
    else {
        document.getElementById('alertBar').style.display = 'none';
        checkRepeatAlerts();
    }
}

let donut = null;
// ⚡ updateCharts تقبل summary اختياري
function updateCharts(summary) {
    const s = summary || getMonthSummary(D);
    const ba = s.ba || s.bp;
    const ea = s.ea || s.ep;
    const sa = s.sa || s.sp;
    const da = s.da || s.dp;

    const ctx = document.getElementById('donutChart');
    if (!ctx) return;
    if (donut) donut.destroy();
    donut = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['الفواتير', 'المصاريف', 'الادخار', 'الديون'],
            datasets: [{
                data: [ba, ea, sa, da],
                backgroundColor: ['#e8c5b0', '#f0b8b3', '#a8d4c2', '#c8bee0'],
                borderWidth: 3, borderColor: isDark ? '#1a1d27' : '#fff', hoverOffset: 10
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Cairo', size: 11 }, padding: 10, boxWidth: 10, boxHeight: 10, color: isDark ? '#e8e6f0' : '#1a1714' }
                }
            }
        }
    });
    const vals = {
        bills: { p: s.bp, a: s.ba },
        expenses: { p: s.ep, a: s.ea },
        savings: { p: s.sp, a: s.sa },
        debts: { p: s.dp, a: s.da }
    };
    const maxP = Math.max(...Object.values(vals).map(v => v.p), 1);
    Object.entries(vals).forEach(([k, { p, a }]) => {
        const bp = document.getElementById('bfp-' + k), ba2 = document.getElementById('bfa-' + k), bv = document.getElementById('bv-' + k);
        if (!bp) return;
        bp.style.width = Math.min(p / maxP * 100, 100) + '%';
        ba2.style.width = Math.min(a / maxP * 100, 100) + '%';
        bv.textContent = fmtN(a || p);
    });
}

// ══════════════════════════════════════════
//  YEAR VIEW
// ══════════════════════════════════════════
function changeYear(dir) {
    viewYear += dir;
    renderYearView();
}

// ── M3: getMonthStats مبنية على getMonthSummary ──
function getMonthStats(y, m) {
    const data = peekMonth(y, m);
    if (!data) return null;
    const s = getMonthSummary(data);
    if (!s) return null;
    return {
        income: s.income,
        spent: s.total,
        savings: s.savings,
        rem: s.rem,
        hasIncome: s.hasIncome,
        ia: s.ia, ip: s.ip,
        totalA: s.total,
        totalP: s.totalPlanned
    };
}

function renderYearView() {
    document.getElementById('yearTitle').textContent = viewYear;

    let ytIncome = 0, ytSpent = 0, ytSavings = 0, ytMonths = 0;
    for (let m = 1; m <= 12; m++) {
        const s = getMonthStats(viewYear, m);
        if (s && s.hasIncome) { ytIncome += s.income; ytSpent += s.spent; ytSavings += s.savings; ytMonths++; }
    }
    const ytRem = ytIncome - ytSpent;

    document.getElementById('yearStats').innerHTML = `
    <div class="ys-card c-g"><div class="ys-label">دخل السنة</div><div class="ys-val">${fmtShort(ytIncome)}</div></div>
    <div class="ys-card c-p"><div class="ys-label">مصاريف السنة</div><div class="ys-val">${fmtShort(ytSpent)}</div></div>
    <div class="ys-card c-l"><div class="ys-label">ادخار السنة</div><div class="ys-val">${fmtShort(ytSavings)}</div></div>
    <div class="ys-card c-b"><div class="ys-label">باقي السنة</div><div class="ys-val">${fmtShort(ytRem)}</div></div>
  `;

    const nowFresh = new Date();
    const nowY = nowFresh.getFullYear(), nowM = nowFresh.getMonth() + 1;
    let html = '';
    for (let m = 1; m <= 12; m++) {
        const k = monthKey(viewYear, m);
        const isActive = viewYear === curYear && m === curMonth;
        const isPast = (viewYear < nowY) || (viewYear === nowY && m < nowM);
        const isFuture = (viewYear > nowY) || (viewYear === nowY && m > nowM);
        const hasData = !!ALL[k];
        const s = getMonthStats(viewYear, m);

        let statusClass, statusTxt;
        if (isActive) { statusClass = 'status-active'; statusTxt = 'الشهر الحالي'; }
        else if (hasData && s && s.hasIncome) { statusClass = 'status-done'; statusTxt = 'مكتمل'; }
        else if (isFuture) { statusClass = 'status-future'; statusTxt = 'قادم'; }
        else { statusClass = 'status-empty'; statusTxt = isPast ? 'فارغ' : '—'; }

        let bodyHTML, footerHTML;
        if (s && s.hasIncome) {
            const remClass = s.rem > 0 ? 'pos' : s.rem < 0 ? 'neg' : 'zero';
            const pct = s.income > 0 ? Math.round(s.spent / s.income * 100) : 0;
            bodyHTML = `
        <div class="ymc-body">
          <div class="ymc-stat"><div class="ymc-stat-lbl">الدخل</div><div class="ymc-stat-val" style="color:var(--green)">${fmtShort(s.income)}</div></div>
          <div class="ymc-stat"><div class="ymc-stat-lbl">المصاريف</div><div class="ymc-stat-val" style="color:var(--pink)">${fmtShort(s.spent)}</div></div>
          <div class="ymc-stat"><div class="ymc-stat-lbl">الادخار</div><div class="ymc-stat-val" style="color:var(--lav)">${fmtShort(s.savings)}</div></div>
        </div>
        <div class="ymc-progress"><div class="ymc-progress-fill" style="width:${Math.min(pct, 100)}%;background:${pct > 100 ? 'var(--pink)' : 'var(--green)'}"></div></div>`;
            footerHTML = `
        <div class="ymc-footer">
          <div>
            <div style="font-size:9px;color:var(--muted);font-weight:600">الباقي</div>
            <div class="ymc-remaining ${remClass}">${fmtShort(s.rem)}</div>
          </div>
          <button class="ymc-go-btn" onclick="goToMonth(${viewYear},${m})">عرض التفاصيل ←</button>
        </div>`;
        } else {
            bodyHTML = `<div class="ymc-empty-msg">${isFuture ? 'لم يبدأ هذا الشهر بعد' : 'لا يوجد بيانات لهذا الشهر'}</div>`;
            footerHTML = `
        <div class="ymc-footer" style="justify-content:flex-end">
          <button class="ymc-go-btn" onclick="goToMonth(${viewYear},${m})">فتح الشهر ←</button>
        </div>`;
        }

        html += `
      <div class="year-month-card">
        <div class="ymc-head">
          <div class="ymc-name">${AR_MONTHS[m - 1]}</div>
          <div class="ymc-status ${statusClass}">${statusTxt}</div>
        </div>
        ${bodyHTML}
        ${footerHTML}
      </div>`;
    }
    document.getElementById('monthsGrid').innerHTML = html;
    renderYearInsights();
    renderMultiYearChart();
    renderSavingsRateChart();
    renderYearLine();
}

function renderYearLine() {
    const labels = [], incomeData = [], spentData = [], savingsData = [];
    for (let m = 1; m <= 12; m++) {
        const s = getMonthStats(viewYear, m);
        labels.push(AR_MONTHS[m - 1].substring(0, 3));
        incomeData.push(s && s.hasIncome ? s.income : null);
        spentData.push(s && s.hasIncome ? s.spent : null);
        savingsData.push(s && s.hasIncome ? s.savings : null);
    }
    const ctx = document.getElementById('yearLineChart');
    if (!ctx) return;
    if (window.yearLine) window.yearLine.destroy();
    const tickColor = isDark ? '#6b6880' : '#8a8480';
    const gridColor = isDark ? '#2a2d3a' : '#ede9e4';
    window.yearLine = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'الدخل', data: incomeData, borderColor: '#4a9e7f', backgroundColor: '#4a9e7f18', tension: .35, spanGaps: true, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, fill: true },
                { label: 'المصاريف', data: spentData, borderColor: '#c9615a', backgroundColor: '#c9615a18', tension: .35, spanGaps: true, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, fill: true },
                { label: 'الادخار', data: savingsData, borderColor: '#7a60a8', backgroundColor: '#7a60a818', tension: .35, spanGaps: true, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, fill: true },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { font: { family: 'Cairo', size: 11 }, color: isDark ? '#e8e6f0' : '#1a1714', boxWidth: 12, padding: 12 } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtN(ctx.parsed.y)} ${getCurr()}` } }
            },
            scales: {
                x: { ticks: { font: { family: 'Cairo', size: 10 }, color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { font: { family: 'Cairo', size: 10 }, color: tickColor, callback: v => fmtShort(v) }, grid: { color: gridColor } }
            }
        }
    });
}

// ══════════════════════════════════════════
//  COPY FROM PREV MONTH
// ══════════════════════════════════════════
function copyFromPrevMonth() {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    let prevY = curYear, prevM = curMonth - 1;
    if (prevM === 0) { prevM = 12; prevY--; }
    const prevKey = monthKey(prevY, prevM);
    if (!monthHasRealData(prevY, prevM)) {
        alert('لا يوجد بيانات للشهر الماضي — ' + AR_MONTHS[prevM - 1] + ' ' + prevY);
        return;
    }
    if (!confirm('هل تريد نسخ ميزانية ' + AR_MONTHS[prevM - 1] + ' ' + prevY + ' إلى ' + AR_MONTHS[curMonth - 1] + ' ' + curYear + '؟\n\nالمبالغ الفعلية لن تُنسخ، فقط المخطط.')) return;

    const hasCurrentActual = SECS.some(sec => D[sec].some(r => (r.actual || 0) > 0));
    if (hasCurrentActual) {
        if (!confirm('⚠️ تحذير: الشهر الحالي يحتوي بيانات فعلية مُدخَلة!\n\nالنسخ سيستبدل جميع البنود وسيضيع ما أدخلته.\n\nهل أنت متأكد؟')) return;
        pushUndo();
    }
    const prev = ALL[prevKey];
    SECS.forEach(sec => {
        D[sec] = prev[sec].map(r => ({ name: r.name, planned: r.planned || 0, actual: 0, note: '', date: '', repeat: r.repeat || false }));
    });
    save();
    SECS.forEach(renderRows);
    updateOverview();
    const btn = document.querySelector('.copy-month-btn');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ تم النسخ!';
        btn.style.background = 'var(--green)'; btn.style.color = '#fff';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; }, 2000);
    }
}

function updateCopyBar() {
    let prevY = curYear, prevM = curMonth - 1;
    if (prevM === 0) { prevM = 12; prevY--; }
    const el = document.getElementById('prevMonthName');
    const bar = document.getElementById('copyBar');
    if (!el || !bar) return;
    const hasPrev = monthHasRealData(prevY, prevM);
    el.textContent = AR_MONTHS[prevM - 1] + ' ' + prevY + (hasPrev ? '' : ' (فارغ)');
    bar.style.opacity = hasPrev ? '1' : '0.5';
}

// ══════════════════════════════════════════
//  EXPORT / IMPORT / CLEAR
// ══════════════════════════════════════════
function exportJSON() {
    const blob = new Blob([JSON.stringify(ALL, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url1 = URL.createObjectURL(blob);
    a.href = url1;
    a.download = `ميزانيتي-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url1), 1000);
    showAlert('success', '✅ تم تصدير الملف بنجاح');
}

function importJSON(file) {
    if (!file) return;
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط');
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (typeof data !== 'object' || Array.isArray(data) || data === null) {
                showAlert('danger', '❌ الملف لا يخص تطبيق ميزانيتي');
                return;
            }
            const validKeys = Object.keys(data).filter(k => /^\d{4}-\d{2}$/.test(k));
            if (validKeys.length === 0) {
                showAlert('danger', '❌ الملف لا يحتوي على أي شهر صالح (YYYY-MM)');
                return;
            }
            const invalidKeys = Object.keys(data).filter(k => !/^\d{4}-\d{2}$/.test(k));
            if (invalidKeys.length > 0) {
                console.warn('⛔ تم تجاهل مفاتيح غير صالحة:', invalidKeys);
                showAlert('warning', `⚠️ تم تجاهل ${invalidKeys.length} مفتاح غير صالح (مثل __proto__)`);
            }
            pushUndo();
            validKeys.forEach(key => {
                const cleanMonth = sanitizeMonthData(data[key]);
                if (cleanMonth) {
                    ALL[key] = cleanMonth;
                }
            });
            save();
            D = getMonth(curYear, curMonth);
            SECS.forEach(renderRows);
            updateOverview();
            showAlert('success', `✅ تم استيراد ${validKeys.length} شهر بنجاح`);
        } catch (err) {
            showAlert('danger', '❌ ملف غير صالح أو تالف: ' + err.message);
        }
    };
    reader.readAsText(file);
    document.getElementById('importFile').value = '';
}

// ── CSV quote helper: يحمي من CSV/Formula Injection ──
// إذا بدأت القيمة بـ = + - @ TAB CR → نضيف apostrophe في الأول
// باش Excel/Google Sheets ما يفسّروهاش كصيغة
function csvQuote(s) {
    let v = String(s ?? '');
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return `"${v.replace(/"/g, '""')}"`;
}

function exportCSV() {
    const secNames = {};
    SECS.forEach(s => secNames[s] = getCat(s).label);
    let csv = 'القسم,الاسم,المخطط,الفعلي,الملاحظة,التاريخ,تكرار\n';
    SECS.forEach(sec => {
        D[sec].forEach(r => {
            csv += `${csvQuote(secNames[sec])},${csvQuote(r.name)},${r.planned || 0},${r.actual || 0},${csvQuote(r.note)},${csvQuote(r.date || '')},${r.repeat ? 'true' : 'false'}\n`;
        });
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const url2 = URL.createObjectURL(blob);
    a.href = url2;
    a.download = `ميزانية-${AR_MONTHS[curMonth - 1]}-${curYear}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url2), 1000);
    showAlert('success', '✅ تم تصدير CSV بنجاح');
}

function clearCurrentMonth() {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (!confirm(`هل تريد حذف بيانات ${AR_MONTHS[curMonth - 1]} ${curYear} نهائياً؟`)) return;
    const k = monthKey(curYear, curMonth);
    ALL[k] = { income: [], bills: [], expenses: [], savings: [], debts: [] };
    D = ALL[k];
    save();
    SECS.forEach(renderRows);
    updateOverview();
    showAlert('success', '🗑️ تم حذف بيانات الشهر');
}

function clearAllData() {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (!confirm('⚠️ هل أنت متأكد؟ سيتم مسح جميع البيانات نهائياً ولا يمكن التراجع!')) return;
    if (!confirm('تأكيد أخير — هذا لا يمكن التراجع عنه!')) return;
    const clearSettings = confirm('هل تريد مسح الإعدادات أيضاً؟\n(العملة، أسماء الأقسام، وضع الصارم)\n\nموافق = مسح الكل | إلغاء = البيانات فقط');
    localStorage.removeItem('myz_v4');
    if (clearSettings) {
        localStorage.removeItem('myz_cats');
        localStorage.removeItem('myz_currency');
        localStorage.removeItem('myz_strict');
        localStorage.removeItem('myz_snoozed');
        localStorage.removeItem('myz_dark');
        localStorage.removeItem('myz_reminder_date');
        CUSTOM_CATS = {}; currency = 'MAD'; isStrictMode = false;
        document.getElementById('currSelect').value = 'MAD';
        const csM = document.getElementById('currSelectMobile');
        if (csM) csM.value = 'MAD';
        applyStrictMode(); applyNavLabels();
        SECS.filter(s => s !== 'income').forEach(updateSecTitle);
        renderCatEditor();
    }
    ALL = {};
    ALL[monthKey(curYear, curMonth)] = { income: [], bills: [], expenses: [], savings: [], debts: [] };
    D = ALL[monthKey(curYear, curMonth)];
    save();
    SECS.forEach(renderRows);
    updateOverview();
    showAlert('success', clearSettings ? '🗑️ تم مسح جميع البيانات والإعدادات' : '🗑️ تم مسح جميع البيانات');
}

// ══════════════════════════════════════════
//  SEARCH & FILTER
// ══════════════════════════════════════════
const searchState = {};

function filterRows(sec, query) {
    searchState[sec] = query.toLowerCase().trim();
    const card = document.getElementById('card-' + sec);
    if (!card) return;
    const rows = card.querySelectorAll('.data-row');
    rows.forEach(row => {
        const nameInput = row.querySelector('.row-name');
        if (!nameInput) return;
        const name = nameInput.value.toLowerCase();
        const match = !searchState[sec] || name.includes(searchState[sec]);
        row.style.display = match ? '' : 'none';
    });
    const visible = [...rows].filter(r => r.style.display !== 'none').length;
    let emptyEl = card.querySelector('.search-empty');
    if (!visible && searchState[sec]) {
        if (!emptyEl) { emptyEl = document.createElement('div'); emptyEl.className = 'empty-state search-empty'; card.querySelector('.rows-wrap')?.appendChild(emptyEl); }
        emptyEl.textContent = 'لا يوجد نتائج لـ "' + searchState[sec] + '"';
        emptyEl.style.display = 'block';
    } else if (emptyEl) { emptyEl.style.display = 'none'; }
}

function clearSearch(sec) {
    const inp = document.getElementById('search-' + sec);
    if (inp) { inp.value = ''; filterRows(sec, ''); }
}

// ══════════════════════════════════════════
//  DRAG & DROP REORDER
// ══════════════════════════════════════════
let dragSrcIdx = null;

function onDragStart(e, idx) {
    dragSrcIdx = idx;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
}
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging', 'drag-over');
    document.querySelectorAll('.data-row.drag-over').forEach(r => r.classList.remove('drag-over'));
}

function onDrop(e, sec, targetIdx) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over', 'dragging');
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
    pushUndo();
    const arr = D[sec];
    const item = arr.splice(dragSrcIdx, 1)[0];
    arr.splice(targetIdx, 0, item);
    dragSrcIdx = null;
    save();
    renderRows(sec);
}

// Touch drag support
let touchSrc = null, touchSec = null, touchClone = null;
function initTouchDrag() {
    document.addEventListener('touchstart', e => {
        const handle = e.target.closest('.drag-handle');
        if (!handle) return;
        const row = handle.closest('.data-row');
        touchSrc = parseInt(row.dataset.idx);
        touchSec = row.dataset.sec;
        touchClone = row.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;opacity:.8;pointer-events:none;z-index:9999;width:' + row.offsetWidth + 'px;';
        document.body.appendChild(touchClone);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (!touchClone) return;
        e.preventDefault();
        const t = e.touches[0];
        touchClone.style.left = (t.clientX - 50) + 'px';
        touchClone.style.top = (t.clientY - 20) + 'px';
    }, { passive: false });
    document.addEventListener('touchend', e => {
        if (isReadonly) {
            if (touchClone) { touchClone.remove(); touchClone = null; }
            touchSrc = null;
            touchSec = null;
            return;
        }
        if (!touchClone) return;
        touchClone.remove(); touchClone = null;
        if (touchSrc === null) return;
        const t = e.changedTouches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const targetRow = el?.closest('.data-row');
        if (targetRow && targetRow.dataset.sec === touchSec) {
            const targetIdx = parseInt(targetRow.dataset.idx);
            if (targetIdx !== touchSrc) {
                pushUndo();
                const arr = D[touchSec];
                const item = arr.splice(touchSrc, 1)[0];
                arr.splice(targetIdx, 0, item);
                save(); renderRows(touchSec);
            }
        }
        touchSrc = null; touchSec = null;
    });
}

// ══════════════════════════════════════════
//  DAILY NOTIFICATION REMINDER
// ══════════════════════════════════════════
let lastReminderDay = localStorage.getItem('myz_reminder_date') || '';

function checkDailyReminder() {
    const today = new Date();
    const todayStr = today.toDateString();
    if (lastReminderDay === todayStr) return;

    const todayData = peekMonth(today.getFullYear(), today.getMonth() + 1);
    const todayISO = today.toISOString().slice(0, 10);
    const hasTodayEntry = todayData && SECS.some(sec =>
        todayData[sec].some(r => (r.actual || 0) > 0 && r.date === todayISO)
    );

    if (hasTodayEntry) {
        lastReminderDay = todayStr;
        localStorage.setItem('myz_reminder_date', todayStr);
        return;
    }

    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            sendReminder();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => { if (p === 'granted') sendReminder(); });
        }
    }

    const isCurView = curYear === today.getFullYear() && curMonth === (today.getMonth() + 1);
    if (isCurView) {
        showAlert('warning', '📝 لم تُسجِّل أي مصروف اليوم — لا تنسى التسجيل!');
    }

    lastReminderDay = todayStr;
    localStorage.setItem('myz_reminder_date', todayStr);
}

function sendReminder() {
    try {
        new Notification('ميزانيتي 💰', {
            body: 'لم تُسجِّل مصاريف اليوم — لا تنسى التحديث!',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
            tag: 'daily-reminder',
            renotify: false
        });
    } catch (e) { }
}

// ─── reminder timer (visibility-aware) ───
let reminderTimer = null;

function startReminderTimer() {
    if (reminderTimer) return;
    reminderTimer = setInterval(checkDailyReminder, 5 * 60 * 1000);
}

function stopReminderTimer() {
    if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkDailyReminder();
        startReminderTimer();
    } else {
        stopReminderTimer();
    }
});

// ══════════════════════════════════════════
//  SPENDING RATE & FORECAST
// ══════════════════════════════════════════
function updateSpendingRate(totalActual, totalPlanned, income) {
    const card = document.getElementById('rateCard');
    if (!card) return;
    const spent = totalActual || totalPlanned;
    if (!spent && !income) { card.style.display = 'none'; return; }
    card.style.display = 'flex';

    const today = new Date();
    const isCurrentMonth = curYear === today.getFullYear() && curMonth === (today.getMonth() + 1);
    const dayOfMonth = isCurrentMonth ? today.getDate() : new Date(curYear, curMonth, 0).getDate();
    const daysInMonth = new Date(curYear, curMonth, 0).getDate();
    const actualSpent = totalActual || 0;
    const dailyRate = dayOfMonth > 0 ? actualSpent / dayOfMonth : 0;
    const forecast = Math.round(dailyRate * daysInMonth);
    const daysLeft = daysInMonth - dayOfMonth;

    const dayEl = document.getElementById('rate-day');
    const daySubEl = document.getElementById('rate-day-sub');
    if (dayEl) { dayEl.textContent = 'اليوم ' + dayOfMonth; dayEl.className = 'rate-stat-value rate-neutral'; }
    if (daySubEl) daySubEl.textContent = 'من أصل ' + daysInMonth + ' يوم — باقي ' + daysLeft + ' يوم';

    const rateEl = document.getElementById('rate-daily');
    if (rateEl) {
        rateEl.textContent = fmtShort(Math.round(dailyRate));
        rateEl.className = 'rate-stat-value ' + (actualSpent > 0 ? 'rate-warn' : 'rate-neutral');
    }

    const forecastEl = document.getElementById('rate-forecast');
    const forecastSubEl = document.getElementById('rate-forecast-sub');
    if (forecastEl) {
        forecastEl.textContent = fmtShort(forecast);
        if (income > 0) {
            const isOver = forecast > income;
            forecastEl.className = 'rate-stat-value ' + (isOver ? 'rate-warn' : 'rate-ok');
            if (forecastSubEl) forecastSubEl.textContent = isOver ? '⚠️ سيتجاوز الدخل!' : '✅ ضمن الميزانية';
        } else {
            forecastEl.className = 'rate-stat-value rate-neutral';
            if (forecastSubEl) forecastSubEl.textContent = 'توقع نهاية الشهر';
        }
    }
}

// ══════════════════════════════════════════
//  COMPARE MONTHS
// ══════════════════════════════════════════
function initCompare() {
    const available = Object.keys(ALL)
        .filter(k => /^\d{4}-\d{2}$/.test(k) && monthHasRealData(...k.split('-').map(Number)))
        .sort().reverse();

    const curKey = monthKey(curYear, curMonth);
    if (!available.includes(curKey)) available.unshift(curKey);

    const makeOptions = (selectId, selectedVal, includeEmpty) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = (includeEmpty ? '<option value="">— اختياري</option>' : '') +
            available.map(k => {
                const [y, m] = k.split('-');
                return `<option value="${k}" ${k === (selectedVal || prev) ? 'selected' : ''}>${AR_MONTHS[+m - 1]} ${y}</option>`;
            }).join('');
    };

    const m1Key = curKey;
    let prevM = curMonth - 1, prevY = curYear;
    if (prevM === 0) { prevM = 12; prevY--; }
    const m2Key = available.find(k => k !== m1Key) || available[0] || m1Key;

    makeOptions('cmp-m1', m1Key, false);
    makeOptions('cmp-m2', m2Key, false);
    makeOptions('cmp-m3', '', true);

    renderCompare();
}

function renderCompare() {
    const sel1 = document.getElementById('cmp-m1')?.value;
    const sel2 = document.getElementById('cmp-m2')?.value;
    const sel3 = document.getElementById('cmp-m3')?.value;
    const wrap = document.getElementById('compareTableWrap');
    if (!wrap || !sel1 || !sel2) return;

    const cols = [sel1, sel2, ...(sel3 ? [sel3] : [])];
    const getLabel = k => { const [y, m] = k.split('-'); return AR_MONTHS[+m - 1] + '\n' + y; };

    const getData = k => {
        const data = peekMonth(...k.split('-').map(Number));
        if (!data) return { income: 0, bills: 0, expenses: 0, savings: 0, debts: 0, total: 0 };
        const s = getMonthSummary(data);
        return {
            income: s.income,
            bills: s.bills,
            expenses: s.expenses,
            savings: s.savings,
            debts: s.debts,
            total: s.total
        };
    };

    const stats = cols.map(getData);

    const badge = (v, ref) => {
        if (!ref || v === ref) return '<span class="cmp-badge cmp-eq">—</span>';
        const diff = Math.round((v - ref) / ref * 100);
        return v > ref
            ? `<span class="cmp-badge cmp-up">+${diff}%</span>`
            : `<span class="cmp-badge cmp-dn">${diff}%</span>`;
    };

    const rows = [
        { label: 'الدخل', key: 'income', isIncome: true },
        { label: esc(getCat('bills').label), key: 'bills' },
        { label: esc(getCat('expenses').label), key: 'expenses' },
        { label: esc(getCat('savings').label), key: 'savings' },
        { label: esc(getCat('debts').label), key: 'debts' },
        { label: 'إجمالي المصاريف', key: 'total', isBold: true },
    ];

    const colHeaders = cols.map(k => `<th>${getLabel(k).replace('\n', '<br>')}</th>`).join('');

    const bodyRows = rows.map(r => {
        const vals = stats.map(s => s[r.key]);
        const ref = vals[0];
        const cells = vals.map((v, i) => {
            const b = i > 0 ? badge(v, ref) : '';
            return `<td class="num">${b}${fmtShort(v)}</td>`;
        }).join('');
        return `<tr><td class="cat-name" ${r.isBold ? 'style="font-weight:800"' : ''}>${r.label}</td>${cells}</tr>`;
    }).join('');

    const totalRow = stats.map((s, i) => {
        const rem = s.income - s.total;
        const b = i > 0 ? badge(rem, stats[0].income - stats[0].total) : '';
        const color = rem >= 0 ? 'color:var(--green)' : 'color:var(--pink)';
        return `<td class="num" style="${color}">${b}${fmtShort(rem)}</td>`;
    }).join('');

    wrap.innerHTML = `
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead><tr><th>البند</th>${colHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot><tr><td style="font-weight:800">💰 الباقي</td>${totalRow}</tr></tfoot>
      </table>
    </div>`;
}

// ══════════════════════════════════════════
//  YEAR DEEP INSIGHTS
// ══════════════════════════════════════════
function renderYearInsights() {
    const wrap = document.getElementById('yearInsights');
    if (!wrap) return;
    const allStats = [];
    for (let m = 1; m <= 12; m++) {
        const s = getMonthStats(viewYear, m);
        if (s && s.hasIncome) allStats.push({ m, s });
    }
    if (!allStats.length) { wrap.innerHTML = ''; return; }

    const bestSav = allStats.reduce((a, b) => b.s.savings > a.s.savings ? b : a);
    const worstSpend = allStats.reduce((a, b) => {
        const ra = a.s.income > 0 ? a.s.spent / a.s.income : 0;
        const rb = b.s.income > 0 ? b.s.spent / b.s.income : 0;
        return rb > ra ? b : a;
    });
    const avgSpent = Math.round(allStats.reduce((t, { s }) => t + s.spent, 0) / allStats.length);
    const avgIncome = Math.round(allStats.reduce((t, { s }) => t + s.income, 0) / allStats.length);

    wrap.innerHTML = `
    <div class="yi-card">
      <div class="yi-label">💎 أفضل شهر ادخاراً</div>
      <div class="yi-month">${AR_MONTHS[bestSav.m - 1]}</div>
      <div class="yi-val" style="color:var(--green)">${fmtShort(bestSav.s.savings)}</div>
    </div>
    <div class="yi-card">
      <div class="yi-label">🔴 أكثر شهر إنفاقاً</div>
      <div class="yi-month">${AR_MONTHS[worstSpend.m - 1]}</div>
      <div class="yi-val" style="color:var(--pink)">${fmtShort(worstSpend.s.spent)}</div>
    </div>
    <div class="yi-card">
      <div class="yi-label">📊 متوسط الإنفاق الشهري</div>
      <div class="yi-month">عبر ${allStats.length} شهور</div>
      <div class="yi-val" style="color:var(--blue)">${fmtShort(avgSpent)}</div>
    </div>
    <div class="yi-card">
      <div class="yi-label">💰 متوسط الدخل الشهري</div>
      <div class="yi-month">عبر ${allStats.length} شهور</div>
      <div class="yi-val" style="color:var(--green)">${fmtShort(avgIncome)}</div>
    </div>`;
}

// ══════════════════════════════════════════
//  EXPORT YEAR CSV
// ══════════════════════════════════════════
function exportYearCSV() {
    const secNames = {};
    SECS.forEach(s => secNames[s] = getCat(s).label);
    let csv = 'الشهر,القسم,الاسم,المخطط,الفعلي,الملاحظة,التاريخ,تكرار\n';
    for (let m = 1; m <= 12; m++) {
        const data = peekMonth(curYear, m);
        if (!data) continue;
        const mLabel = AR_MONTHS[m - 1];
        SECS.forEach(sec => {
            data[sec].forEach(r => {
                csv += `${csvQuote(mLabel)},${csvQuote(secNames[sec])},${csvQuote(r.name)},${r.planned || 0},${r.actual || 0},${csvQuote(r.note)},${csvQuote(r.date || '')},${r.repeat ? 'true' : 'false'}\n`;
            });
        });
    }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const url3 = URL.createObjectURL(blob);
    a.href = url3;
    a.download = `ميزانيتي-${curYear}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url3), 1000);
    showAlert('success', '✅ تم تصدير بيانات ' + curYear + ' كاملاً');
}

// ══════════════════════════════════════════
//  READ-ONLY MODE
// ══════════════════════════════════════════
let isReadonly = false;
function toggleReadonly() {
    isReadonly = !isReadonly;
    document.body.classList.toggle('readonly', isReadonly);
    const badge = document.getElementById('readonlyBadge');
    const btn = document.getElementById('readonlyToggle');
    const btnM = document.getElementById('readonlyToggleMobile');
    if (badge) badge.classList.toggle('visible', isReadonly);
    const icon = isReadonly ? '✏️' : '👁';
    if (btn) btn.textContent = icon;
    if (btnM) btnM.textContent = icon;
    showAlert(isReadonly ? 'warning' : 'success',
        isReadonly ? '🔒 وضع العرض فقط — لا يمكن التعديل' : '✏️ تم إلغاء وضع العرض فقط');
    closeHeaderDrawer();
    document.querySelectorAll('.add-btn, .del-btn, .copy-month-btn, .settings-btn.danger, .settings-btn.primary')
        .forEach(b => b.disabled = isReadonly);
}

// ══════════════════════════════════════════
//  SAVINGS ALERTS & CHART
// ══════════════════════════════════════════
let savingsLineInst = null;

function updateSavingsPage() {
    renderSavingsAlerts();
    renderSavingsChart();
}

function renderSavingsAlerts() {
    const wrap = document.getElementById('savingsAlerts');
    if (!wrap) return;
    const rows = D.savings;
    if (!rows.length) { wrap.innerHTML = ''; return; }
    let html = '';
    rows.forEach(r => {
        const planned = r.planned || 0;
        const actual = r.actual || 0;
        if (!planned || actual === 0) return;
        const remaining = planned - actual;
        const pct = Math.round(actual / planned * 100);
        if (remaining <= 0) {
            html += `<div class="saving-alert done"><span class="sa-icon">🎉</span><span>تحقق هدف <strong>${esc(r.name)}</strong>! أحسنت!</span></div>`;
        } else if (pct >= 80) {
            html += `<div class="saving-alert"><span class="sa-icon">⚡</span><span>هدف <strong>${esc(r.name)}</strong> — تبقى فقط <strong>${fmt(remaining)}</strong> (${pct}%)</span></div>`;
        } else {
            html += `<div class="saving-alert warn"><span class="sa-icon">💡</span><span>هدف <strong>${esc(r.name)}</strong> — تبقى <strong>${fmt(remaining)}</strong> لتحقيقه</span></div>`;
        }
    });
    wrap.innerHTML = html;
}

function renderSavingsChart() {
    const card = document.getElementById('savingsChartCard');
    const ctx = document.getElementById('savingsLineChart');
    if (!card || !ctx) return;

    const goals = D.savings.filter(r => (r.planned || 0) > 0);
    if (!goals.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const labels = AR_MONTHS.map(m => m.substring(0, 3));
    const colors = ['#4a9e7f', '#7a60a8', '#c9615a', '#4a82a0', '#e0b060'];

    const datasets = goals.slice(0, 4).map((goal, gi) => {
        const data = [];
        for (let m = 1; m <= 12; m++) {
            const mData = peekMonth(curYear, m);
            if (mData) {
                const mGoal = mData.savings.find(r => r.name === goal.name);
                data.push(mGoal ? (mGoal.actual || 0) : null);
            } else data.push(null);
        }
        return {
            label: goal.name, data,
            borderColor: colors[gi % colors.length],
            backgroundColor: colors[gi % colors.length] + '20',
            tension: .35, spanGaps: true, fill: false,
            pointRadius: 3, borderWidth: 2
        };
    });

    if (savingsLineInst) savingsLineInst.destroy();
    const tickColor = isDark ? '#6b6880' : '#8a8480';
    const gridColor = isDark ? '#2a2d3a' : '#ede9e4';
    savingsLineInst = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { font: { family: 'Cairo', size: 10 }, color: isDark ? '#e8e6f0' : '#1a1714', boxWidth: 10, padding: 8 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtN(c.parsed.y || 0)} ${getCurr()}` } }
            },
            scales: {
                x: { ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor, callback: v => fmtShort(v) }, grid: { color: gridColor } }
            }
        }
    });
}

// ══════════════════════════════════════════
//  DEBT COUNTER
// ══════════════════════════════════════════
function updateDebtPage() {
    const summary = document.getElementById('debtSummary');
    const rowsWrap = document.getElementById('debtCounterRows');
    if (!summary || !rowsWrap) return;

    const debts = D.debts.filter(r => (r.planned || 0) > 0);
    if (!debts.length) { summary.style.display = 'none'; return; }
    summary.style.display = 'block';

    let html = '';
    debts.forEach(r => {
        const planned = r.planned || 0;
        const actual = r.actual || 0;
        const remaining = planned - actual;

        if (remaining <= 0) {
            html += `<div class="debt-item-row">
        <span class="debt-item-name">${esc(r.name)}</span>
        <div class="debt-item-info">
          <span class="debt-item-months debt-done">✅ مسدّد هذا الشهر</span>
        </div></div>`;
            return;
        }

        const avg = calcDebtAvgForRow(r.name);
        const monthlyRate = avg > 0 ? avg : (planned > 0 ? planned : 0);

        if (monthlyRate > 0) {
            const months = Math.ceil(remaining / monthlyRate);
            const endDate = new Date(curYear, curMonth - 1 + months, 1);
            const endLabel = AR_MONTHS[endDate.getMonth()] + ' ' + endDate.getFullYear();
            const source = avg > 0 ? 'بالمعدل الفعلي' : 'بالمبلغ المخطط';
            html += `<div class="debt-item-row">
        <span class="debt-item-name">${esc(r.name)}</span>
        <div class="debt-item-info">
          <span class="debt-item-months debt-pending">${months} شهر</span>
          <span class="debt-item-sub">~${endLabel} • ${source}</span>
        </div></div>`;
        } else {
            html += `<div class="debt-item-row">
        <span class="debt-item-name">${esc(r.name)}</span>
        <div class="debt-item-info">
          <span class="debt-item-months debt-unknown">—</span>
          <span class="debt-item-sub">أضف المبلغ المخطط لتقدير الموعد</span>
        </div></div>`;
        }
    });
    rowsWrap.innerHTML = html;
}

function calcDebtAvgForRow(name) {
    let total = 0, count = 0;
    for (let i = 1; i <= 3; i++) {
        let y = curYear, m = curMonth - i;
        if (m <= 0) { m += 12; y--; }
        const data = peekMonth(y, m);
        if (data) {
            const row = data.debts.find(r => r.name === name);
            if (row && (row.actual || 0) > 0) { total += row.actual; count++; }
        }
    }
    if (!count) {
        const cur = D.debts.find(r => r.name === name);
        if (cur && (cur.actual || 0) > 0) return cur.actual;
    }
    return count > 0 ? Math.round(total / count) : 0;
}

// ══════════════════════════════════════════
//  BUDGET HEALTH SCORE (perf: summary اختياري)
// ══════════════════════════════════════════
function updateHealthScore(summary) {
    const card = document.getElementById('healthCard');
    if (!card) return;
    const s = summary || getMonthSummary(D);
    const income = s.ia || s.ip;
    if (!income) { card.style.display = 'none'; return; }
    card.style.display = 'flex';

    let score = 50;
    const ba = s.ba || s.bp;
    const ea = s.ea || s.ep;
    const sa = s.sa || s.sp;
    const da = s.da || s.dp;
    const total = ba + ea + sa + da;

    if (income > 0) score += 10;
    if (income > 0 && sa / income >= 0.1) score += 15;
    else if (income > 0 && sa / income >= 0.05) score += 7;
    if (income > 0 && total / income < 0.8) score += 15;
    else if (income > 0 && total / income < 1) score += 7;
    if (total > income) score -= 20;
    if (income > 0 && da / income < 0.2) score += 10;
    let consistentMonths = 0;
    for (let i = 1; i <= 3; i++) {
        let y = curYear, m = curMonth - i;
        if (m <= 0) { m += 12; y--; }
        if (monthHasRealData(y, m)) consistentMonths++;
    }
    score += consistentMonths * 3;
    score = Math.max(10, Math.min(100, score));

    let status, tip, color;
    if (score >= 80) { status = 'ممتاز 🌟'; tip = 'ميزانيتك منضبطة بشكل رائع!'; color = '#4a9e7f'; }
    else if (score >= 60) { status = 'جيد 👍'; tip = 'أنت على الطريق الصحيح. حاول زيادة الادخار.'; color = '#4a82a0'; }
    else if (score >= 40) { status = 'متوسط ⚠️'; tip = 'راجع مصاريفك وحاول تسجيل بياناتك شهرياً.'; color = '#e0b060'; }
    else { status = 'يحتاج تحسين 🔴'; tip = 'مصاريفك تتجاوز دخلك. حاول تقليص النفقات.'; color = '#c9615a'; }

    document.getElementById('healthScoreNum').textContent = score;
    document.getElementById('healthScoreNum').style.color = color;
    document.getElementById('healthStatus').textContent = status;
    document.getElementById('healthStatus').style.color = color;
    document.getElementById('healthTip').textContent = tip;

    const canvas = document.getElementById('healthRing');
    if (!canvas) return;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, 72, 72);
    const cx = 36, cy = 36, r = 30, lw = 7;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = isDark ? '#2a2d3a' : '#ede9e4'; c.lineWidth = lw; c.stroke();
    const angle = (score / 100) * Math.PI * 2 - Math.PI / 2;
    c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, angle);
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
}

// ══════════════════════════════════════════
//  PDF EXPORT
// ══════════════════════════════════════════
function buildSectionTable(data, sec) {
    const rows = data[sec];
    if (!rows || !rows.length) return '';
    const cat = getCat(sec);
    let html = `<div class="pdf-section">
    <div class="pdf-section-title">${esc(cat.icon)} ${esc(cat.label)}</div>
    <table>
      <thead><tr><th>البند</th><th>المخطط</th><th>الفعلي</th><th>الفرق</th></tr></thead>
      <tbody>`;
    let tP = 0, tA = 0;
    rows.forEach(r => {
        const p = r.planned || 0, a = r.actual || 0;
        const diff = a - p;
        const dColor = sec === 'income' ? (diff >= 0 ? 'green' : 'red') : (diff <= 0 ? 'green' : 'red');
        html += `<tr>
      <td>${esc(r.name)}</td>
      <td>${fmtN(p)} ${getCurr()}</td>
      <td>${fmtN(a)} ${getCurr()}</td>
      <td class="${dColor}">${diff >= 0 ? '+' : ''}${fmtN(diff)}</td>
    </tr>`;
        tP += p; tA += a;
    });
    const tDiff = tA - tP;
    html += `<tr style="font-weight:800;background:#f7f5f2">
    <td>الإجمالي</td>
    <td>${fmtN(tP)} ${getCurr()}</td>
    <td>${fmtN(tA)} ${getCurr()}</td>
    <td>${tDiff >= 0 ? '+' : ''}${fmtN(tDiff)}</td>
  </tr></tbody></table></div>`;
    return html;
}

function exportMonthPDF() {
    const ip = sumD('income', 'planned'), ia = sumD('income', 'actual');
    const bp = sumD('bills', 'planned'), ba = sumD('bills', 'actual');
    const ep = sumD('expenses', 'planned'), ea = sumD('expenses', 'actual');
    const sp = sumD('savings', 'planned'), sa = sumD('savings', 'actual');
    const dp = sumD('debts', 'planned'), da = sumD('debts', 'actual');
    const totalA = ba + ea + sa + da;
    const remA = (ia || ip) - totalA;
    const curr = getCurr();
    const mLabel = AR_MONTHS[curMonth - 1] + ' ' + curYear;
    const today = new Date().toLocaleDateString('ar-MA');

    let sectionsHTML = '';
    SECS.forEach(sec => { sectionsHTML += buildSectionTable(D, sec); });

    document.getElementById('pdfReport').innerHTML = `
    <div class="pdf-header">
      <div>
        <div class="pdf-logo">ميزاني<span>تي</span></div>
        <div style="font-size:11px;color:#8a8480;margin-top:2px">تقرير شهري</div>
      </div>
      <div>
        <div class="pdf-title">${mLabel}</div>
        <div class="pdf-date">تاريخ التصدير: ${today}</div>
      </div>
    </div>

    <div class="pdf-summary-grid">
      <div class="pdf-stat"><div class="pdf-stat-label">الدخل</div><div class="pdf-stat-val green">${fmtN(ia || ip)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">المصاريف</div><div class="pdf-stat-val red">${fmtN(totalA)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">الادخار</div><div class="pdf-stat-val purple">${fmtN(sa || sp)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">الباقي</div><div class="pdf-stat-val ${remA >= 0 ? 'green' : 'red'}">${fmtN(remA)}<br><small style="font-size:10px">${curr}</small></div></div>
    </div>

    ${sectionsHTML}

    <div class="pdf-footer">ميزانيتي • تقرير ${mLabel} • البيانات سرية للاستخدام الشخصي</div>`;

    setTimeout(() => window.print(), 100);
}

function exportYearPDF() {
    const today = new Date().toLocaleDateString('ar-MA');
    let totalIncome = 0, totalSpent = 0, totalSavings = 0;
    let rowsHTML = '';
    const allMonthsStats = [];

    for (let m = 1; m <= 12; m++) {
        const data = peekMonth(curYear, m);
        if (!data) {
            allMonthsStats.push({ m, hasData: false });
            continue;
        }
        const s = getMonthSummary(data);
        totalIncome += s.income;
        totalSpent += s.total;
        totalSavings += s.savings;
        allMonthsStats.push({ m, hasData: true, ia: s.income, spent: s.total, sa: s.savings, rem: s.rem });
    }

    for (let row = 0; row < 3; row++) {
        rowsHTML += '<div class="pdf-year-row">';
        for (let col = 0; col < 4; col++) {
            const idx = row * 4 + col;
            const s = allMonthsStats[idx];
            if (!s) { rowsHTML += '<div class="pdf-year-cell"></div>'; continue; }
            if (!s.hasData) {
                rowsHTML += `<div class="pdf-year-cell">
          <div class="pdf-year-month">${AR_MONTHS[s.m - 1]}</div>
          <div class="pdf-year-nums" style="color:#ccc">فارغ</div>
        </div>`;
            } else {
                const curr = getCurr();
                rowsHTML += `<div class="pdf-year-cell">
          <div class="pdf-year-month">${AR_MONTHS[s.m - 1]}</div>
          <div class="pdf-year-nums">
            <span style="color:#4a9e7f">↑${fmtShort(s.ia)}</span> |
            <span style="color:#c9615a">↓${fmtShort(s.spent)}</span><br>
            <span style="color:${s.rem >= 0 ? '#4a9e7f' : '#c9615a'}">باقي: ${fmtShort(s.rem)}</span>
          </div>
        </div>`;
            }
        }
        rowsHTML += '</div>';
    }

    const curr = getCurr();
    document.getElementById('pdfReport').innerHTML = `
    <div class="pdf-header">
      <div>
        <div class="pdf-logo">ميزاني<span>تي</span></div>
        <div style="font-size:11px;color:#8a8480;margin-top:2px">تقرير سنوي</div>
      </div>
      <div>
        <div class="pdf-title">ملخص ${curYear}</div>
        <div class="pdf-date">تاريخ التصدير: ${today}</div>
      </div>
    </div>

    <div class="pdf-summary-grid">
      <div class="pdf-stat"><div class="pdf-stat-label">إجمالي الدخل</div><div class="pdf-stat-val green">${fmtN(totalIncome)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">إجمالي المصاريف</div><div class="pdf-stat-val red">${fmtN(totalSpent)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">إجمالي الادخار</div><div class="pdf-stat-val purple">${fmtN(totalSavings)}<br><small style="font-size:10px">${curr}</small></div></div>
      <div class="pdf-stat"><div class="pdf-stat-label">صافي السنة</div><div class="pdf-stat-val ${(totalIncome - totalSpent) >= 0 ? 'green' : 'red'}">${fmtN(totalIncome - totalSpent)}<br><small style="font-size:10px">${curr}</small></div></div>
    </div>

    <div class="pdf-section">
      <div class="pdf-section-title">📅 ملخص الشهور</div>
      ${rowsHTML}
    </div>

    <div class="pdf-footer">ميزانيتي • تقرير سنوي ${curYear} • البيانات سرية للاستخدام الشخصي</div>`;

    setTimeout(() => window.print(), 100);
}

// ══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); save(); showAlert('success', '✅ تم الحفظ'); }
        if (e.key === 'z') { e.preventDefault(); undoLast(); }
    }
    if (e.key === 'Escape') closeHeaderDrawer();
});

function undoLast() {
    if (isReadonly) {
        showAlert('warning', '⛔ لا يمكن التراجع في وضع القراءة فقط');
        return;
    }
    if (!undoStack.length) {
        showAlert('warning', '⚠️ لا يوجد شيء للتراجع عنه');
        return;
    }
    const prev = undoStack.pop();
    try {
        const snapshot = JSON.parse(prev);
        const currentKey = monthKey(curYear, curMonth);
        if (snapshot.key !== currentKey) {
            undoStack.push(prev);
            showAlert(
                'warning',
                `⚠️ لا يمكن التراجع: أنت الآن في شهر ${AR_MONTHS[curMonth - 1]} ${curYear}، بينما التعديل المحفوظ كان في شهر آخر. انتقل إلى الشهر الصحيح ثم حاول مجدداً.`
            );
            return;
        }
        const prevData = snapshot.data;
        SECS.forEach(sec => {
            if (prevData[sec]) D[sec] = prevData[sec];
        });
        if (prevData._note !== undefined) {
            D._note = prevData._note;
            loadMonthNote();
        }
        save();
        SECS.forEach(renderRows);
        updateOverview();
        showAlert('success', '↩️ تم التراجع عن آخر تعديل');
    } catch (e) {
        showAlert('danger', '❌ حدث خطأ في استرجاع النسخة الاحتياطية');
    }
}

// ══════════════════════════════════════════
//  MONTH NOTE
// ══════════════════════════════════════════
function saveMonthNote(val) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    const k = monthKey(curYear, curMonth);
    if (!ALL[k]) ALL[k] = { income: [], bills: [], expenses: [], savings: [], debts: [] };
    ALL[k]._note = val;
    save();
}

function loadMonthNote() {
    const el = document.getElementById('monthNote');
    if (!el) return;
    const data = peekMonth(curYear, curMonth);
    el.value = data?._note || '';
}

// ══════════════════════════════════════════
//  ALERT SNOOZE
// ══════════════════════════════════════════
let snoozedAlerts = {};
try { snoozedAlerts = JSON.parse(localStorage.getItem('myz_snoozed') || '{}'); } catch { }

function snoozeAlert() {
    const bar = document.getElementById('alertBar');
    const msg = document.getElementById('alertBarMsg')?.textContent || '';
    if (msg) {
        const key = 'snz_' + btoa(encodeURIComponent(msg)).slice(0, 20);
        const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
        snoozedAlerts[key] = until;
        try { localStorage.setItem('myz_snoozed', JSON.stringify(snoozedAlerts)); } catch { }
    }
    bar.style.display = 'none';
    setTimeout(() => showAlert('success', '⏰ تم إخفاء هذا التنبيه لأسبوع'), 50);
}

function isAlertSnoozed(msg) {
    const key = 'snz_' + btoa(encodeURIComponent(msg)).slice(0, 20);
    const until = snoozedAlerts[key];
    if (!until) return false;
    if (Date.now() > until) { delete snoozedAlerts[key]; return false; }
    return true;
}

// ══════════════════════════════════════════
//  REPEAT ROWS
// ══════════════════════════════════════════
function toggleRepeat(sec, i) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    pushUndo();
    D[sec][i].repeat = !D[sec][i].repeat;
    save(); renderRows(sec);
}

function applyRepeatRows() {
    let prevY = curYear, prevM = curMonth - 1;
    if (prevM === 0) { prevM = 12; prevY--; }
    const prevData = peekMonth(prevY, prevM);
    if (!prevData) return;
    let changed = false;
    SECS.forEach(sec => {
        prevData[sec].forEach(r => {
            if (!r.repeat) return;
            const exists = D[sec].some(cr => cr.name === r.name);
            if (!exists) {
                D[sec].push({ name: r.name, planned: r.planned || 0, actual: 0, note: '', date: '', repeat: true });
                changed = true;
            }
        });
    });
    if (changed) { save(); SECS.forEach(renderRows); }
}

// ══════════════════════════════════════════
//  OVERVIEW BAR CHART (perf: summary اختياري)
// ══════════════════════════════════════════
let overviewBarInst = null;

function updateOverviewBarChart(summary) {
    const card = document.getElementById('overviewBarCard');
    const ctx = document.getElementById('overviewBarChart');
    if (!card || !ctx) return;

    const s = summary || getMonthSummary(D);
    const planned = [s.bp, s.ep, s.sp, s.dp];
    const actual = [s.ba, s.ea, s.sa, s.da];
    const hasData = planned.some(v => v > 0) || actual.some(v => v > 0);
    if (!hasData) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const labels = ['bills', 'expenses', 'savings', 'debts'].map(k => getCat(k).label);
    const tickColor = isDark ? '#6b6880' : '#8a8480';
    const gridColor = isDark ? '#2a2d3a' : '#ede9e4';

    if (overviewBarInst) overviewBarInst.destroy();
    overviewBarInst = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'المخطط', data: planned, backgroundColor: 'rgba(74,158,127,0.3)', borderColor: '#4a9e7f', borderWidth: 2, borderRadius: 6 },
                { label: 'الفعلي', data: actual, backgroundColor: 'rgba(201,97,90,0.3)', borderColor: '#c9615a', borderWidth: 2, borderRadius: 6 },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { font: { family: 'Cairo', size: 11 }, color: isDark ? '#e8e6f0' : '#1a1714', boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtN(c.parsed.y)} ${getCurr()}` } }
            },
            scales: {
                x: { ticks: { font: { family: 'Cairo', size: 11 }, color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { font: { family: 'Cairo', size: 10 }, color: tickColor, callback: v => fmtShort(v) }, grid: { color: gridColor } }
            }
        }
    });
}

// ══════════════════════════════════════════
//  IMPORT CSV (perf: sanitizeRow على كل صف)
// ══════════════════════════════════════════
function importCSV(file) {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const text = e.target.result.replace(/^\uFEFF/, '');
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(l => l.trim());
            if (!lines.length) { showAlert('danger', '❌ الملف فارغ'); return; }

            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
            const idx = {
                sec: headers.findIndex(h => h.includes('قسم') || h.includes('section') || h.includes('sec')),
                name: headers.findIndex(h => h.includes('اسم') || h.includes('name')),
                plan: headers.findIndex(h => h.includes('مخطط') || h.includes('planned')),
                actual: headers.findIndex(h => h.includes('فعل') || h.includes('actual')),
                note: headers.findIndex(h => h.includes('ملاح') || h.includes('note')),
                date: headers.findIndex(h => h.includes('تاريخ') || h.includes('date')),
                repeat: headers.findIndex(h => h.includes('تكرار') || h.includes('repeat')),
            };

            if (idx.name === -1) { showAlert('danger', '❌ لم يُعثر على عمود الاسم في الملف'); return; }

            const secMap = {
                'الدخل': 'income', 'income': 'income', 'دخل': 'income',
                'الفواتير': 'bills', 'bills': 'bills', 'فواتير': 'bills',
                'المصاريف': 'expenses', 'expenses': 'expenses', 'مصاريف': 'expenses',
                'الادخار': 'savings', 'savings': 'savings', 'ادخار': 'savings',
                'الديون': 'debts', 'debts': 'debts', 'ديون': 'debts',
            };
            SECS.forEach(s => { secMap[getCat(s).label] = s; secMap[getCat(s).label.toLowerCase()] = s; });

            function parseCSVLine(line) {
                const result = []; let cur = ''; let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                        else inQ = !inQ;
                    } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
                    else cur += ch;
                }
                result.push(cur.trim());
                return result;
            }

            const getCol = (row, i) => i >= 0 ? (row[i] || '').replace(/^"|"$/g, '').trim() : '';

            let added = 0, skipped = 0;
            const newRows = { income: [], bills: [], expenses: [], savings: [], debts: [] };

            lines.slice(1).forEach(line => {
                if (!line.trim()) return;
                const row = parseCSVLine(line);
                const rawSec = getCol(row, idx.sec);
                const sec = secMap[rawSec] || secMap[rawSec.toLowerCase()] || null;
                const name = getCol(row, idx.name);
                if (!name) return;

                // ── بناء خام ثم المرور على sanitizeRow (طول، نوع، سالب، تاريخ) ──
                const rawEntry = {
                    name,
                    planned: parseFloat(getCol(row, idx.plan)),
                    actual: parseFloat(getCol(row, idx.actual)),
                    note: getCol(row, idx.note),
                    date: getCol(row, idx.date),
                    repeat: getCol(row, idx.repeat) === 'true' || getCol(row, idx.repeat) === 'نعم',
                };

                const entry = sanitizeRow(rawEntry);
                if (sec && entry) { newRows[sec].push(entry); added++; }
                else { skipped++; }
            });

            if (!added) { showAlert('danger', '❌ لم يُستورد أي بند — تحقق من تنسيق الملف'); return; }

            pushUndo();

            if (confirm(`سيتم استيراد ${added} بند${skipped ? ' (تم تجاهل ' + skipped + ' بند بدون قسم معروف)' : ''}\nهل تريد الإضافة لبيانات الشهر الحالي أم الاستبدال؟\n\nموافق = إضافة | إلغاء = استبدال`)) {
                SECS.forEach(sec => { D[sec] = [...D[sec], ...newRows[sec]]; });
            } else {
                SECS.forEach(sec => { if (newRows[sec].length) D[sec] = newRows[sec]; });
            }
            save(); SECS.forEach(renderRows); updateOverview(); loadMonthNote();
            showAlert('success', `✅ تم استيراد ${added} بند بنجاح`);
        } catch (err) { showAlert('danger', '❌ خطأ في قراءة الملف: ' + err.message); }
    };
    reader.readAsText(file, 'UTF-8');
    document.getElementById('importCSVFile').value = '';
}

// ══════════════════════════════════════════
//  SHARE MONTH URL
// ══════════════════════════════════════════
function shareMonthURL() {
    try {
        const k = monthKey(curYear, curMonth);
        const monthData = ALL[k] || D;
        const payload = JSON.stringify({ v: 1, k, d: monthData });
        const encoded = utf8ToBase64(payload);
        const url = location.origin + location.pathname + '?myz=' + encoded;

        if (url.length > 8000) {
            showAlert('warning', '⚠️ البيانات كثيرة للمشاركة عبر رابط — جرب تصدير JSON');
            return;
        }

        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() =>
                showAlert('success', '✅ تم نسخ الرابط — شاركه مع من تريد 🔗')
            ).catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    } catch (e) { showAlert('danger', '❌ فشل في إنشاء الرابط'); }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showAlert('success', '✅ تم نسخ الرابط 🔗'); }
    catch { showAlert('warning', '⚠️ انسخ الرابط يدوياً من شريط العنوان'); }
    document.body.removeChild(ta);
}

function loadSharedMonth() {
    const params = new URLSearchParams(location.search);
    const myz = params.get('myz');
    if (!myz) return;
    try {
        const payload = JSON.parse(base64ToUtf8(myz));
        if (!payload?.k || !payload?.d) return;

        if (!/^\d{4}-\d{2}$/.test(payload.k)) {
            showAlert('danger', '❌ رابط غير صالح');
            history.replaceState(null, '', location.pathname);
            return;
        }

        if (typeof payload.d !== 'object' || payload.d === null || Array.isArray(payload.d)) {
            showAlert('danger', '❌ بيانات غير صالحة');
            history.replaceState(null, '', location.pathname);
            return;
        }

        const [y, m] = payload.k.split('-').map(Number);
        if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
            showAlert('danger', '❌ شهر غير صالح');
            history.replaceState(null, '', location.pathname);
            return;
        }

        const label = AR_MONTHS[m - 1] + ' ' + y;
        if (confirm(`📤 تم مشاركة ميزانية ${label} معك\nهل تريد استيراد هذه البيانات؟\n\nسيتم إضافتها لبياناتك الحالية`)) {
            const cleanMonth = sanitizeMonthData(payload.d);
            if (cleanMonth) {
                ALL[payload.k] = cleanMonth;
                save();
                if (y === curYear && m === curMonth) {
                    D = ALL[payload.k];
                    SECS.forEach(renderRows);
                    updateOverview();
                }
                showAlert('success', `✅ تم استيراد ميزانية ${label}`);
            } else {
                showAlert('danger', '❌ بيانات الشهر غير صالحة أو تالفة');
            }
        }
        history.replaceState(null, '', location.pathname);
    } catch (e) {
        showAlert('danger', '❌ رابط تالف أو غير صالح');
        history.replaceState(null, '', location.pathname);
    }
}

// ══════════════════════════════════════════
//  REPEAT ROWS ALERTS
// ══════════════════════════════════════════
function checkRepeatAlerts() {
    if (!appReady) return;
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === curYear && (today.getMonth() + 1) === curMonth;
    if (!isCurrentMonth || today.getDate() < 15) return;

    const unpaid = [];
    SECS.forEach(sec => {
        D[sec].forEach(r => {
            if (r.repeat && (r.actual || 0) === 0 && (r.planned || 0) > 0) {
                unpaid.push(r.name);
            }
        });
    });

    if (!unpaid.length) return;
    const names = unpaid.slice(0, 2).join('، ') + (unpaid.length > 2 ? '...' : '');
    showAlert('warning', `⏰ لم تُسجّل بعد: ${names} — بنود متكررة لم تُدفع`);
}

// ══════════════════════════════════════════
//  MULTI-YEAR COMPARISON CHART
// ══════════════════════════════════════════
let multiYearInst = null;
let activeYears = new Set([curYear]);

function renderMultiYearChart() {
    const wrap = document.getElementById('multiYearChart');
    const ctrlWrap = document.getElementById('multiYearControls');
    if (!wrap || !ctrlWrap) return;

    const availYears = new Set();
    Object.keys(ALL).forEach(k => {
        const m = k.match(/^(\d{4})-/);
        if (m) availYears.add(+m[1]);
    });
    availYears.add(curYear);
    availYears.add(curYear - 1);
    availYears.add(curYear - 2);
    const yearsList = [...availYears].sort((a, b) => b - a).slice(0, 5);

    ctrlWrap.innerHTML = yearsList.map(y => `
    <button class="year-toggle-btn${activeYears.has(y) ? ' active' : ''}"
      onclick="toggleYearInChart(${y})">${y}</button>
  `).join('') + '<span style="font-size:10px;color:var(--muted);margin-right:4px">اختر سنوات للمقارنة</span>';

    const colors = [
        { b: '#4a9e7f', bg: '#4a9e7f30' },
        { b: '#7a60a8', bg: '#7a60a830' },
        { b: '#c9615a', bg: '#c9615a30' },
        { b: '#4a82a0', bg: '#4a82a030' },
        { b: '#e0b060', bg: '#e0b06030' },
    ];
    const tickColor = isDark ? '#6b6880' : '#8a8480';
    const gridColor = isDark ? '#2a2d3a' : '#ede9e4';

    const datasets = [];
    [...activeYears].sort().forEach((y, ci) => {
        const spentData = [];
        for (let m = 1; m <= 12; m++) {
            const data = peekMonth(y, m);
            if (data) {
                const s = getMonthSummary(data);
                spentData.push(s.total || null);
            } else spentData.push(null);
        }
        const c = colors[ci % colors.length];
        datasets.push({
            label: String(y), data: spentData,
            borderColor: c.b, backgroundColor: c.bg,
            tension: .35, spanGaps: true, borderWidth: 2.5,
            pointRadius: 3, fill: false
        });
    });

    if (multiYearInst) multiYearInst.destroy();
    multiYearInst = new Chart(wrap.getContext('2d'), {
        type: 'line',
        data: { labels: AR_MONTHS.map(m => m.substring(0, 3)), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { font: { family: 'Cairo', size: 11 }, color: isDark ? '#e8e6f0' : '#1a1714', boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtN(c.parsed.y || 0)} ${getCurr()}` } }
            },
            scales: {
                x: { ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor }, grid: { color: gridColor } },
                y: { ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor, callback: v => fmtShort(v) }, grid: { color: gridColor } }
            }
        }
    });
}

function toggleYearInChart(y) {
    if (activeYears.has(y)) { if (activeYears.size > 1) activeYears.delete(y); }
    else { if (activeYears.size < 4) activeYears.add(y); }
    renderMultiYearChart();
}

// ══════════════════════════════════════════
//  SAVINGS RATE TRACKER
// ══════════════════════════════════════════
let savingsRateInst = null;

function renderSavingsRateChart() {
    const card = document.getElementById('savingsRateCard');
    const ctx = document.getElementById('savingsRateChart');
    if (!card || !ctx) return;

    const rateData = [];
    let hasAny = false;
    for (let m = 1; m <= 12; m++) {
        const data = peekMonth(viewYear, m);
        if (data) {
            const s = getMonthSummary(data);
            const rate = s.income > 0 ? Math.round(s.savings / s.income * 100) : null;
            rateData.push(rate);
            if (rate !== null) hasAny = true;
        } else rateData.push(null);
    }

    if (!hasAny) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const tickColor = isDark ? '#6b6880' : '#8a8480';
    const gridColor = isDark ? '#2a2d3a' : '#ede9e4';
    const avg = rateData.filter(v => v !== null);
    const avgRate = avg.length ? Math.round(avg.reduce((a, b) => a + b, 0) / avg.length) : 0;

    if (savingsRateInst) savingsRateInst.destroy();
    savingsRateInst = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: AR_MONTHS.map(m => m.substring(0, 3)),
            datasets: [
                {
                    label: 'نسبة الادخار %', data: rateData,
                    borderColor: '#7a60a8', backgroundColor: '#7a60a820',
                    tension: .35, spanGaps: true, fill: true,
                    pointRadius: 4, borderWidth: 2.5,
                    pointBackgroundColor: rateData.map(v => v === null ? 'transparent' : v >= 20 ? '#4a9e7f' : v >= 10 ? '#e0b060' : '#c9615a')
                },
                {
                    label: `متوسط (${avgRate}%)`,
                    data: Array(12).fill(avgRate),
                    borderColor: '#4a9e7f', borderDash: [4, 4],
                    pointRadius: 0, borderWidth: 1.5
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { font: { family: 'Cairo', size: 11 }, color: isDark ? '#e8e6f0' : '#1a1714', boxWidth: 12, padding: 8 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y !== null ? c.parsed.y + '%' : '—'}` } }
            },
            scales: {
                x: { ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor }, grid: { color: gridColor } },
                y: {
                    ticks: { font: { family: 'Cairo', size: 9 }, color: tickColor, callback: v => v + '%' },
                    grid: { color: gridColor }, min: 0, max: Math.max(50, ...rateData.filter(v => v !== null)) + 10
                }
            }
        }
    });
}

// ══════════════════════════════════════════
//  MONTHLY COMPARISON BANNER (M3)
// ══════════════════════════════════════════
function checkMonthlyComparison() {
    const banner = document.getElementById('monthCmpBanner');
    if (!banner) return;

    let prevY = curYear, prevM = curMonth - 1;
    if (prevM === 0) { prevM = 12; prevY--; }

    const prevData = peekMonth(prevY, prevM);
    if (!prevData) return;

    const curS = getMonthSummary(D);
    const prevS = getMonthSummary(prevData);

    const curSpent = curS.bills + curS.expenses;
    const prevSpent = prevS.bills + prevS.expenses;

    if (!prevS.income && !prevSpent) { banner.style.display = 'none'; return; }

    const icon = document.getElementById('mcbIcon');
    const text = document.getElementById('mcbText');
    let type = 'neutral', iconVal = '📊', msg = '';

    const spentDiff = prevSpent > 0 ? Math.round((curSpent - prevSpent) / prevSpent * 100) : 0;
    const savDiff = prevS.savings > 0 ? Math.round((curS.savings - prevS.savings) / prevS.savings * 100) : 0;
    const prevLabel = AR_MONTHS[prevM - 1] + ' ' + prevY;

    if (curSpent > 0 && prevSpent > 0) {
        if (spentDiff <= -10) {
            type = 'better'; iconVal = '🎉';
            msg = `هذا الشهر أفضل! مصاريفك انخفضت ${Math.abs(spentDiff)}% مقارنة بـ ${prevLabel}`;
        } else if (spentDiff >= 15) {
            type = 'worse'; iconVal = '⚠️';
            msg = `مصاريفك ارتفعت ${spentDiff}% مقارنة بـ ${prevLabel} — راجع نفقاتك`;
        } else if (prevS.savings > 0 && savDiff >= 20) {
            type = 'better'; iconVal = '💎';
            msg = `ادخارك ارتفع ${savDiff}% مقارنة بـ ${prevLabel} — ممتاز!`;
        } else {
            type = 'neutral'; iconVal = '📊';
            msg = `مقارنة بـ ${prevLabel}: مصاريف ${spentDiff > 0 ? '+' : ''}${spentDiff}% | ادخار ${savDiff > 0 ? '+' : ''}${savDiff}%`;
        }
    } else {
        banner.style.display = 'none';
        return;
    }

    banner.className = `month-cmp-banner ${type}`;
    if (icon) icon.textContent = iconVal;
    if (text) text.textContent = msg;
    banner.style.display = 'flex';
}

// ══════════════════════════════════════════
//  NOTIFICATION BADGE
// ══════════════════════════════════════════
function updateSettingsBadge() {
    const ids = ['badge-tab-settings', 'badge-side-settings', 'badge-bnav-settings'];
    const hide = () => ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === curYear && (today.getMonth() + 1) === curMonth;
    if (!isCurrentMonth) { hide(); return; }
    if (today.getDate() < 15) { hide(); return; }

    const count = SECS.reduce((n, sec) =>
        n + D[sec].filter(r => r.repeat && (r.actual || 0) === 0 && (r.planned || 0) > 0).length
        , 0);
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (count > 0) { el.textContent = count > 9 ? '9+' : count; el.style.display = 'flex'; }
        else el.style.display = 'none';
    });
}

// ══════════════════════════════════════════
//  COPY AMOUNT
// ══════════════════════════════════════════
function copyAmt(n) {
    const text = String(n || 0);
    const ok = () => showAlert('success', '⎘ تم نسخ ' + text);
    const fail = () => showAlert('warning', '⚠️ المتصفح لا يدعم النسخ التلقائي');

    const legacyCopy = () => {
        try {
            const ta = Object.assign(document.createElement('textarea'),
                { value: text, style: 'position:fixed;opacity:0' });
            document.body.appendChild(ta); ta.select();
            const success = document.execCommand('copy');
            document.body.removeChild(ta);
            if (success) ok(); else fail();
        } catch { fail(); }
    };

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(ok).catch(legacyCopy);
    } else {
        legacyCopy();
    }
}

// ══════════════════════════════════════════
//  DATE FILTER
// ══════════════════════════════════════════
const dateFilterState = {};

function applyDateFilter(sec, fromVal, toVal) {
    const from = fromVal !== undefined ? fromVal : (document.getElementById('dfrom-' + sec)?.value || '');
    const to = toVal !== undefined ? toVal : (document.getElementById('dto-' + sec)?.value || '');
    dateFilterState[sec] = { from, to };

    const card = document.getElementById('card-' + sec);
    if (!card) return;
    const rows = card.querySelectorAll('.data-row');
    let visible = 0;
    rows.forEach(row => {
        const idx = parseInt(row.dataset.idx);
        const rowDate = D[sec][idx]?.date || '';
        let show = true;
        if (from && rowDate && rowDate < from) show = false;
        if (to && rowDate && rowDate > to) show = false;
        if ((from || to) && !rowDate) show = true;
        if (show && searchState[sec]) {
            const name = (row.querySelector('.row-name')?.value || '').toLowerCase();
            if (!name.includes(searchState[sec].toLowerCase())) show = false;
        }
        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const countEl = document.getElementById('dcount-' + sec);
    if (countEl && (from || to)) {
        countEl.textContent = `${visible} بند ظاهر`;
        const bar = document.getElementById('date-filter-' + sec);
        if (bar) bar.style.display = 'flex';
    }
}

function clearDateFilter(sec) {
    dateFilterState[sec] = { from: '', to: '' };
    const fromEl = document.getElementById('dfrom-' + sec);
    const toEl = document.getElementById('dto-' + sec);
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    const countEl = document.getElementById('dcount-' + sec);
    if (countEl) countEl.textContent = '';
    const card = document.getElementById('card-' + sec);
    if (card) card.querySelectorAll('.data-row').forEach(r => r.style.display = '');
}

function toggleDateFilter(sec) {
    const bar = document.getElementById('date-filter-' + sec);
    const btn = document.getElementById('dfbtn-' + sec);
    if (!bar) return;
    const visible = bar.style.display !== 'none' && bar.style.display !== '';
    if (visible) {
        clearDateFilter(sec); bar.style.display = 'none';
        if (btn) btn.classList.remove('active');
    } else {
        bar.style.display = 'flex';
        if (btn) btn.classList.add('active');
        const from = document.getElementById('dfrom-' + sec)?.value || '';
        const to = document.getElementById('dto-' + sec)?.value || '';
        if (from || to) applyDateFilter(sec);
    }
}

// ══════════════════════════════════════════
//  EXPORT SUMMARY PNG
// ══════════════════════════════════════════
async function exportSummaryPNG() {
    await document.fonts.ready;

    const mLabel = AR_MONTHS[curMonth - 1] + ' ' + curYear;
    const ia = sumD('income', 'actual') || sumD('income', 'planned');
    const ba = sumD('bills', 'actual') || sumD('bills', 'planned');
    const ea = sumD('expenses', 'actual') || sumD('expenses', 'planned');
    const sa = sumD('savings', 'actual') || sumD('savings', 'planned');
    const total = ba + ea + sa + sumD('debts', 'actual');
    const rem = ia - total;
    const curr = getCurr();

    function rrect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    const W = 480, H = 320;
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    ctx.direction = 'rtl';

    const bg = isDark ? '#1a1d27' : '#f7f5f2';
    const surf = isDark ? '#22253a' : '#ffffff';
    const txt = isDark ? '#e8e6f0' : '#1a1714';
    const muted = isDark ? '#6b6880' : '#8a8480';
    const green = '#4a9e7f';
    const pink = '#c9615a';
    const blue = '#4a82a0';
    const purple = '#7a60a8';

    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = surf;
    rrect(ctx, 16, 16, W - 32, 52, 10); ctx.fill();
    ctx.font = 'bold 20px Tajawal,Arial'; ctx.fillStyle = txt; ctx.textAlign = 'right';
    ctx.fillText('ميزانيتي', W - 28, 49);
    ctx.font = '13px Cairo,Arial'; ctx.fillStyle = muted; ctx.textAlign = 'left';
    ctx.fillText(mLabel, 28, 49);

    const cards = [
        { label: 'الدخل', val: ia, color: green, icon: '💰' },
        { label: 'الباقي', val: rem, color: rem >= 0 ? blue : pink, icon: '✨' },
        { label: 'المصاريف', val: total, color: pink, icon: '🛍️' },
        { label: 'الادخار', val: sa, color: purple, icon: '💎' },
    ];

    const cW = (W - 32 - 12) / 2, cH = 80;
    cards.forEach(({ label, val, color, icon }, i) => {
        const x = 16 + (i % 2) * (cW + 8);
        const y = 84 + Math.floor(i / 2) * (cH + 8);
        ctx.fillStyle = surf;
        rrect(ctx, x, y, cW, cH, 10); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        rrect(ctx, x, y, cW, cH, 10); ctx.stroke();
        ctx.font = '11px Cairo,Arial'; ctx.fillStyle = muted; ctx.textAlign = 'right';
        ctx.fillText(label, x + cW - 12, y + 22);
        ctx.font = 'bold 18px Tajawal,Arial'; ctx.fillStyle = color;
        ctx.fillText(fmtN(val), x + cW - 12, y + 48);
        ctx.font = '11px Cairo,Arial'; ctx.fillStyle = muted;
        ctx.fillText(curr, x + cW - 12, y + 64);
        ctx.font = '20px Arial'; ctx.textAlign = 'left';
        ctx.fillText(icon, x + 12, y + 50);
    });

    ctx.font = '10px Cairo,Arial'; ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText('ميزانيتي • ميزانيتك في يدك', W / 2, H - 12);

    cv.toBlob(blob => {
        if (!blob) { showAlert('danger', '❌ فشل تصدير الصورة — جرّب متصفحاً آخر'); return; }
        const a = document.createElement('a');
        const urlPng = URL.createObjectURL(blob);
        a.href = urlPng;
        a.download = `ميزانيتي-${mLabel}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(urlPng), 1000);
        showAlert('success', '🖼️ تم تصدير الصورة');
    }, 'image/png');
}

// ══════════════════════════════════════════
//  STRICT BUDGET MODE
// ══════════════════════════════════════════
let isStrictMode = localStorage.getItem('myz_strict') === '1';

function applyStrictMode() {
    const track = document.getElementById('strictTrack');
    const label = document.getElementById('strictLabel');
    document.body.classList.toggle('strict-mode', isStrictMode);
    if (track) track.classList.toggle('on', isStrictMode);
    if (label) {
        label.textContent = isStrictMode ? 'مُفعَّل' : 'معطّل';
        label.style.color = isStrictMode ? 'var(--danger)' : 'var(--muted)';
    }
}

function toggleStrictMode() {
    if (isReadonly) {
        showAlert('warning', '⛔ التطبيق في وضع القراءة فقط، قم بإلغاء الوضع للتعديل');
        return;
    }
    isStrictMode = !isStrictMode;
    localStorage.setItem('myz_strict', isStrictMode ? '1' : '0');
    applyStrictMode();
    SECS.forEach(renderRows);
    showAlert(isStrictMode ? 'warning' : 'success',
        isStrictMode ? '🔒 وضع الميزانية الصارمة مُفعَّل' : '🔓 تم إلغاء وضع الميزانية الصارمة');
}

function checkStrictLimit(sec, i, newActual) {
    if (!isStrictMode) return true;
    if (sec === 'income' || sec === 'savings') return true;
    const planned = D[sec][i]?.planned || 0;
    if (planned <= 0) return true;
    if (newActual > planned) {
        const name = D[sec][i]?.name || 'البند';
        const over = fmtN(newActual - planned);
        showAlert('danger', `🔒 تجاوزت ميزانية "${name}" بـ ${over} ${getCurr()}!`);
        return false;
    }
    return true;
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
applyDark(isDark);
applyStrictMode();
document.getElementById('currSelect').value = currency;
const csMobile = document.getElementById('currSelectMobile');
if (csMobile) csMobile.value = currency;
updateMonthBadge();
SECS.forEach(renderRows);
updateOverview();
applyNavLabels();
SECS.filter(s => s !== 'income').forEach(updateSecTitle);
loadMonthNote();
if (!monthHasRealData(curYear, curMonth)) applyRepeatRows();
appReady = true;
checkAlerts();
checkMonthlyComparison();
setTimeout(updateCharts, 80);
setTimeout(updateOverviewBarChart, 100);
initTouchDrag();
setTimeout(() => {
    checkDailyReminder();
    if (document.visibilityState === 'visible') startReminderTimer();
}, 2000);
loadSharedMonth();

// ══════════════════════════════════════════
//  PWA — Service Worker + Install Prompt
// ══════════════════════════════════════════

// 1. تسجيل Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ Service Worker مسجل بنجاح. النطاق:', reg.scope))
            .catch(err => console.warn('⚠️ فشل تسجيل Service Worker:', err.message));
    });
}

// 2. حدث beforeinstallprompt
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const sec = document.getElementById('pwa-section');
    if (sec) sec.style.display = 'block';
    const btn = document.getElementById('installBtn');
    if (btn) btn.style.display = 'flex';
    console.log('📲 التطبيق قابل للتثبيت');
});

// 3. دالة التثبيت
function installApp() {
    if (!deferredPrompt) {
        if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
            showAlert('warning', '📱 اضغط على زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"');
        } else if (window.navigator.standalone) {
            showAlert('success', '✅ التطبيق مثبت بالفعل!');
        } else {
            showAlert('warning', '📱 افتح التطبيق في Chrome أو Edge وأضفه للشاشة الرئيسية');
        }
        return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
            showAlert('success', '✅ تم تثبيت التطبيق بنجاح!');
            const sec = document.getElementById('pwa-section');
            if (sec) sec.style.display = 'none';
            const btn = document.getElementById('installBtn');
            if (btn) btn.style.display = 'none';
        }
        deferredPrompt = null;
    });
}

// 4. دعم iOS Safari
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
if (isIOS && !isInStandalone) {
    const sec = document.getElementById('pwa-section');
    if (sec) {
        sec.style.display = 'block';
        const sub = sec.querySelector('.settings-row-sub');
        if (sub) sub.textContent = '📲 اضغط على زر المشاركة (⬆️) ثم "إضافة إلى الشاشة الرئيسية"';
        const btn = sec.querySelector('.settings-btn');
        if (btn) btn.onclick = () => showAlert('warning', '📱 iOS: اضغط على زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"');
    }
}

// 5. حدث appinstalled
window.addEventListener('appinstalled', () => {
    console.log('✅ تم تثبيت التطبيق');
    showAlert('success', '🎉 تم تثبيت ميزانيتي على جهازك!');
});

// ══════════════════════════════════════════
//  SW Update Notification
// ══════════════════════════════════════════
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'SW_UPDATED') {
            const bar = document.getElementById('alertBar');
            const msgEl = document.getElementById('alertBarMsg');
            if (bar && msgEl) {
                bar.className = 'alert-bar success';
                bar.style.display = 'flex';
                bar.innerHTML = `
                    <span>🔄 تنزّلت نسخة جديدة — أعد التحميل باش تشوفها</span>
                    <button class="alert-bar-dismiss" onclick="location.reload()" title="إعادة التحميل">🔄</button>
                    <button class="alert-bar-dismiss" onclick="this.parentElement.style.display='none'" title="إغلاق">✕</button>
                `;
                clearTimeout(window._swUpdateTimer);
            }
        }
    });
}