const API = '';

// ─── Utility ──────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}/api${path}`, opts);
  return res.json();
}

function $(id) { return document.getElementById(id); }
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }
function fmtJSON(obj) { return syntaxHighlight(JSON.stringify(obj, null, 2)); }

function syntaxHighlight(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
    let cls = 'num';
    if (/^"/.test(match)) { cls = /:$/.test(match) ? 'key' : 'str'; }
    else if (/true|false/.test(match)) { cls = 'bool'; }
    return `<span class="${cls}">${match}</span>`;
  });
}

function statusClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'APPROVED') return 'status-approved';
  if (s === 'DECLINED') return 'status-declined';
  if (s === 'PENDING') return 'status-pending';
  if (s === 'TIMEOUT') return 'status-timeout';
  if (s === 'ERROR') return 'status-error';
  if (s === 'PARTIAL') return 'status-partial';
  return '';
}

// ─── Tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ─── Role Toggle ──────────────────────────────────────────────
function setRole(type, role) {
  const acqBtn = $(type + 'RoleAcq');
  const issBtn = $(type + 'RoleIss');
  const acqForm = $(type + 'AcqForm');
  const issForm = $(type + 'IssForm');
  if (role === 'acquirer') {
    acqBtn.classList.add('active'); issBtn.classList.remove('active');
    show(acqForm); hide(issForm);
  } else {
    issBtn.classList.add('active'); acqBtn.classList.remove('active');
    hide(acqForm); show(issForm);
  }
}

// ─── QR Generator ─────────────────────────────────────────────
async function generateQR() {
  const mode = $('genMode').value;
  const body = {
    merchantPan: $('genPan').value || '9360000100000001',
    merchantId: $('genMerchId').value || '1234567890123',
    merchantName: $('genName').value || 'MERCHANT',
    merchantCity: $('genCity').value || 'JAKARTA',
    transactionAmount: parseFloat($('genAmount').value) || null,
    currency: $('genCurrency').value,
    countryCode: $('genCountry').value || 'ID',
    terminalId: $('genTerminal').value,
    merchantCriteria: $('genCriteria').value,
    // CPM specific
    consumerPan: $('genPan').value || '9360001000000001',
    consumerName: $('genName').value || 'CONSUMER',
    consumerCity: $('genCity').value || 'JAKARTA',
  };

  const endpoint = mode === 'mpm' ? '/qris/generate/mpm' : '/qris/generate/cpm';
  const result = await api('POST', endpoint, body);
  const el = $('genResult');
  show(el);
  if (result.success) {
    el.innerHTML = `
      <h3 style="color:var(--primary);margin-bottom:12px">Generated ${mode.toUpperCase()} QR</h3>
      <div class="qr-string">${result.qrisString}</div>
      <h4 style="margin-top:16px;color:var(--muted)">Parsed Structure</h4>
      <pre>${fmtJSON(result.parsed)}</pre>`;
  } else {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
  }
}

// ─── QR Parser ────────────────────────────────────────────────
async function parseQR() {
  const qrisString = $('parseInput').value.trim();
  if (!qrisString) return alert('Enter QRIS string');
  const result = await api('POST', '/qris/parse', { qrisString });
  const el = $('parseResult');
  show(el);
  if (result.success) {
    const p = result.parsed;
    el.innerHTML = `
      <h3 style="margin-bottom:12px">Parsed Result — Mode: <span style="color:var(--warning)">${p.mode}</span> — CRC: <span class="${p.valid ? 'status-approved' : 'status-declined'}">${p.valid ? 'VALID' : 'INVALID'}</span></h3>
      <pre>${fmtJSON(p)}</pre>`;
  } else {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
  }
}

async function loadSampleMPM() {
  const r = await api('GET', '/qris/mock/tlv-samples');
  if (r.success) $('parseInput').value = r.mpmStatic;
}
async function loadSampleCPM() {
  const r = await api('GET', '/qris/mock/tlv-samples');
  if (r.success) $('parseInput').value = r.cpm;
}

