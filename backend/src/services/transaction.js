const QRIS   = require('./qris');
const TLV    = require('./tlv');
const { ISO8583Service, MTI, PROC_CODE, ACTION_CODE, ACTION_DESC } = require('./iso8583');
const Mapping = require('./mapping');
const Redis   = require('./redis');
const crypto  = require('crypto');

const SCENARIOS = {
  success:          { name:'SUCCESS',          status:'APPROVED', actionCode:'00' },
  pending:          { name:'PENDING',          status:'PENDING',  actionCode:'91' },
  failed:           { name:'FAILED',           status:'DECLINED', actionCode:'05' },
  invalid_amount:   { name:'INVALID_AMOUNT',   status:'DECLINED', actionCode:'13' },
  insufficient:     { name:'INSUFFICIENT',     status:'DECLINED', actionCode:'51' },
  timeout:          { name:'TIMEOUT',          status:'TIMEOUT',  actionCode:'68' },
  suspected_fraud:  { name:'SUSPECTED_FRAUD',  status:'DECLINED', actionCode:'59' },
  system_error:     { name:'SYSTEM_ERROR',     status:'ERROR',    actionCode:'96' },
  partial_approved: { name:'PARTIAL_APPROVED', status:'PARTIAL',  actionCode:'10' },
  duplicate:        { name:'DUPLICATE',        status:'DECLINED', actionCode:'94' },
  not_permitted:    { name:'NOT_PERMITTED',    status:'DECLINED', actionCode:'57' },
};

function pickScenario(scenario, amount) {
  if (scenario && SCENARIOS[scenario]) return SCENARIOS[scenario];
  if (amount > 10000000) return SCENARIOS.suspected_fraud;
  if (amount > 5000000)  return SCENARIOS.pending;
  if (amount <= 0)       return SCENARIOS.invalid_amount;
  return SCENARIOS.success;
}

function nowISO() { return new Date().toISOString(); }

class TransactionService {

  async _store(result) {
    await Redis.hset('transactions', result.transactionId, result);
    await Redis.lpush('transaction_log', result);
    await Redis.set(`txn:${result.rrn}`, result, 86400);
  }

