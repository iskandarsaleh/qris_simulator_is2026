const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe('QRIS Simulator - API Tests', () => {

  // ─── Health Check ────────────────────────────────────────
  test('GET /api/health returns OK', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(body.version).toBe('1.0.0');
  });

  // ─── QRIS Generate MPM ──────────────────────────────────
  test('POST /api/qris/generate/mpm - generates valid MPM QR', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'TEST MERCHANT',
        merchantCity: 'JAKARTA',
        transactionAmount: 25000,
        currency: '360',
        countryCode: 'ID',
        terminalId: 'TERM0001',
        merchantCriteria: 'U',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.qrisString).toBeDefined();
    expect(body.qrisString).toContain('000201');
    expect(body.parsed).toBeDefined();
    expect(body.parsed.mode).toBe('MPM');
    expect(body.parsed.valid).toBe(true);
  });

  // ─── QRIS Generate CPM ──────────────────────────────────
  test('POST /api/qris/generate/cpm - generates valid CPM QR', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/qris/generate/cpm`, {
      data: {
        consumerPan: '9360001000000001',
        consumerName: 'AHMAD RIZKY',
        consumerCity: 'JAKARTA',
        transactionAmount: 50000,
        currency: '360',
        countryCode: 'ID',
        token: 'TK00000001',
        cardExpiry: '2512',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.parsed.mode).toBe('CPM');
    expect(body.parsed.valid).toBe(true);
  });

  // ─── QRIS Parse ─────────────────────────────────────────
  test('POST /api/qris/parse - parses QRIS string', async ({ request }) => {
    // First generate
    const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'PARSE TEST',
        merchantCity: 'BANDUNG',
        transactionAmount: 15000,
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    // Then parse
    const res = await request.post(`${BASE_URL}/api/qris/parse`, {
      data: { qrisString: genBody.qrisString },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.parsed.valid).toBe(true);
    expect(body.parsed.tags['00']).toBe('01');
  });

  // ─── QRIS Validate ──────────────────────────────────────
  test('POST /api/qris/validate - validates CRC', async ({ request }) => {
    const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'VALIDATE TEST',
        merchantCity: 'JAKARTA',
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    const res = await request.post(`${BASE_URL}/api/qris/validate`, {
      data: { qrisString: genBody.qrisString },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.valid).toBe(true);
  });

  // ─── TLV Encode/Decode ──────────────────────────────────
  test('POST /api/tlv/encode - encodes TLV', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/tlv/encode`, {
      data: { tag: '00', value: '01' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.encoded).toBe('000201');
  });

  test('POST /api/tlv/decode - decodes TLV', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/tlv/decode`, {
      data: { tlvString: '000201010211' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.decoded).toHaveLength(2);
    expect(body.decoded[0].tag).toBe('00');
    expect(body.decoded[0].value).toBe('01');
    expect(body.decoded[1].tag).toBe('01');
    expect(body.decoded[1].value).toBe('11');
  });

  test('POST /api/tlv/build - builds from tag array', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/tlv/build`, {
      data: { tags: [{ tag: '00', value: '01' }, { tag: '01', value: '12' }] },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.tlvString).toBe('000201010212');
  });

  // ─── ISO8583 Build/Parse ────────────────────────────────
  test('POST /api/iso8583/build - builds ISO8583 message', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/iso8583/build`, {
      data: {
        mti: '0200',
        fields: {
          2: '9360000100000001',
          3: '260000',
          4: '0000000025000',
          7: '231215143000',
          11: '000001',
          49: '360',
        },
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.raw).toBeDefined();
    expect(body.raw).toContain('0200');
  });

  test('POST /api/iso8583/parse - parses ISO8583 message', async ({ request }) => {
    // Build first
    const buildRes = await request.post(`${BASE_URL}/api/iso8583/build`, {
      data: {
        mti: '0200',
        fields: { 2: '9360000100000001', 3: '260000', 4: '0000000025000', 7: '231215143000', 11: '000001', 49: '360' },
      },
    });
    const built = await buildRes.json();

    const res = await request.post(`${BASE_URL}/api/iso8583/parse`, {
      data: { raw: built.raw },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.parsed.mti).toBe('0200');
    expect(body.parsed.fields[2]).toBe('9360000100000001');
    expect(body.parsed.fields[3]).toBe('260000');
  });

  // ─── TLV ↔ ISO Mapping ─────────────────────────────────
  test('POST /api/tlv/map-to-iso - maps TLV to ISO8583', async ({ request }) => {
    const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'MAP TEST',
        merchantCity: 'JAKARTA',
        transactionAmount: 25000,
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    const res = await request.post(`${BASE_URL}/api/tlv/map-to-iso`, {
      data: { qrisString: genBody.qrisString },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.mapping.isoFields).toBeDefined();
    expect(body.mapping.details.length).toBeGreaterThan(0);
  });

  // ─── MPM Acquirer Transaction ───────────────────────────
  test('POST /api/transaction/mpm/acquirer - success scenario', async ({ request }) => {
    const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'MPM ACQ TEST',
        merchantCity: 'JAKARTA',
        transactionAmount: 25000,
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    const res = await request.post(`${BASE_URL}/api/transaction/mpm/acquirer`, {
      data: {
        qrisString: genBody.qrisString,
        amount: 25000,
        scenario: 'success',
        pan: '9360000100000001',
        terminalId: 'TERM0001',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.status).toBe('APPROVED');
    expect(body.result.actionCode).toBe('00');
    expect(body.result.rrn).toBeDefined();
    expect(body.result.isoRequest).toBeDefined();
    expect(body.result.isoResponse).toBeDefined();
  });

  // ─── MPM Issuer Transaction ─────────────────────────────
  test('POST /api/transaction/mpm/issuer - declined scenario', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/transaction/mpm/issuer`, {
      data: {
        amount: 25000,
        scenario: 'insufficient',
        pan: '9360000100000001',
        currency: '360',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.result.status).toBe('DECLINED');
    expect(body.result.actionCode).toBe('51');
  });

  // ─── CPM Acquirer Transaction ───────────────────────────
  test('POST /api/transaction/cpm/acquirer - success', async ({ request }) => {
    const gen = await request.post(`${BASE_URL}/api/qris/generate/cpm`, {
      data: {
        consumerPan: '9360001000000001',
        consumerName: 'CPM TEST',
        consumerCity: 'JAKARTA',
        transactionAmount: 50000,
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    const res = await request.post(`${BASE_URL}/api/transaction/cpm/acquirer`, {
      data: {
        qrisString: genBody.qrisString,
        amount: 50000,
        scenario: 'success',
        terminalId: 'TERM0001',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.result.status).toBe('APPROVED');
  });

  // ─── All Scenarios ──────────────────────────────────────
  const scenarios = ['success', 'pending', 'failed', 'insufficient', 'timeout', 'suspected_fraud', 'system_error', 'duplicate', 'not_permitted'];

  for (const scenario of scenarios) {
    test(`MPM Acquirer scenario: ${scenario}`, async ({ request }) => {
      const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
        data: {
          merchantPan: '9360000100000001',
          merchantId: '1234567890123',
          merchantName: 'SCENARIO TEST',
          merchantCity: 'JAKARTA',
          transactionAmount: 25000,
          currency: '360',
          countryCode: 'ID',
        },
      });
      const genBody = await gen.json();

      const res = await request.post(`${BASE_URL}/api/transaction/mpm/acquirer`, {
        data: { qrisString: genBody.qrisString, amount: 25000, scenario },
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.result.scenario).toBe(scenario.toUpperCase().replace(/_/g, '_'));
    });
  }

  // ─── TUNTAS Flow ────────────────────────────────────────
  test('POST /api/transaction/tuntas - success flow', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/transaction/tuntas`, {
      data: {
        amount: 25000,
        scenario: 'success',
        pan: '9360000100000001',
        merchantId: 'MERCHANT001',
        terminalId: 'TERM0001',
        currency: '360',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.result.status).toBe('APPROVED');
    expect(body.result.steps).toBeDefined();
    expect(body.result.steps.length).toBeGreaterThanOrEqual(2); // auth + advice + settlement
  });

  test('POST /api/transaction/tuntas - failed flow', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/transaction/tuntas`, {
      data: { amount: 25000, scenario: 'failed' },
    });
    const body = await res.json();
    expect(body.result.status).toBe('DECLINED');
    expect(body.result.steps.length).toBe(1); // only auth step
  });

  // ─── Cross Border ───────────────────────────────────────
  test('POST /api/transaction/cross-border - success', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/transaction/cross-border`, {
      data: {
        amount: 100,
        originCountry: 'SG',
        originCurrency: '702',
        settlementCurrency: '360',
        exchangeRate: 11500,
        scenario: 'success',
        merchantName: 'SG TEST MERCHANT',
        merchantCity: 'SINGAPORE',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.result.status).toBe('APPROVED');
    expect(body.result.crossBorder).toBeDefined();
    expect(body.result.crossBorder.originCurrency).toBe('702');
    expect(body.result.crossBorder.settlementCurrency).toBe('360');
    expect(body.result.qrisString).toBeDefined();
  });

  // ─── Transaction Log ────────────────────────────────────
  test('GET /api/transaction/log - returns transaction list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/transaction/log?limit=10`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.result)).toBe(true);
  });

  test('GET /api/transaction/rrn/:rrn - returns transaction by RRN', async ({ request }) => {
    // Create a transaction first
    const gen = await request.post(`${BASE_URL}/api/qris/generate/mpm`, {
      data: {
        merchantPan: '9360000100000001',
        merchantId: '1234567890123',
        merchantName: 'RRN TEST',
        merchantCity: 'JAKARTA',
        transactionAmount: 10000,
        currency: '360',
        countryCode: 'ID',
      },
    });
    const genBody = await gen.json();

    const txn = await request.post(`${BASE_URL}/api/transaction/mpm/acquirer`, {
      data: { qrisString: genBody.qrisString, amount: 10000, scenario: 'success' },
    });
    const txnBody = await txn.json();
    const rrn = txnBody.result.rrn;

    const res = await request.get(`${BASE_URL}/api/transaction/rrn/${rrn}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.result.rrn).toBe(rrn);
  });

  // ─── Mock Data Endpoints ────────────────────────────────
  test('GET /api/qris/mock/merchants returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/qris/mock/merchants`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /api/qris/mock/scenarios returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/qris/mock/scenarios`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  // ─── ISO8583 Reference ──────────────────────────────────
  test('GET /api/iso8583/reference/action-codes returns codes', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/iso8583/reference/action-codes`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.codes).toBeDefined();
    expect(body.codes.APPROVED).toBe('00');
  });
});