// ─── ISO8583 Builder ──────────────────────────────────────────
async function buildISO() {
  const mti = $('isoMti').value;
  const isResponse = ['0210','0230','0410','0510','0810'].includes(mti);
  const fields = {};
  const pan = $('isoPAN').value;
  const procCode = $('isoProcCode').value;
  const amount = parseFloat($('isoAmount').value) || 0;
  const stan = $('isoSTAN').value;
  const rrn = $('isoRRN').value;
  const terminal = $('isoTerminal').value;
  const merchId = $('isoMerchId').value;
  const currency = $('isoCurrency').value;
  const actionCode = $('isoActionCode').value;

  if (pan) fields[2] = pan;
  fields[3] = procCode;
  fields[4] = (amount * 100).toFixed(0).padStart(12, '0');
  const now = new Date();
  fields[7] = now.getFullYear().toString().slice(-2) + (now.getMonth()+1).toString().padStart(2,'0') + now.getDate().toString().padStart(2,'0') + now.getHours().toString().padStart(2,'0') + now.getMinutes().toString().padStart(2,'0') + now.getSeconds().toString().padStart(2,'0');
  fields[11] = stan;
  fields[12] = now.getHours().toString().padStart(2,'0') + now.getMinutes().toString().padStart(2,'0') + now.getSeconds().toString().padStart(2,'0');
  fields[13] = (now.getMonth()+1).toString().padStart(2,'0') + now.getDate().toString().padStart(2,'0');
  fields[22] = '022';
  fields[25] = '00';
  fields[32] = '0001';
  fields[37] = rrn;
  fields[41] = terminal;
  fields[42] = merchId.padEnd(15, ' ');
  fields[49] = currency;
  if (isResponse) fields[39] = actionCode;

  const result = await api('POST', '/iso8583/build', { mti, fields });
  const el = $('isoResult');
  show(el);
  if (result.success) {
    el.innerHTML = `
      <h3 style="margin-bottom:12px">Built ISO8583 — MTI: <span style="color:var(--warning)">${mti}</span></h3>
      <div class="qr-string">${result.raw}</div>
      <h4 style="margin-top:16px;color:var(--muted)">Field Breakdown</h4>
      <div class="table-wrap"><table>
        <tr><th>DE</th><th>Value</th></tr>
        ${Object.entries(result.fields).map(([k,v]) => `<tr><td class="iso-field">DE${k}</td><td class="iso-value">${v}</td></tr>`).join('')}
      </table></div>`;
  } else {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
  }
}

async function parseISO() {
  const raw = $('isoParseInput').value.trim();
  if (!raw) return alert('Enter raw ISO8583');
  const result = await api('POST', '/iso8583/parse', { raw });
  const el = $('isoResult');
  show(el);
  if (result.success) {
    const p = result.parsed;
    el.innerHTML = `
      <h3>Parsed ISO8583 — MTI: <span style="color:var(--warning)">${p.mti}</span></h3>
      <div class="table-wrap"><table>
        <tr><th>DE</th><th>Name</th><th>Value</th></tr>
        ${Object.entries(p.parsed).map(([k,v]) => `<tr><td class="iso-field">DE${k}</td><td>${v.name}</td><td class="iso-value">${v.value}</td></tr>`).join('')}
      </table></div>
      <pre>${fmtJSON(p)}</pre>`;
  } else {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
  }
}

// ─── TLV ↔ ISO Mapping ───────────────────────────────────────
async function mapTLVtoISO() {
  const qrisString = $('mapQris').value.trim();
  if (!qrisString) return alert('Enter QRIS string');
  const result = await api('POST', '/tlv/map-to-iso', { qrisString });
  showMapResult(result, 'TLV → ISO8583');
}

async function mapISOtoTLV() {
  const fields = { 2: '9360000100000001', 3: '260000', 4: '0000000025000', 49: '360', 41: 'TERM0001', 42: 'MERCHANT001' };
  const result = await api('POST', '/tlv/map-to-tlv', { fields });
  showMapResult(result, 'ISO8583 → TLV');
}

async function loadMappingRef() {
  const result = await api('GET', '/tlv/mapping-reference');
  showMapResult({ success: true, mapping: result }, 'Mapping Reference');
}

function showMapResult(result, title) {
  const el = $('mapResult');
  show(el);
  if (result.success) {
    el.innerHTML = `<h3 style="margin-bottom:12px">${title}</h3><pre>${fmtJSON(result.mapping || result)}</pre>`;
  } else {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
  }
}

// ─── MPM Transaction ──────────────────────────────────────────
async function generateMPMForTxn() {
  const r = await api('POST', '/qris/generate/mpm', {
    merchantPan: $('mpmPan').value || '9360000100000001',
    merchantId: '1234567890123',
    merchantName: 'WARUNG KOPI NUSANTARA',
    merchantCity: 'JAKARTA',
    transactionAmount: parseFloat($('mpmAmount').value) || 25000,
    currency: '360', countryCode: 'ID',
    terminalId: $('mpmTerminal').value || 'TERM0001',
  });
  if (r.success) $('mpmQris').value = r.qrisString;
}