  // ─── MPM Acquirer ───────────────────────────────────────────────
  async mpmAcquirer(p) {
    const txnId = crypto.randomUUID(), rrn = QRIS.generateRRN(), stan = QRIS.generateSTAN();
    const parsed = QRIS.parse(p.qrisString);
    const sc = pickScenario(p.scenario, p.amount);
    const mapping = Mapping.mapTLVToISO(parsed);

    const req = ISO8583Service.buildQRISRequest('PURCHASE_REQ', {
      pan: p.pan || parsed.merchantInfo?.['01'] || '9360000000000001',
      amount: p.amount, currency: parsed.tags['53'] || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: parsed.merchantInfo?.['02'] || p.merchantId || 'MERCHANT001',
      merchantName: parsed.tags['59'] || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      qrisData: p.qrisString,
    });

    const resp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.pan || parsed.merchantInfo?.['01'] || '9360000000000001',
      amount: p.amount, currency: parsed.tags['53'] || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: parsed.merchantInfo?.['02'] || p.merchantId || 'MERCHANT001',
      merchantName: parsed.tags['59'] || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      actionCode: sc.actionCode,
    });

    const result = {
      transactionId: txnId, type: 'MPM_ACQUIRER', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      parsedQRIS: parsed,
      isoRequest:  { mti: req.mti,  fields: req.fields,  raw: req.raw },
      isoResponse: { mti: resp.mti, fields: resp.fields, raw: resp.raw },
      mapping, timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── MPM Issuer ─────────────────────────────────────────────────
  async mpmIssuer(p) {
    const txnId = crypto.randomUUID(), rrn = p.rrn || QRIS.generateRRN(), stan = p.stan || QRIS.generateSTAN();
    const sc = pickScenario(p.scenario, p.amount);

    let parsedISO = null;
    if (p.isoMessage) parsedISO = ISO8583Service.parseMessage(p.isoMessage);

    const resp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.pan || '9360000000000001', amount: p.amount,
      currency: p.currency || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      actionCode: sc.actionCode,
    });

    let advice = null;
    if (sc.status === 'APPROVED') {
      const a = ISO8583Service.buildQRISRequest('ADVICE_REQ', {
        pan: p.pan || '9360000000000001', amount: p.amount,
        currency: p.currency || '360', rrn, stan,
        terminalId: p.terminalId || 'TERM0001',
        merchantId: p.merchantId || 'MERCHANT001',
        actionCode: sc.actionCode,
      });
      advice = { mti: a.mti, fields: a.fields, raw: a.raw };
    }

    const result = {
      transactionId: txnId, type: 'MPM_ISSUER', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      isoResponse: { mti: resp.mti, fields: resp.fields, raw: resp.raw },
      adviceMessage: advice, parsedISO, timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── CPM Acquirer ───────────────────────────────────────────────
  async cpmAcquirer(p) {
    const txnId = crypto.randomUUID(), rrn = QRIS.generateRRN(), stan = QRIS.generateSTAN();
    const parsed = QRIS.parse(p.qrisString);
    const sc = pickScenario(p.scenario, p.amount);
    const mapping = Mapping.mapTLVToISO(parsed);

    const req = ISO8583Service.buildQRISRequest('PURCHASE_REQ', {
      pan: p.pan || parsed.consumerInfo?.['01'] || '9360000000000001',
      amount: p.amount, currency: parsed.tags['53'] || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      qrisData: p.qrisString,
    });

    const resp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.pan || parsed.consumerInfo?.['01'] || '9360000000000001',
      amount: p.amount, currency: parsed.tags['53'] || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      actionCode: sc.actionCode,
    });

    const result = {
      transactionId: txnId, type: 'CPM_ACQUIRER', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      parsedQRIS: parsed,
      isoRequest:  { mti: req.mti,  fields: req.fields,  raw: req.raw },
      isoResponse: { mti: resp.mti, fields: resp.fields, raw: resp.raw },
      mapping, timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── CPM Issuer ─────────────────────────────────────────────────
  async cpmIssuer(p) {
    const txnId = crypto.randomUUID(), rrn = p.rrn || QRIS.generateRRN(), stan = p.stan || QRIS.generateSTAN();
    const sc = pickScenario(p.scenario, p.amount);

    const resp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.pan || '9360000000000001', amount: p.amount,
      currency: p.currency || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      actionCode: sc.actionCode,
    });

    const result = {
      transactionId: txnId, type: 'CPM_ISSUER', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      isoResponse: { mti: resp.mti, fields: resp.fields, raw: resp.raw },
      timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── QRIS Tuntas (End-to-End Settlement) ───────────────────────
  async tuntas(p) {
    const txnId = crypto.randomUUID(), rrn = QRIS.generateRRN(), stan = QRIS.generateSTAN();
    const sc = pickScenario(p.scenario, p.amount);
    const steps = [];

    // Step 1: Authorization
    const authReq = ISO8583Service.buildQRISRequest('PURCHASE_REQ', {
      pan: p.pan || '9360000000000001', amount: p.amount,
      currency: p.currency || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
    });

    const authResp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.pan || '9360000000000001', amount: p.amount,
      currency: p.currency || '360', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'QRIS MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0001',
      actionCode: sc.actionCode,
    });

    steps.push({
      step: 'AUTHORIZATION', description: 'Acquirer → Switch → Issuer → Switch → Acquirer',
      request: { mti: authReq.mti, fields: authReq.fields, raw: authReq.raw },
      response: { mti: authResp.mti, fields: authResp.fields, raw: authResp.raw },
    });

    // Step 2: Financial Advice (if approved)
    if (sc.status === 'APPROVED') {
      const advReq = ISO8583Service.buildQRISRequest('ADVICE_REQ', {
        pan: p.pan || '9360000000000001', amount: p.amount,
        currency: p.currency || '360', rrn, stan,
        terminalId: p.terminalId || 'TERM0001',
        merchantId: p.merchantId || 'MERCHANT001',
        actionCode: sc.actionCode,
      });
      const advResp = ISO8583Service.buildQRISRequest('ADVICE_RESP', {
        amount: p.amount, currency: p.currency || '360', rrn, stan,
        terminalId: p.terminalId || 'TERM0001',
        merchantId: p.merchantId || 'MERCHANT001',
        actionCode: '00',
      });
      steps.push({
        step: 'FINANCIAL_ADVICE', description: 'Acquirer → Switch (Advice)',
        request: { mti: advReq.mti, fields: advReq.fields, raw: advReq.raw },
        response: { mti: advResp.mti, fields: advResp.fields, raw: advResp.raw },
      });

      // Step 3: Settlement
      const fee = p.fee || (p.amount * 0.007).toFixed(2);
      const net = (p.amount - parseFloat(fee)).toFixed(2);
      steps.push({
        step: 'SETTLEMENT', description: 'Clearing & Settlement (Tuntas)',
        status: 'COMPLETED',
        settlementAmount: p.amount,
        settlementCurrency: p.currency || '360',
        fee, netAmount: net,
        settlementDate: nowISO(),
      });
    }

    const result = {
      transactionId: txnId, type: 'TUNTAS', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      steps, timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── Cross Border ───────────────────────────────────────────────
  async crossBorder(p) {
    const txnId = crypto.randomUUID(), rrn = QRIS.generateRRN(), stan = QRIS.generateSTAN();
    const sc = pickScenario(p.scenario, p.amount);
    const exchangeRate = p.exchangeRate || 11500;
    const settlementAmt = p.amount * exchangeRate;

    // Generate cross-border QRIS
    const qrisStr = QRIS.generateMPM({
      merchantPan: p.merchantPan || '9360000000000001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'CROSS BORDER MERCHANT',
      merchantCity: p.merchantCity || 'SINGAPORE',
      countryCode: p.originCountry || 'SG',
      transactionAmount: p.amount,
      currency: p.originCurrency || '702',
      crossBorder: {
        destinationCountry: p.destinationCountry || 'ID',
        settlementCurrency: p.settlementCurrency || '360',
        merchantFee: p.merchantFee || '0.7',
      },
    });

    const parsed = QRIS.parse(qrisStr);
    const mapping = Mapping.mapTLVToISO(parsed);

    const req = ISO8583Service.buildQRISRequest('PURCHASE_REQ', {
      pan: p.merchantPan || '9360000000000001',
      amount: p.amount, currency: p.originCurrency || '702', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'CROSS BORDER MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0002',
      qrisData: qrisStr,
      settlementAmt, settlementCcy: p.settlementCurrency || '360',
    });

    const resp = ISO8583Service.buildQRISRequest('PURCHASE_RESP', {
      pan: p.merchantPan || '9360000000000001',
      amount: p.amount, currency: p.originCurrency || '702', rrn, stan,
      terminalId: p.terminalId || 'TERM0001',
      merchantId: p.merchantId || 'MERCHANT001',
      merchantName: p.merchantName || 'CROSS BORDER MERCHANT',
      acqInst: p.acquiringInstitution || '0001',
      fwdInst: p.forwardingInstitution || '0002',
      actionCode: sc.actionCode,
    });

    const result = {
      transactionId: txnId, type: 'CROSS_BORDER', rrn, stan,
      scenario: sc.name, status: sc.status, actionCode: sc.actionCode,
      actionCodeDescription: ACTION_DESC[sc.actionCode] || 'Unknown',
      crossBorder: {
        originCountry: p.originCountry || 'SG',
        destinationCountry: p.destinationCountry || 'ID',
        originCurrency: p.originCurrency || '702',
        settlementCurrency: p.settlementCurrency || '360',
        exchangeRate,
        originAmount: p.amount,
        settlementAmount: settlementAmt.toFixed(2),
      },
      qrisString: qrisStr, parsedQRIS: parsed,
      isoRequest:  { mti: req.mti,  fields: req.fields,  raw: req.raw },
      isoResponse: { mti: resp.mti, fields: resp.fields, raw: resp.raw },
      mapping, timestamp: nowISO(),
    };
    await this._store(result);
    return result;
  }

  // ─── Queries ────────────────────────────────────────────────────
  async getByRRN(rrn)         { return Redis.get(`txn:${rrn}`); }
  async getAll()              { return Redis.hgetall('transactions'); }
  async getLog(limit = 50)    { return Redis.lrange('transaction_log', 0, limit - 1); }

  async clear() {
    const keys = await Redis.keys('txn:*');
    for (const k of keys) await Redis.del(k);
    const all = await Redis.hgetall('transactions');
    for (const k of Object.keys(all)) await Redis.hdel('transactions', k);
    await Redis.del('transaction_log');
    return true;
  }
}

module.exports = new TransactionService();
