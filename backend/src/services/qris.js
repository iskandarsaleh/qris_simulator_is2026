const TLV = require('./tlv');
const crypto = require('crypto');

class QRISService {

  // ─── MPM (Merchant Presented Mode) ─────────────────────────────
  generateMPM(params) {
    const {
      merchantPan, merchantId, merchantName, merchantCity,
      countryCode = 'ID', transactionAmount = null, currency = '360',
      pointOfInitiation = transactionAmount ? '12' : '11',
      postalCode = '', additionalData = {}, terminalId = '',
      merchantCriteria = 'U', crossBorder = null,
    } = params;

    const merchantInfoSubs = [
      { tag: '00', value: 'QRIS' },
      { tag: '01', value: merchantPan },
      { tag: '02', value: merchantId },
      { tag: '03', value: merchantCriteria },
    ];
    if (terminalId) merchantInfoSubs.push({ tag: '09', value: terminalId });

    const tags = [
      { tag: '00', value: '01' },
      { tag: '01', value: pointOfInitiation },
      { tag: '26', value: TLV.build(merchantInfoSubs) },
    ];

    if (transactionAmount !== null && transactionAmount > 0)
      tags.push({ tag: '54', value: parseFloat(transactionAmount).toFixed(2) });

    tags.push(
      { tag: '53', value: currency },
      { tag: '58', value: countryCode },
      { tag: '59', value: merchantName.substring(0, 25) },
      { tag: '60', value: merchantCity.substring(0, 15) },
    );

    if (postalCode) tags.push({ tag: '61', value: postalCode });

    const addDataSubs = [];
    if (additionalData.billNumber)     addDataSubs.push({ tag: '01', value: additionalData.billNumber });
    if (additionalData.mobileNumber)   addDataSubs.push({ tag: '02', value: additionalData.mobileNumber });
    if (additionalData.storeLabel)     addDataSubs.push({ tag: '03', value: additionalData.storeLabel });
    if (additionalData.referenceLabel) addDataSubs.push({ tag: '05', value: additionalData.referenceLabel });
    if (additionalData.terminalLabel)  addDataSubs.push({ tag: '07', value: additionalData.terminalLabel });
    if (additionalData.purpose)        addDataSubs.push({ tag: '08', value: additionalData.purpose });
    if (addDataSubs.length) tags.push({ tag: '62', value: TLV.build(addDataSubs) });

    if (crossBorder) {
      const cb = [];
      if (crossBorder.destinationCountry) cb.push({ tag: '00', value: crossBorder.destinationCountry });
      if (crossBorder.settlementCurrency) cb.push({ tag: '01', value: crossBorder.settlementCurrency });
      if (crossBorder.merchantFee)        cb.push({ tag: '02', value: crossBorder.merchantFee });
      if (cb.length) tags.push({ tag: '91', value: TLV.build(cb) });
    }

    const raw = TLV.build(tags) + '6304';
    const crc = this._crc16(raw);
    return raw + crc;
  }

  // ─── CPM (Consumer Presented Mode) ─────────────────────────────
  generateCPM(params) {
    const {
      consumerPan, consumerName, consumerCity,
      countryCode = 'ID', transactionAmount = null, currency = '360',
      token = '', cardExpiry = '',
    } = params;

    const consumerInfoSubs = [
      { tag: '00', value: 'QRISCPM' },
      { tag: '01', value: consumerPan },
    ];
    if (token)     consumerInfoSubs.push({ tag: '02', value: token });
    if (cardExpiry) consumerInfoSubs.push({ tag: '03', value: cardExpiry });

    const tags = [
      { tag: '00', value: '01' },
      { tag: '01', value: '12' },
      { tag: '29', value: TLV.build(consumerInfoSubs) },
    ];

    if (transactionAmount !== null && transactionAmount > 0)
      tags.push({ tag: '54', value: parseFloat(transactionAmount).toFixed(2) });

    tags.push(
      { tag: '53', value: currency },
      { tag: '58', value: countryCode },
      { tag: '59', value: consumerName.substring(0, 25) },
      { tag: '60', value: consumerCity.substring(0, 15) },
    );

    const raw = TLV.build(tags) + '6304';
    const crc = this._crc16(raw);
    return raw + crc;
  }

  // ─── Parse any QRIS string ─────────────────────────────────────
  parse(qrisString) {
    const decoded = TLV.decodeRecursive(qrisString);
    const result = {
      raw: qrisString,
      valid: false,
      mode: 'UNKNOWN',
      tags: {},
      decoded: [],
      merchantInfo: null,
      consumerInfo: null,
      additionalData: null,
      crossBorder: null,
    };

    // flat tag map
    decoded.forEach(t => { result.tags[t.tag] = t.value; });
    result.decoded = decoded;

    // CRC validation
    const crcTag = decoded.find(t => t.tag === '63');
    if (crcTag) {
      const base = qrisString.substring(0, qrisString.length - 4);
      const expected = this._crc16(base + '6304');
      result.valid = (crcTag.value.toUpperCase() === expected.toUpperCase());
      result.crcExpected = expected;
      result.crcActual = crcTag.value;
    }

    // mode detection
    const hasConsumer = decoded.find(t => t.tag === '29');
    result.mode = hasConsumer ? 'CPM' : 'MPM';

    // merchant info (tag 26 or 51)
    const mTag = decoded.find(t => t.tag === '26' || t.tag === '51');
    if (mTag && mTag.children) {
      result.merchantInfo = {};
      mTag.children.forEach(st => { result.merchantInfo[st.tag] = st.value; });
    }

    // consumer info (tag 29)
    const cTag = decoded.find(t => t.tag === '29');
    if (cTag && cTag.children) {
      result.consumerInfo = {};
      cTag.children.forEach(st => { result.consumerInfo[st.tag] = st.value; });
    }

    // additional data (tag 62)
    const aTag = decoded.find(t => t.tag === '62');
    if (aTag && aTag.children) {
      result.additionalData = {};
      aTag.children.forEach(st => { result.additionalData[st.tag] = st.value; });
    }

    // cross border (tag 91)
    const cbTag = decoded.find(t => t.tag === '91');
    if (cbTag && cbTag.children) {
      result.crossBorder = {};
      cbTag.children.forEach(st => { result.crossBorder[st.tag] = st.value; });
    }

    return result;
  }

  // ─── CRC-16 CCITT ──────────────────────────────────────────────
  _crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  generateRRN() {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = crypto.randomBytes(4).toString('hex').toUpperCase();
    return (ts + rnd).substring(0, 12);
  }

  generateSTAN() {
    return Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  }
}

module.exports = new QRISService();