async function submitMPM(role) {
  let body, endpoint;
  if (role === 'acquirer') {
    const qris = $('mpmQris').value.trim();
    if (!qris) return alert('Generate or enter QRIS string first');
    endpoint = '/transaction/mpm/acquirer';
    body = {
      qrisString: qris,
      amount: parseFloat($('mpmAmount').value) || 25000,
      scenario: $('mpmScenario').value,
      pan: $('mpmPan').value,
      terminalId: $('mpmTerminal').value,
      acquiringInstitution: $('mpmAcqInst').value,
    };
  } else {
    endpoint = '/transaction/mpm/issuer';
    body = {
      amount: parseFloat($('mpmIssAmount').value) || 25000,
      scenario: $('mpmIssScenario').value,
      rrn: $('mpmIssRRN').value,
      pan: $('mpmIssPan').value,
      currency: $('mpmIssCurrency').value || '360',
    };
  }
  const result = await api('POST', endpoint, body);
  showTxnResult('mpmResult', result);
}

// ─── CPM Transaction ──────────────────────────────────────────
async function generateCPMForTxn() {
  const r = await api('POST', '/qris/generate/cpm', {
    consumerPan: '9360001000000001',
    consumerName: 'AHMAD RIZKY',
    consumerCity: 'JAKARTA',
    token: 'TK00000001',
    cardExpiry: '2512',
    transactionAmount: parseFloat($('cpmAmount').value) || 50000,
    currency: '360', countryCode: 'ID',
  });
  if (r.success) $('cpmQris').value = r.qrisString;
}

async function submitCPM(role) {
  let body, endpoint;
  if (role === 'acquirer') {
    const qris = $('cpmQris').value.trim();
    if (!qris) return alert('Generate or enter QRIS string first');
    endpoint = '/transaction/cpm/acquirer';
    body = {
      qrisString: qris,
      amount: parseFloat($('cpmAmount').value) || 50000,
      scenario: $('cpmScenario').value,
      merchantId: $('cpmMerchId').value,
      terminalId: $('cpmTerminal').value,
    };
  } else {
    endpoint = '/transaction/cpm/issuer';
    body = {
      amount: parseFloat($('cpmIssAmount').value) || 50000,
      scenario: $('cpmIssScenario').value,
      rrn: $('cpmIssRRN').value,
      pan: $('cpmIssPan').value,
    };
  }
  const result = await api('POST', endpoint, body);
  showTxnResult('cpmResult', result);
}

// ─── Tuntas ───────────────────────────────────────────────────
async function submitTuntas() {
  const body = {
    amount: parseFloat($('tuntasAmount').value) || 25000,
    scenario: $('tuntasScenario').value,
    pan: $('tuntasPan').value,
    merchantId: $('tuntasMerchId').value,
    terminalId: $('tuntasTerminal').value,
    currency: $('tuntasCurrency').value || '360',
    fee: $('tuntasFee').value ? parseFloat($('tuntasFee').value) : undefined,
  };
  const result = await api('POST', '/transaction/tuntas', body);
  showTxnResult('tuntasResult', result, true);
}

// ─── Cross Border ─────────────────────────────────────────────
async function submitCrossBorder() {
  const body = {
    amount: parseFloat($('cbAmount').value) || 100,
    originCountry: $('cbOriginCountry').value,
    originCurrency: $('cbOriginCcy').value,
    settlementCurrency: $('cbSettleCcy').value || '360',
    exchangeRate: parseFloat($('cbRate').value) || 11500,
    scenario: $('cbScenario').value,
    merchantPan: '9360005000000001',
    merchantName: $('cbMerchName').value,
    merchantCity: $('cbMerchCity').value,
  };
  const result = await api('POST', '/transaction/cross-border', body);
  showTxnResult('cbResult', result);
}