test.describe('QRIS Simulator - UI Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('homepage loads with correct title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('QRIS Simulator');
  });

  test('tabs switch correctly', async ({ page }) => {
    await page.click('[data-tab="parser"]');
    await expect(page.locator('#tab-parser')).toBeVisible();
    await expect(page.locator('#tab-generator')).not.toBeVisible();

    await page.click('[data-tab="iso8583"]');
    await expect(page.locator('#tab-iso8583')).toBeVisible();
  });

  test('generate MPM QR from UI', async ({ page }) => {
    await page.fill('#genName', 'UI TEST MERCHANT');
    await page.fill('#genAmount', '50000');
    await page.click('button:has-text("Generate QRIS")');
    await expect(page.locator('#genResult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#genResult')).toContainText('Generated MPM');
  });

  test('parse QRIS from UI', async ({ page }) => {
    // Generate first
    await page.click('button:has-text("Generate QRIS")');
    const qrText = await page.locator('#genResult .qr-string').textContent();

    // Switch to parser
    await page.click('[data-tab="parser"]');
    await page.fill('#parseInput', qrText);
    await page.click('button:has-text("Parse")');
    await expect(page.locator('#parseResult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#parseResult')).toContainText('VALID');
  });

  test('MPM acquirer transaction from UI', async ({ page }) => {
    await page.click('[data-tab="mpm"]');
    await page.fill('#mpmAmount', '25000');
    await page.click('button:has-text("Generate QR First")');
    await page.waitForTimeout(1000);

    await page.selectOption('#mpmScenario', 'success');
    await page.click('button:has-text("Submit as Acquirer")');
    await expect(page.locator('#mpmResult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#mpmResult')).toContainText('APPROVED');
  });

  test('tuntas flow from UI', async ({ page }) => {
    await page.click('[data-tab="tuntas"]');
    await page.fill('#tuntasAmount', '25000');
    await page.selectOption('#tuntasScenario', 'success');
    await page.click('button:has-text("Run TUNTAS Flow")');
    await expect(page.locator('#tuntasResult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#tuntasResult')).toContainText('APPROVED');
  });

  test('cross border flow from UI', async ({ page }) => {
    await page.click('[data-tab="crossborder"]');
    await page.selectOption('#cbOriginCountry', 'SG');
    await page.click('button:has-text("Run Cross Border")');
    await expect(page.locator('#cbResult')).toBeVisible({ timeout: 5000 });
  });

  test('transaction log displays entries', async ({ page }) => {
    // Create a transaction first
    await page.click('[data-tab="tuntas"]');
    await page.click('button:has-text("Run TUNTAS Flow")');
    await page.waitForTimeout(1000);

    // Check log
    await page.click('[data-tab="log"]');
    await expect(page.locator('#logContent table')).toBeVisible({ timeout: 5000 });
  });
});
