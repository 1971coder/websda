// SDA Modeler – MVP cashflow engine (pure JS)

let lastSnapshot = null;

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function monthsBetweenInclusive(start, end) {
  // start/end are YYYY-MM strings
  const [ys, ms] = start.split('-').map(Number);
  const [ye, me] = end.split('-').map(Number);
  const months = [];
  const d = new Date(ys, ms - 1, 1);
  const endDate = new Date(ye, me - 1, 1);
  while (d <= endDate) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Compare YYYY-MM strings: returns -1,0,1
function cmpYm(a, b) {
  if (!a || !b) return 0;
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  const da = new Date(ya, ma - 1, 1).getTime();
  const db = new Date(yb, mb - 1, 1).getTime();
  return da === db ? 0 : (da < db ? -1 : 1);
}

// Diff in months (b - a) for YYYY-MM strings
function monthsDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function allocationWeights(method, n, sigma) {
  if (n <= 0) return [];
  if (method === 'straight') {
    return Array.from({ length: n }, () => 1 / n);
  }
  // s-curve via normal pdf over 1..n with mu at center and given sigma
  const mu = (n + 1) / 2;
  const s = sigma && sigma > 0 ? sigma : Math.max(1, 0.3 * n);
  const coeff = 1 / (s * Math.sqrt(2 * Math.PI));
  const w = [];
  for (let m = 1; m <= n; m++) {
    const z = (m - mu) / s;
    w.push(coeff * Math.exp(-0.5 * z * z));
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}

function buildConstructionDraws(amount, start, end, method, sigma) {
  const months = monthsBetweenInclusive(start, end);
  const n = months.length;
  const weights = allocationWeights(method, n, sigma);
  const schedule = new Map();
  for (let i = 0; i < n; i++) {
    schedule.set(months[i], amount * (weights[i] || 0));
  }
  return schedule; // Map<YYYY-MM, amount>
}

function buildLandDraws({ landLoan, landStampDuty, landMonth, otherAcqCosts, otherAcqMonth }) {
  const m = new Map();
  if (landLoan > 0 && landMonth) {
    m.set(landMonth, (m.get(landMonth) || 0) + landLoan);
  }
  if (landStampDuty > 0 && landMonth) {
    m.set(landMonth, (m.get(landMonth) || 0) + landStampDuty);
  }
  if (otherAcqCosts > 0 && otherAcqMonth) {
    m.set(otherAcqMonth, (m.get(otherAcqMonth) || 0) + otherAcqCosts);
  }
  return m;
}

function dayCountFactor(ym, convention) {
  const d = daysInMonth(ym);
  if (convention === '30/360') return 30 / 360;
  if (convention === 'ACT/360') return d / 360;
  return d / 365; // ACT/365
}

function calcStampDutyNSW(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v === 0) return 0;
  if (v <= 14000) return v * 0.0125;
  if (v <= 31000) return 175 + (v - 14000) * 0.015;
  if (v <= 83000) return 430 + (v - 31000) * 0.0175;
  if (v <= 310000) return 1340 + (v - 83000) * 0.035;
  if (v <= 1033000) return 9438 + (v - 310000) * 0.045;
  return 42362 + (v - 1033000) * 0.055;
}

function computeCashflow(inputs) {
  const {
    startMonth, endMonth, annualRatePct, dayCount,
    capitalise,
    landValue, landDeposit, landLoan, landStampDuty, landMonth, otherAcqCosts, otherAcqMonth,
    conAmount, conStart, conEnd, allocation, sigma,
    vacancyPct, indexMonth, sdaIndexPct, rrcIndexPct, participants
  } = inputs;

  const months = monthsBetweenInclusive(startMonth, endMonth);
  const land = buildLandDraws({ landLoan, landStampDuty, landMonth, otherAcqCosts, otherAcqMonth });
  const con = buildConstructionDraws(conAmount, conStart, conEnd, allocation, sigma);

  const rate = (Number(annualRatePct) || 0) / 100;
  const rows = [];
  let balance = 0;
  let totalDraws = 0;
  let totalInterest = 0;
  let totalIncome = 0;
  let peak = 0;

  const vFactor = Math.max(0, Math.min(100, vacancyPct || 0)) / 100;
  const idxMonth = Math.min(12, Math.max(1, Math.floor(indexMonth || 7)));
  const sdaIdx = Math.max(-100, Number(sdaIndexPct) || 0) / 100;
  const rrcIdx = Math.max(-100, Number(rrcIndexPct) || 0) / 100;

  const normalizedParticipants = (participants || []).map(p => {
    const startDate = p.start ? new Date(`${p.start}-01`) : null;
    const startYm = startDate && !isNaN(startDate) ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}` : null;
    const targetRaw = Number(p.target);
    const targetPct = Number.isFinite(targetRaw) ? targetRaw : 100;
    return {
      ...p,
      start: startYm,
      sda: Number(p.sda) || 0,
      rrc: Number(p.rrc) || 0,
      target: Math.max(0, Math.min(100, targetPct)) / 100,
      ramp: Math.max(0, Math.floor(p.ramp || 0))
    };
  });



  function participantIncome(p, ym) {
    if (!p.start || cmpYm(ym, p.start) < 0) return 0;
    const diff = monthsDiff(p.start, ym); // 0 at start month
    const target = p.target;
    const ramp = p.ramp;
    let occ;
    if (ramp <= 0) occ = target;
    else occ = Math.min(target, target * ((diff + 1) / ramp));
    // Annual step indexation on index month counted from scenario start
    const steps = indexSteps(startMonth, ym, idxMonth);
    const sdaVal = p.sda * Math.pow(1 + sdaIdx, steps);
    const rrcVal = p.rrc * Math.pow(1 + rrcIdx, steps);
    const gross = sdaVal + rrcVal;
    return gross * occ * (1 - vFactor);
  }

  for (const ym of months) {
    const draws = (land.get(ym) || 0) + (con.get(ym) || 0);
    const dcf = dayCountFactor(ym, dayCount);
    const interest = balance * rate * dcf;
    const income = normalizedParticipants.reduce((sum, p) => sum + participantIncome(p, ym), 0);
    // Apply income to reduce total balance once participants start
    const grossDelta = draws + (capitalise ? interest : 0) - income;
    const newBalance = Math.max(0, balance + grossDelta);
    rows.push({ ym, draws, interest, income, balance: newBalance });
    balance = newBalance;
    totalDraws += draws;
    if (capitalise) totalInterest += interest;
    totalIncome += income;
    peak = Math.max(peak, balance);
  }

  const totalDeposit = Math.max(0, Number(landDeposit) || 0);
  const totalStamp = Math.max(0, Number(landStampDuty) || 0);
  return { rows, totals: { totalDraws, totalInterest, totalIncome, totalDeposit, totalStampDuty: totalStamp, debtAtPC: balance, peakBalance: peak } };
}

function collectInputs() {
  const get = id => document.getElementById(id);
  return {
    startMonth: get('startMonth').value,
    endMonth: get('endMonth').value,
    annualRatePct: parseFloat(get('annualRate').value),
    dayCount: get('dayCount').value,
    capitalise: get('capitalise').checked,

    landValue: parseFloat(get('landValue').value) || 0,
    landDeposit: parseFloat(get('landDeposit').value) || 0,
    landLoan: parseFloat(get('landLoan').value) || 0,
    landStampDuty: parseFloat(get('landStampDuty').value) || 0,
    landMonth: get('landMonth').value,
    otherAcqCosts: parseFloat(get('otherAcqCosts').value) || 0,
    otherAcqMonth: get('otherAcqMonth').value,

    conAmount: parseFloat(get('conAmount').value) || 0,
    conStart: get('conStart').value,
    conEnd: get('conEnd').value,
    allocation: get('allocation').value,
    sigma: parseFloat(get('sigma').value) || 0,

    vacancyPct: parseFloat(get('vacancyPct').value) || 0,
    indexMonth: parseInt(get('indexMonth').value, 10) || 7,
    sdaIndexPct: parseFloat(get('sdaIndexPct').value) || 0,
    rrcIndexPct: parseFloat(get('rrcIndexPct').value) || 0,
    participants: collectParticipants()
  };
}

function validate(i) {
  const errors = [];
  if (!i.startMonth) errors.push('Start Month is required');
  if (!i.endMonth) errors.push('End Month is required');
  if (i.endMonth && i.startMonth && i.endMonth < i.startMonth) errors.push('End must be after Start');
  if (i.conAmount > 0 && (!i.conStart || !i.conEnd)) errors.push('Construction start/end are required when amount > 0');
  if (i.conStart && i.conEnd && i.conEnd < i.conStart) errors.push('Build End must be after Build Start');
  if (i.landValue > 0 && !i.landMonth) errors.push('Land settlement month required when land value > 0');
  if (i.landDeposit < 0) errors.push('Deposit cannot be negative');
  if (i.landDeposit > i.landValue) errors.push('Deposit cannot exceed land value');
  if (i.otherAcqCosts > 0 && !i.otherAcqMonth) errors.push('Other acquisition costs month required when amount > 0');
  if (i.vacancyPct < 0 || i.vacancyPct > 100) errors.push('Vacancy must be 0–100%');
  if (i.indexMonth < 1 || i.indexMonth > 12) errors.push('Index Month must be 1–12');
  for (const p of i.participants) {
    const gross = (Number(p.sda) || 0) + (Number(p.rrc) || 0);
    if (gross > 0 && !p.start) { errors.push(`Participant ${p.label || ''}: Start Month required`); break; }
    if (p.target < 0 || p.target > 100) { errors.push(`Participant ${p.label || ''}: Target occupancy must be 0–100%`); break; }
  }
  return errors;
}

function render({ rows, totals }) {
  const tbody = document.querySelector('#results tbody');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    const tds = [r.ym, fmt(r.draws), fmt(r.interest), fmt(r.income), fmt(r.balance)];
    for (const v of tds) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  document.getElementById('kpiDraws').textContent = `$${fmt(totals.totalDraws)}`;
  document.getElementById('kpiInterest').textContent = `$${fmt(totals.totalInterest)}`;
  document.getElementById('kpiDebt').textContent = `$${fmt(totals.debtAtPC)}`;
  document.getElementById('kpiPeak').textContent = `$${fmt(totals.peakBalance)}`;
  // Add/Update a simple Total Income KPI if present in DOM; if not, append below Summary
  let incomeEl = document.getElementById('kpiIncome');
  if (!incomeEl) {
    const summary = document.querySelector('.summary-grid');
    const box = document.createElement('div');
    box.innerHTML = '<div class="kpi-label">Total Income</div><div class="kpi-value" id="kpiIncome">–</div>';
    summary.appendChild(box);
    incomeEl = box.querySelector('#kpiIncome');
  }
  incomeEl.textContent = `$${fmt(totals.totalIncome)}`;
  let depositEl = document.getElementById('kpiDeposit');
  if (!depositEl) {
    const summary = document.querySelector('.summary-grid');
    const box = document.createElement('div');
    box.innerHTML = '<div class="kpi-label">Deposit Paid</div><div class="kpi-value" id="kpiDeposit">–</div>';
    summary.appendChild(box);
    depositEl = box.querySelector('#kpiDeposit');
  }
  depositEl.textContent = `$${fmt(totals.totalDeposit)}`;
  let stampEl = document.getElementById('kpiStamp');
  if (!stampEl) {
    const summary = document.querySelector('.summary-grid');
    const box = document.createElement('div');
    box.innerHTML = '<div class="kpi-label">Stamp Duty</div><div class="kpi-value" id="kpiStamp">–</div>';
    summary.appendChild(box);
    stampEl = box.querySelector('#kpiStamp');
  }
  stampEl.textContent = `$${fmt(totals.totalStampDuty)}`;
}

function onCalc() {
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';
  const i = collectInputs();
  const errs = validate(i);
  if (errs.length) {
    errorEl.textContent = errs[0];
    return;
  }
  const out = computeCashflow(i);

  // Hint if income is zero while participants have positive gross amounts
  const hasPositive = (i.participants || []).some(p => ((Number(p.sda) || 0) + (Number(p.rrc) || 0)) > 0);
  if (hasPositive && (out.totals.totalIncome === 0)) {
    errorEl.textContent = 'Income is 0 — check participant Start Month within scenario range and Vacancy/Target settings.';
  }
  render(out);
  // Render Asset tracker
  const assetSeries = computeAssetSeries(i);
  renderAsset(assetSeries);
  lastSnapshot = { inputs: i, cashflow: out, assetSeries, generatedAt: new Date().toISOString() };
}

function onAllocChange() {
  const show = document.getElementById('allocation').value === 's_curve';
  document.getElementById('sigmaRow').style.display = show ? 'flex' : 'none';
}

document.getElementById('allocation').addEventListener('change', onAllocChange);
document.getElementById('calcBtn').addEventListener('click', onCalc);
document.getElementById('exportBtn').addEventListener('click', onExport);

// Set sensible defaults for months (today..+18m, build in first 12m)
(function initDefaults() {
  const today = new Date();
  function ym(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 18, 1);
  const bStart = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const bEnd = new Date(today.getFullYear(), today.getMonth() + 13, 1);
  document.getElementById('startMonth').value = ym(start);
  document.getElementById('endMonth').value = ym(end);
  const settlementYm = ym(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  document.getElementById('landMonth').value = settlementYm;
  const otherMonthInput = document.getElementById('otherAcqMonth');
  if (otherMonthInput) otherMonthInput.value = settlementYm;
  document.getElementById('conStart').value = ym(bStart);
  document.getElementById('conEnd').value = ym(bEnd);
  onAllocChange();
  updateLandFinance();
  const assetBaseInput = document.getElementById('assetBaseValue');
  assetBaseInput.dataset.userEdited = 'false';
  updateAssetBaseEstimate();
  document.getElementById('assetStartMonth').value = ym(bEnd);
})();

// Participants dynamic UI
function addParticipantRow(p = {}) {
  const container = document.getElementById('participants');
  const row = document.createElement('div');
  row.className = 'participant-row';
  row.innerHTML = `
    <input type="text" class="p-label" placeholder="P${container.children.length + 1}" value="${p.label || ''}">
    <input type="month" class="p-start" value="${p.start || ''}">
    <input type="number" class="p-sda" step="0.01" value="${p.sda || 0}">
    <input type="number" class="p-rrc" step="0.01" value="${p.rrc || 0}">
    <input type="number" class="p-ramp" step="1" value="${p.ramp != null ? p.ramp : 6}">
    <input type="number" class="p-target" step="1" value="${p.target != null ? p.target : 100}">
    <button type="button" class="p-remove">×</button>
  `;
  row.querySelector('.p-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectParticipants() {
  const rows = Array.from(document.querySelectorAll('#participants .participant-row'));
  return rows.map((row, i) => ({
    label: row.querySelector('.p-label').value || `P${i + 1}`,
    start: row.querySelector('.p-start').value,
    sda: parseFloat(row.querySelector('.p-sda').value) || 0,
    rrc: parseFloat(row.querySelector('.p-rrc').value) || 0,
    ramp: parseInt(row.querySelector('.p-ramp').value, 10) || 0,
    target: parseFloat(row.querySelector('.p-target').value) || 0,
  }));
}

document.getElementById('addParticipant').addEventListener('click', () => addParticipantRow());

// Seed with one example row for convenience (blank values)
addParticipantRow({});

// Indexation step counter: number of index boundaries (indexMonth) from scenario start to current month (inclusive)
function indexSteps(scenarioStart, ym, indexMonth) {
  const [sy, sm] = scenarioStart.split('-').map(Number);
  const [yy, mm] = ym.split('-').map(Number);
  const firstYear = indexMonth >= sm ? sy : sy + 1;
  if (yy < firstYear) return 0;
  if (yy === firstYear && mm < indexMonth) return 0;
  let steps = yy - firstYear + 1;
  if (mm < indexMonth) steps -= 1;
  return Math.max(0, steps);
}

// Asset calculations
function collectAssetInputs(base) {
  const get = id => document.getElementById(id);
  const assetBase = parseFloat(get('assetBaseValue').value) || 0;
  const assetStart = get('assetStartMonth').value || base.conEnd || base.startMonth;
  const assetIdxMonth = parseInt(get('assetIndexMonth').value, 10) || 7;
  const assetGrowth = parseFloat(get('assetGrowthPct').value) || 0;
  return { assetBase, assetStart, assetIdxMonth, assetGrowth };
}

function computeAssetSeries(inputs) {
  const { startMonth, endMonth } = inputs;
  const { assetBase, assetStart, assetIdxMonth, assetGrowth } = collectAssetInputs(inputs);
  const series = [];
  if (!assetStart || !startMonth || !endMonth) return series;
  // Add start value
  series.push({ label: 'Start', ym: assetStart, value: assetBase });
  // Annual index points at each indexMonth between assetStart and endMonth
  const [sy, sm] = assetStart.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  for (let y = sy; y <= ey; y++) {
    const ym = `${y}-${String(assetIdxMonth).padStart(2,'0')}`;
    if (cmpYm(ym, assetStart) >= 0 && cmpYm(ym, endMonth) <= 0) {
      const steps = indexSteps(assetStart, ym, assetIdxMonth);
      const val = assetBase * Math.pow(1 + (assetGrowth/100), steps);
      series.push({ label: String(y), ym, value: val });
    }
  }
  // Ensure an end value row if last boundary < endMonth
  const last = series[series.length - 1];
  if (!last || cmpYm(last.ym, endMonth) !== 0) {
    const stepsEnd = indexSteps(assetStart, endMonth, assetIdxMonth);
    const valEnd = assetBase * Math.pow(1 + (assetGrowth/100), stepsEnd);
    series.push({ label: 'End', ym: endMonth, value: valEnd });
  }
  return series;
}

function renderAsset(series) {
  const tbody = document.querySelector('#assetTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const r of series) {
    const tr = document.createElement('tr');
    const tds = [r.label, r.ym, `$${fmt(r.value)}`];
    for (const v of tds) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// Sidebar menu: show/hide groups
function setGroup(id, show) {
  const el = document.getElementById(`group-${id}`);
  if (!el) return;
  el.classList.toggle('hidden', !show);
  const btn = document.querySelector(`.menu-item[data-target="${id}"]`);
  if (btn) btn.classList.toggle('active', show);
}

function showAll(show) {
  ['variables','asset','cashflow'].forEach(k => setGroup(k, show));
}

document.getElementById('expandAll').addEventListener('click', () => showAll(true));
document.getElementById('collapseAll').addEventListener('click', () => showAll(false));
document.querySelectorAll('.menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-target');
    const el = document.getElementById(`group-${id}`);
    const nowHidden = el?.classList.contains('hidden');
    setGroup(id, nowHidden);
  });
});

// Land finance derived fields
function updateLandFinance() {
  const landValueEl = document.getElementById('landValue');
  const depositEl = document.getElementById('landDeposit');
  const loanEl = document.getElementById('landLoan');
  const stampEl = document.getElementById('landStampDuty');
  if (!landValueEl || !depositEl || !loanEl || !stampEl) return;
  const landValue = parseFloat(landValueEl.value) || 0;
  const rawDeposit = parseFloat(depositEl.value);
  let deposit = Number.isFinite(rawDeposit) ? rawDeposit : 0;
  if (deposit < 0) deposit = 0;
  if (deposit > landValue) deposit = landValue;
  const loan = Math.max(0, landValue - deposit);
  const stamp = calcStampDutyNSW(landValue);
  if (deposit !== rawDeposit) {
    depositEl.value = deposit.toFixed(2);
  }
  loanEl.value = loan.toFixed(2);
  stampEl.value = stamp.toFixed(2);
  updateAssetBaseEstimate();
}

function updateAssetBaseEstimate() {
  const assetInput = document.getElementById('assetBaseValue');
  if (!assetInput || assetInput.dataset.userEdited === 'true') return;
  const landValue = parseFloat(document.getElementById('landValue').value) || 0;
  const stamp = parseFloat(document.getElementById('landStampDuty').value) || 0;
  const otherAcq = parseFloat(document.getElementById('otherAcqCosts').value) || 0;
  const con = parseFloat(document.getElementById('conAmount').value) || 0;
  const auto = landValue + stamp + otherAcq + con;
  assetInput.value = auto.toFixed(2);
}

['landValue','landDeposit'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateLandFinance);
});
['conAmount','otherAcqCosts','landStampDuty'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateAssetBaseEstimate);
});
const assetBaseInputEl = document.getElementById('assetBaseValue');
if (assetBaseInputEl) {
  assetBaseInputEl.addEventListener('input', () => {
    assetBaseInputEl.dataset.userEdited = 'true';
  });
}

function csvValue(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2);
}

function buildExportCsv(snapshot) {
  if (!snapshot) return '';
  const { inputs, cashflow, assetSeries, generatedAt } = snapshot;
  const lines = [];
  lines.push('SDA Modeler Export');
  lines.push(`Generated,${generatedAt || new Date().toISOString()}`);
  lines.push('');
  lines.push('Scenario');
  lines.push(['Start Month', inputs.startMonth || ''].map(csvValue).join(','));
  lines.push(['End Month', inputs.endMonth || ''].map(csvValue).join(','));
  lines.push(['Annual Rate (%)', fmtNumber(inputs.annualRatePct || 0)].map(csvValue).join(','));
  lines.push(['Day Count', inputs.dayCount || ''].map(csvValue).join(','));
  lines.push(['Capitalise Interest', inputs.capitalise ? 'Yes' : 'No'].map(csvValue).join(','));
  lines.push('');
  lines.push('Budget');
  lines.push(['Land Value ($)', fmtNumber(inputs.landValue || 0)].map(csvValue).join(','));
  lines.push(['Deposit ($)', fmtNumber(inputs.landDeposit || 0)].map(csvValue).join(','));
  lines.push(['Loan Amount ($)', fmtNumber(inputs.landLoan || 0)].map(csvValue).join(','));
  lines.push(['Settlement Month', inputs.landMonth || ''].map(csvValue).join(','));
  lines.push(['Stamp Duty ($)', fmtNumber(inputs.landStampDuty || 0)].map(csvValue).join(','));
  lines.push(['Other Acquisition Costs ($)', fmtNumber(inputs.otherAcqCosts || 0)].map(csvValue).join(','));
  lines.push(['Other Costs Month', inputs.otherAcqMonth || ''].map(csvValue).join(','));
  lines.push(['Construction Budget ($)', fmtNumber(inputs.conAmount || 0)].map(csvValue).join(','));
  lines.push(['Build Start', inputs.conStart || ''].map(csvValue).join(','));
  lines.push(['Build End', inputs.conEnd || ''].map(csvValue).join(','));
  lines.push(['Allocation', inputs.allocation || ''].map(csvValue).join(','));
  lines.push(['S-curve Sigma', fmtNumber(inputs.sigma || 0)].map(csvValue).join(','));
  lines.push('');
  lines.push('Income Settings');
  lines.push(['Vacancy Factor (%)', fmtNumber(inputs.vacancyPct || 0)].map(csvValue).join(','));
  lines.push(['Index Month', inputs.indexMonth || ''].map(csvValue).join(','));
  lines.push(['SDA Annual Index (%)', fmtNumber(inputs.sdaIndexPct || 0)].map(csvValue).join(','));
  lines.push(['RRC Annual Index (%)', fmtNumber(inputs.rrcIndexPct || 0)].map(csvValue).join(','));
  lines.push('');
  lines.push('Participants');
  lines.push(['Label', 'Start Month', 'SDA / month ($)', 'RRC / month ($)', 'Ramp (months)', 'Target Occ. (%)'].map(csvValue).join(','));
  (inputs.participants || []).forEach(p => {
    lines.push([
      p.label || '',
      p.start || '',
      fmtNumber(p.sda || 0),
      fmtNumber(p.rrc || 0),
      p.ramp != null ? p.ramp : '',
      p.target != null ? p.target : ''
    ].map(csvValue).join(','));
  });
  lines.push('');
  lines.push('Totals');
  const totals = cashflow?.totals || {};
  lines.push(['Total Draws ($)', fmtNumber(totals.totalDraws || 0)].map(csvValue).join(','));
  lines.push(['Capitalised Interest ($)', fmtNumber(totals.totalInterest || 0)].map(csvValue).join(','));
  lines.push(['Total Income ($)', fmtNumber(totals.totalIncome || 0)].map(csvValue).join(','));
  lines.push(['Deposit Paid ($)', fmtNumber(totals.totalDeposit || 0)].map(csvValue).join(','));
  lines.push(['Stamp Duty ($)', fmtNumber(totals.totalStampDuty || 0)].map(csvValue).join(','));
  lines.push(['Debt at Practical Completion ($)', fmtNumber(totals.debtAtPC || 0)].map(csvValue).join(','));
  lines.push(['Peak Balance ($)', fmtNumber(totals.peakBalance || 0)].map(csvValue).join(','));
  lines.push('');
  lines.push('Monthly Cashflow');
  lines.push(['Month', 'Draws ($)', 'Interest ($)', 'Income ($)', 'Balance ($)'].map(csvValue).join(','));
  (cashflow?.rows || []).forEach(r => {
    lines.push([
      r.ym || '',
      fmtNumber(r.draws || 0),
      fmtNumber(r.interest || 0),
      fmtNumber(r.income || 0),
      fmtNumber(r.balance || 0)
    ].map(csvValue).join(','));
  });
  lines.push('');
  lines.push('Asset Tracker');
  lines.push(['Label', 'Month', 'Asset Value ($)'].map(csvValue).join(','));
  (assetSeries || []).forEach(r => {
    lines.push([
      r.label || '',
      r.ym || '',
      fmtNumber(r.value || 0)
    ].map(csvValue).join(','));
  });
  return lines.join('\r\n');
}

function onExport() {
  const errorEl = document.getElementById('error');
  if (!lastSnapshot) {
    if (errorEl) errorEl.textContent = 'Calculate results before exporting.';
    return;
  }
  if (errorEl) errorEl.textContent = '';
  const csv = buildExportCsv(lastSnapshot);
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const start = lastSnapshot.inputs?.startMonth || 'export';
  a.href = url;
  a.download = `sda-modeler-${start}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