// ─── Show Transaction Result ──────────────────────────────────
function showTxnResult(elId, result, isTuntas = false) {
  const el = $(elId);
  show(el);
  if (!result.success) {
    el.innerHTML = `<p class="status-declined">Error: ${result.error}</p>`;
    return;
  }
  const r = result.result;
  let html = `
    <div class="step-card">
      <div class="step-header">
        <span class="step-name">${r.type} — <span class="${statusClass(r.status)}">${r.status}</span></span>
        <span style="color:var(--muted)">RRN: ${r.rrn} | STAN: ${r.stan}</span>
      </div>
      <p style="color:var(--muted);font-size:0.85rem">${r.actionCodeDescription} (Action Code: ${r.actionCode})</p>
    </div>`;

  if (isTuntas && r.steps) {
    r.steps.forEach((step, i) => {
      html += `<div class="step-card">
        <div class="step-header">
          <span class="step-name">Step ${i+1}: ${step.step}</span>
          ${step.mti ? `<span class="step-mti">${step.mti}</span>` : ''}
        </div>
        <p style="color:var(--muted);font-size:0.85rem;margin-bottom:8px">${step.description || ''}</p>`;
      if (step.request)  html += `<h4 style="color:var(--muted);font-size:0.8rem">Request</h4><pre>${step.request.raw || fmtJSON(step.request)}</pre>`;
      if (step.response) html += `<h4 style="color:var(--muted);font-size:0.8rem">Response</h4><pre>${step.response.raw || fmtJSON(step.response)}</pre>`;
      if (step.settlementAmount) html += `<p>Settlement: ${step.settlementAmount} ${step.settlementCurrency} | Fee: ${step.fee} | Net: ${step.netAmount}</p>`;
      html += `</div>`;
    });
  } else {
    if (r.isoRequest) {
      html += `<div class="step-card">
        <div class="step-header"><span class="step-name">ISO Request</span><span class="step-mti">${r.isoRequest.mti}</span></div>
        <pre>${r.isoRequest.raw}</pre>
        <details><summary style="color:var(--muted);cursor:pointer">Fields</summary><pre>${fmtJSON(r.isoRequest.fields)}</pre></details>
      </div>`;
    }
    if (r.isoResponse) {
      html += `<div class="step-card">
        <div class="step-header"><span class="step-name">ISO Response</span><span class="step-mti">${r.isoResponse.mti}</span></div>
        <pre>${r.isoResponse.raw}</pre>
        <details><summary style="color:var(--muted);cursor:pointer">Fields</summary><pre>${fmtJSON(r.isoResponse.fields)}</pre></details>
      </div>`;
    }
    if (r.crossBorder) {
      html += `<div class="step-card">
        <span class="step-name">Cross Border Details</span>
        <pre>${fmtJSON(r.crossBorder)}</pre>
      </div>`;
    }
    if (r.parsedQRIS) {
      html += `<details><summary style="color:var(--muted);cursor:pointer">Parsed QRIS</summary><pre>${fmtJSON(r.parsedQRIS)}</pre></details>`;
    }
  }

  html += `<details><summary style="color:var(--muted);cursor:pointer;margin-top:12px">Full Raw Result</summary><pre>${fmtJSON(r)}</pre></details>`;
  el.innerHTML = html;
}

// ─── Transaction Log ──────────────────────────────────────────
async function refreshLog() {
  const result = await api('GET', '/transaction/log?limit=50');
  const el = $('logContent');
  if (result.success && result.result.length > 0) {
    let html = `<div class="table-wrap"><table>
      <tr><th>Time</th><th>Type</th><th>RRN</th><th>Status</th><th>Action Code</th><th>Scenario</th></tr>`;
    result.result.forEach(txn => {
      html += `<tr>
        <td style="font-size:0.8rem;color:var(--muted)">${(txn.timestamp||'').substring(11,19)}</td>
        <td>${txn.type}</td>
        <td style="font-family:var(--mono);font-size:0.82rem">${txn.rrn}</td>
        <td class="${statusClass(txn.status)}">${txn.status}</td>
        <td style="font-family:var(--mono)">${txn.actionCode}</td>
        <td>${txn.scenario}</td>
      </tr>`;
    });
    html += '</table></div>';
    el.innerHTML = html;
  } else {
    el.innerHTML = '<p class="muted">No transactions yet</p>';
  }
}

async function clearLog() {
  if (!confirm('Clear all transaction data?')) return;
  await api('DELETE', '/transaction/clear');
  refreshLog();
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  try {
    const health = await api('GET', '/health');
    const badge = $('redisStatus');
    if (health.redis === 'CONNECTED') {
      badge.textContent = 'Redis Connected';
      badge.classList.remove('danger');
    } else {
      badge.textContent = 'In-Memory Mode';
      badge.classList.add('danger');
    }
  } catch {
    $('redisStatus').textContent = 'Offline';
    $('redisStatus').classList.add('danger');
  }
  refreshLog();
}

init();
