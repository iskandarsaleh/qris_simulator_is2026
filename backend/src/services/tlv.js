/**
 * TLV (Tag-Length-Value) encoding/decoding for QRIS
 * Tag: 2 digits, Length: 2 digits, Value: variable
 */
class TLVService {

  /** Encode single TLV */
  encode(tag, value) {
    if (!/^\d{2}$/.test(tag)) throw new Error(`Invalid tag: ${tag}`);
    const len = value.length.toString().padStart(2, '0');
    if (len.length > 2) throw new Error(`Value too long for tag ${tag}`);
    return `${tag}${len}${value}`;
  }

  /** Decode TLV string into array of {tag, length, value} */
  decode(tlvString) {
    const result = [];
    let offset = 0;
    const str = tlvString.replace(/\s/g, ''); // trim whitespace

    while (offset < str.length) {
      if (offset + 4 > str.length) break;
      const tag = str.substring(offset, offset + 2);
      const length = parseInt(str.substring(offset + 2, offset + 4), 10);
      if (isNaN(length)) throw new Error(`Invalid length at offset ${offset + 2}`);
      offset += 4;
      if (offset + length > str.length) throw new Error(`Value overflow for tag ${tag}`);
      const value = str.substring(offset, offset + length);
      offset += length;
      result.push({ tag, length, value });
    }
    return result;
  }

  /** Build QRIS string from ordered array of {tag, value} */
  build(tags) {
    return tags.map(({ tag, value }) => this.encode(tag, value)).join('');
  }

  /** Find specific tag */
  findTag(decoded, tag) {
    return decoded.find(t => t.tag === tag);
  }

  /** Find all of a tag */
  findAllTags(decoded, tag) {
    return decoded.filter(t => t.tag === tag);
  }

  /** Recursively decode with nested sub-TLV */
  decodeRecursive(tlvString) {
    const decoded = this.decode(tlvString);
    return decoded.map(item => {
      if (item.length >= 4 && this._looksLikeTLV(item.value)) {
        try { item.children = this.decodeRecursive(item.value); }
        catch (e) { /* keep as leaf */ }
      }
      return item;
    });
  }

  /** Pretty-print decoded TLV tree */
  prettyPrint(decoded, indent = 0) {
    const pad = '  '.repeat(indent);
    let out = '';
    for (const item of decoded) {
      const desc = TLV_DESCRIPTIONS[item.tag] || '';
      out += `${pad}[${item.tag}] len=${item.length} val="${item.value}"${desc ? ' (' + desc + ')' : ''}\n`;
      if (item.children) out += this.prettyPrint(item.children, indent + 1);
    }
    return out;
  }

  _looksLikeTLV(str) {
    if (str.length < 4) return false;
    return /^\d{2}\d{2}/.test(str);
  }
}

const TLV_DESCRIPTIONS = {
  '00': 'Payload Format Indicator',
  '01': 'Point of Initiation Method',
  '26': 'Merchant Account Information (QRIS)',
  '27': 'Merchant Account Information (Visa)',
  '28': 'Merchant Account Information (Mastercard)',
  '29': 'Consumer Account Information (CPM)',
  '51': 'Merchant Account Information (QRIS Domestic)',
  '53': 'Transaction Currency',
  '54': 'Transaction Amount',
  '55': 'Tip or Convenience Indicator',
  '56': 'Value of Convenience Fee (Fixed)',
  '57': 'Value of Convenience Fee (%)',
  '58': 'Country Code',
  '59': 'Merchant Name',
  '60': 'Merchant City',
  '61': 'Postal Code',
  '62': 'Additional Data Field Template',
  '63': 'CRC',
  '64': 'Merchant Information (Language)',
  '91': 'Cross Border Specification',
};

module.exports = new TLVService();
