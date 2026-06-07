/**
 * Mapping between QRIS TLV tags and ISO8583 data elements
 */

const TLV_TO_ISO = {
  '00': { isoField: null,   desc: 'Payload Format Indicator',   note: 'Metadata only' },
  '01': { isoField: '22',   desc: 'Point of Initiation Method', note: '11=static→021, 12=dynamic→022' },
  '26': { isoField: '48',   desc: 'Merchant Account Info',      note: 'Sub-TLV packed into DE48' },
  '29': { isoField: '48',   desc: 'Consumer Account Info(CPM)', note: 'Sub-TLV packed into DE48' },
  '51': { isoField: '48',   desc: 'Merchant Account Domestic',  note: 'Sub-TLV packed into DE48' },
  '53': { isoField: '49',   desc: 'Transaction Currency',       note: 'Direct map' },
  '54': { isoField: '4',    desc: 'Transaction Amount',         note: '×100, zero-padded to 12' },
  '55': { isoField: '54',   desc: 'Tip/Convenience Indicator',  note: 'Additional Amounts' },
  '58': { isoField: null,   desc: 'Country Code',               note: 'Part of DE43' },
  '59': { isoField: '43',   desc: 'Merchant Name',              note: 'Card Acceptor Name' },
  '60': { isoField: '43',   desc: 'Merchant City',              note: 'Part of Card Acceptor Location' },
  '61': { isoField: null,   desc: 'Postal Code',                note: 'Part of DE43 if needed' },
  '62': { isoField: '62',   desc: 'Additional Data',            note: 'Direct map' },
  '63': { isoField: null,   desc: 'CRC',                        note: 'Not mapped' },
  '91': { isoField: '48',   desc: 'Cross Border Spec',          note: 'Sub-TLV in DE48' },
};

const MERCHANT_INFO_MAP = {
  '00': { isoField: '48',   desc: 'Global Unique Identifier',   sub: true },
  '01': { isoField: '2',    desc: 'Merchant PAN',               sub: false },
  '02': { isoField: '42',   desc: 'Merchant ID',                sub: false },
  '03': { isoField: '48',   desc: 'Merchant Criteria',          sub: true },
  '04': { isoField: '48',   desc: 'Aggregator Code',            sub: true },
  '05': { isoField: '32',   desc: 'Aggregator/Institution ID',  sub: false },
  '06': { isoField: '48',   desc: 'Aggregator Name',            sub: true },
  '07': { isoField: '48',   desc: 'Alt Merchant Name',          sub: true },
  '08': { isoField: '48',   desc: 'Alt Merchant City',          sub: true },
  '09': { isoField: '41',   desc: 'Terminal ID',                sub: false },
};

const ADDITIONAL_DATA_MAP = {
  '01': { isoField: '62',   desc: 'Bill Number',       sub: true },
  '02': { isoField: '62',   desc: 'Mobile Number',     sub: true },
  '03': { isoField: '62',   desc: 'Store Label',       sub: true },
  '04': { isoField: '62',   desc: 'Loyalty Number',    sub: true },
  '05': { isoField: '37',   desc: 'Reference Label → RRN', sub: false },
  '06': { isoField: '62',   desc: 'Customer Label',    sub: true },
  '07': { isoField: '62',   desc: 'Terminal Label',    sub: true },
  '08': { isoField: '62',   desc: 'Purpose of Txn',    sub: true },
};

class MappingService {

  /** Map parsed QRIS TLV → ISO8583 fields */
  mapTLVToISO(parsed) {
    const result = { isoFields: {}, details: [], warnings: [] };

    for (const [tag, value] of Object.entries(parsed.tags || {})) {
      const m = TLV_TO_ISO[tag];
      if (!m) { result.warnings.push(`Tag ${tag}: no ISO8583 mapping`); continue; }

      const detail = { tlvTag: tag, tlvValue: value, isoField: m.isoField, desc: m.desc, note: m.note };
      result.details.push(detail);

      if (!m.isoField) continue;

      if (tag === '54') {
        result.isoFields[m.isoField] = (parseFloat(value) * 100).toFixed(0).padStart(12, '0');
      } else if (tag === '59') {
        result.isoFields['43'] = (result.isoFields['43'] || '') + value;
      } else if (tag === '60') {
        result.isoFields['43'] = (result.isoFields['43'] || '') + ' ' + value;
      } else if (m.isoField === '48') {
        result.isoFields['48'] = (result.isoFields['48'] || '') + `[${tag}=${value}]`;
      } else {
        result.isoFields[m.isoField] = value;
      }
    }

    // merchant info sub-tags
    if (parsed.merchantInfo) {
      for (const [st, val] of Object.entries(parsed.merchantInfo)) {
        const m = MERCHANT_INFO_MAP[st];
        if (!m) continue;
        result.details.push({ tlvTag: `26.${st}`, tlvValue: val, isoField: m.isoField, desc: m.desc });
        if (m.sub) {
          result.isoFields['48'] = (result.isoFields['48'] || '') + `[26.${st}=${val}]`;
        } else {
          result.isoFields[m.isoField] = val;
        }
      }
    }

    // additional data sub-tags
    if (parsed.additionalData) {
      for (const [st, val] of Object.entries(parsed.additionalData)) {
        const m = ADDITIONAL_DATA_MAP[st];
        if (!m) continue;
        result.details.push({ tlvTag: `62.${st}`, tlvValue: val, isoField: m.isoField, desc: m.desc });
        if (m.sub) {
          result.isoFields['62'] = (result.isoFields['62'] || '') + `[62.${st}=${val}]`;
        } else {
          result.isoFields[m.isoField] = val;
        }
      }
    }

    return result;
  }

  /** Reverse: ISO8583 fields → QRIS TLV */
  mapISOToTLV(isoFields) {
    const result = { tlvTags: {}, details: [] };

    const rev = {};
    for (const [tag, m] of Object.entries(TLV_TO_ISO)) {
      if (m.isoField && !m.isoField.includes('.')) rev[m.isoField] = tag;
    }
    for (const [st, m] of Object.entries(MERCHANT_INFO_MAP)) {
      if (m.isoField && !m.sub) rev[m.isoField] = `26.${st}`;
    }
    for (const [st, m] of Object.entries(ADDITIONAL_DATA_MAP)) {
      if (m.isoField && !m.sub) rev[m.isoField] = `62.${st}`;
    }

    for (const [f, val] of Object.entries(isoFields)) {
      const tlvTag = rev[f];
      if (!tlvTag) continue;
      const resolvedVal = f === '4' ? (parseInt(val, 10) / 100).toFixed(2) : val;
      result.tlvTags[tlvTag] = resolvedVal;
      result.details.push({ isoField: f, isoValue: val, tlvTag, desc: TLV_TO_ISO[tlvTag]?.desc || '' });
    }

    return result;
  }

  getReference() {
    return { tlvToIso: TLV_TO_ISO, merchantInfo: MERCHANT_INFO_MAP, additionalData: ADDITIONAL_DATA_MAP };
  }
}

module.exports = new MappingService();
