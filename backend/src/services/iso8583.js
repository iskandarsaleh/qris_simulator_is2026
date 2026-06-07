/**
 * ISO 8583 Message Builder / Parser for QRIS
 * Supports MTI 0200/0210/0220/0230/0400/0410/0500/0510/0800/0810
 */

const MTI = {
  AUTH_REQ:            '0200',
  AUTH_RESP:           '0210',
  ADVICE_REQ:          '0220',
  ADVICE_RESP:         '0230',
  REVERSAL_REQ:        '0400',
  REVERSAL_RESP:       '0410',
  RECON_REQ:           '0500',
  RECON_RESP:          '0510',
  NET_MGMT_REQ:        '0800',
  NET_MGMT_RESP:       '0810',
};

const PROC_CODE = {
  PURCHASE:   '260000',
  REFUND:     '200000',
  INQUIRY:    '310000',
  PAYMENT:    '360000',
  TRANSFER:   '400000',
  CASH_OUT:   '010000',
};

const ACTION_CODE = {
  APPROVED:          '00',
  REFER_TO_ISSUER:   '01',
  INVALID_MERCHANT:  '03',
  DO_NOT_HONOR:      '05',
  INVALID_AMOUNT:    '13',
  INVALID_CARD:      '14',
  NOT_PERMITTED:     '57',
  SUSPECTED_FRAUD:   '59',
  INSUFFICIENT:      '51',
  TIMEOUT:           '68',
  ISSUER_INOP:       '91',
  DUPLICATE:         '94',
  RECONCILE_ERROR:   '95',
  SYSTEM_ERROR:      '96',
};

const ACTION_DESC = {
  '00': 'Approved or completed successfully',
  '01': 'Refer to card issuer',
  '02': 'Refer to card issuer, special condition',
  '03': 'Invalid merchant',
  '04': 'Pick-up card',
  '05': 'Do not honor',
  '06': 'Error',
  '07': 'Pick-up card, special condition',
  '10': 'Partial amount approved',
  '12': 'Invalid transaction',
  '13': 'Invalid amount',
  '14': 'Invalid card number',
  '15': 'No such issuer',
  '30': 'Format error',
  '31': 'Bank not supported by switch',
  '51': 'Insufficient funds',
  '57': 'Transaction not permitted to cardholder',
  '59': 'Suspected fraud',
  '68': 'Response received too late',
  '91': 'Issuer or switch inoperative',
  '94': 'Duplicate transmission',
  '95': 'Reconcile error',
  '96': 'System malfunction',
};

// Field definitions (simplified)
const FIELD_DEF = {
   2: { name:'PAN',                         type:'LLVAR',  maxLen:19  },
   3: { name:'Processing Code',             type:'FIXED',  len:6     },
   4: { name:'Amount Transaction',          type:'FIXED',  len:12    },
   5: { name:'Amount Settlement',           type:'FIXED',  len:12    },
   6: { name:'Amount Cardholder Billing',   type:'FIXED',  len:12    },
   7: { name:'Transmission Date Time',      type:'FIXED',  len:10    },
  11: { name:'STAN',                        type:'FIXED',  len:6     },
  12: { name:'Local Transaction Time',      type:'FIXED',  len:6     },
  13: { name:'Local Transaction Date',      type:'FIXED',  len:4     },
  14: { name:'Expiration Date',             type:'FIXED',  len:4     },
  22: { name:'POS Entry Mode',              type:'FIXED',  len:3     },
  24: { name:'Function Code',               type:'FIXED',  len:3     },
  25: { name:'POS Condition Code',          type:'FIXED',  len:2     },
  32: { name:'Acquiring Institution ID',    type:'LLVAR',  maxLen:11 },
  33: { name:'Forwarding Institution ID',   type:'LLVAR',  maxLen:11 },
  35: { name:'Track 2 Data',               type:'LLVAR',  maxLen:37 },
  37: { name:'RRN',                         type:'FIXED',  len:12    },
  39: { name:'Action Code',                 type:'FIXED',  len:2     },
  41: { name:'Card Acceptor Terminal ID',   type:'FIXED',  len:8     },
  42: { name:'Card Acceptor ID',            type:'FIXED',  len:15    },
  43: { name:'Card Acceptor Name/Location', type:'FIXED',  len:40    },
  48: { name:'Additional Data Private',     type:'LLLVAR', maxLen:999},
  49: { name:'Currency Code Transaction',   type:'FIXED',  len:3     },
  50: { name:'Currency Code Settlement',    type:'FIXED',  len:3     },
  52: { name:'PIN Data',                    type:'FIXED',  len:16    },
  54: { name:'Amounts Additional',          type:'LLLVAR', maxLen:120},
  55: { name:'ICC Data',                    type:'LLLVAR', maxLen:255},
  62: { name:'Additional Data 2',           type:'LLLVAR', maxLen:999},
  63: { name:'Network Data',               type:'LLLVAR', maxLen:999},
  64: { name:'MAC',                         type:'FIXED',  len:16    },
};

class ISO8583Service {

  /** Build complete ISO8583 message string from MTI + fields object */
  buildMessage(mti, fields) {
    const bitmap = this._bitmap(fields);
    let body = mti + bitmap;

    for (let i = 2; i <= 64; i++) {
      if (fields[i] === undefined) continue;
      const def = FIELD_DEF[i];
      if (!def) { body += fields[i].length.toString().padStart(3,'0') + fields[i]; continue; }

      if (def.type === 'FIXED') {
        body += fields[i].padStart(def.len, ' ');
      } else if (def.type === 'LLVAR') {
        body += fields[i].length.toString().padStart(2,'0') + fields[i];
      } else if (def.type === 'LLLVAR') {
        body += fields[i].length.toString().padStart(3,'0') + fields[i];
      }
    }

    return body.length.toString().padStart(4,'0') + body;
  }

  /** Parse raw ISO8583 string */
  parseMessage(msg) {
    const r = { length:0, mti:'', bitmap:'', fields:{}, parsed:{} };
    let off = 0;

    r.length = parseInt(msg.substring(0,4), 10); off = 4;
    r.mti = msg.substring(off, off+4); off += 4;
    r.bitmap = msg.substring(off, off+16); off += 16;

    const active = this._parseBitmap(r.bitmap);

    for (const f of active) {
      if (f === 1) continue;
      const def = FIELD_DEF[f];
      if (!def) {
        const len = parseInt(msg.substring(off, off+3),10); off += 3;
        r.fields[f] = msg.substring(off, off+len); off += len;
        r.parsed[f] = { name:`DE${f}`, value:r.fields[f] };
        continue;
      }
      if (def.type === 'FIXED') {
        r.fields[f] = msg.substring(off, off+def.len); off += def.len;
      } else if (def.type === 'LLVAR') {
        const len = parseInt(msg.substring(off, off+2),10); off += 2;
        r.fields[f] = msg.substring(off, off+len); off += len;
      } else if (def.type === 'LLLVAR') {
        const len = parseInt(msg.substring(off, off+3),10); off += 3;
        r.fields[f] = msg.substring(off, off+len); off += len;
      }
      r.parsed[f] = { name: def.name, value: r.fields[f] };
    }
    return r;
  }

  // ─── QRIS-specific builders ─────────────────────────────────────

  buildQRISRequest(type, p) {
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth()+1).toString().padStart(2,'0');
    const dd = now.getDate().toString().padStart(2,'0');
    const hh = now.getHours().toString().padStart(2,'0');
    const mi = now.getMinutes().toString().padStart(2,'0');
    const ss = now.getSeconds().toString().padStart(2,'0');
    const base = {
       7: `${yy}${mm}${dd}${hh}${mi}${ss}`,
      11: p.stan || '000001',
      12: `${hh}${mi}${ss}`,
      13: `${mm}${dd}`,
      22: '022',
      25: '00',
      49: p.currency || '360',
    };

    switch (type) {
      case 'PURCHASE_REQ':    return this._purchaseReq(base, p);
      case 'PURCHASE_RESP':   return this._purchaseResp(base, p);
      case 'ADVICE_REQ':      return this._adviceReq(base, p);
      case 'ADVICE_RESP':     return this._adviceResp(base, p);
      case 'REVERSAL_REQ':    return this._reversalReq(base, p);
      case 'REVERSAL_RESP':   return this._reversalResp(base, p);
      case 'RECON_REQ':       return this._reconReq(base, p);
      case 'RECON_RESP':      return this._reconResp(base, p);
      default: throw new Error(`Unknown type: ${type}`);
    }
  }

  _purchaseReq(b, p) {
    const f = { ...b,
       2: p.pan || '9360000000000001',
       3: PROC_CODE.PURCHASE,
       4: (p.amount*100).toFixed(0).padStart(12,'0'),
      32: p.acqInst || '0001',
      33: p.fwdInst || '0001',
      37: p.rrn || '000000000000',
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
      43: (p.merchantName || 'QRIS MERCHANT').padEnd(40,' '),
      48: p.qrisData || '',
    };
    if (p.settlementAmt) f[5] = (p.settlementAmt*100).toFixed(0).padStart(12,'0');
    if (p.settlementCcy) f[50] = p.settlementCcy;
    return { mti: MTI.AUTH_REQ, fields: f, raw: this.buildMessage(MTI.AUTH_REQ, f) };
  }

  _purchaseResp(b, p) {
    const f = { ...b,
       2: p.pan || '9360000000000001',
       3: PROC_CODE.PURCHASE,
       4: (p.amount*100).toFixed(0).padStart(12,'0'),
      32: p.acqInst || '0001',
      33: p.fwdInst || '0001',
      37: p.rrn || '000000000000',
      39: p.actionCode || ACTION_CODE.APPROVED,
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
      43: (p.merchantName || 'QRIS MERCHANT').padEnd(40,' '),
    };
    if (p.actionCode === '10' && p.approvedAmount) {
      f[54] = `3601${(p.approvedAmount*100).toFixed(0).padStart(12,'0')}`;
    }
    return { mti: MTI.AUTH_RESP, fields: f, raw: this.buildMessage(MTI.AUTH_RESP, f) };
  }

  _adviceReq(b, p) {
    const f = { ...b,
       2: p.pan || '9360000000000001',
       3: PROC_CODE.PURCHASE,
       4: (p.amount*100).toFixed(0).padStart(12,'0'),
      32: p.acqInst || '0001',
      37: p.rrn || '000000000000',
      39: p.actionCode || ACTION_CODE.APPROVED,
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
      48: p.qrisData || '',
    };
    return { mti: MTI.ADVICE_REQ, fields: f, raw: this.buildMessage(MTI.ADVICE_REQ, f) };
  }

  _adviceResp(b, p) {
    const f = { ...b,
       3: PROC_CODE.PURCHASE,
      37: p.rrn || '000000000000',
      39: p.actionCode || ACTION_CODE.APPROVED,
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
    };
    return { mti: MTI.ADVICE_RESP, fields: f, raw: this.buildMessage(MTI.ADVICE_RESP, f) };
  }

  _reversalReq(b, p) {
    const f = { ...b,
       2: p.pan || '9360000000000001',
       3: PROC_CODE.PURCHASE,
       4: (p.amount*100).toFixed(0).padStart(12,'0'),
      32: p.acqInst || '0001',
      37: p.rrn || '000000000000',
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
    };
    return { mti: MTI.REVERSAL_REQ, fields: f, raw: this.buildMessage(MTI.REVERSAL_REQ, f) };
  }

  _reversalResp(b, p) {
    const f = { ...b,
       3: PROC_CODE.PURCHASE,
      37: p.rrn || '000000000000',
      39: p.actionCode || ACTION_CODE.APPROVED,
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
    };
    return { mti: MTI.REVERSAL_RESP, fields: f, raw: this.buildMessage(MTI.REVERSAL_RESP, f) };
  }

  _reconReq(b, p) {
    const f = { ...b,
      32: p.acqInst || '0001',
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
    };
    return { mti: MTI.RECON_REQ, fields: f, raw: this.buildMessage(MTI.RECON_REQ, f) };
  }

  _reconResp(b, p) {
    const f = { ...b,
      32: p.acqInst || '0001',
      39: p.actionCode || ACTION_CODE.APPROVED,
      41: p.terminalId || 'TERM0001',
      42: p.merchantId || 'MERCHANT001    ',
    };
    return { mti: MTI.RECON_RESP, fields: f, raw: this.buildMessage(MTI.RECON_RESP, f) };
  }

  // ─── Bitmap helpers ─────────────────────────────────────────────

  _bitmap(fields) {
    let bm = BigInt(0);
    for (const n of Object.keys(fields)) {
      const i = parseInt(n);
      if (i >= 1 && i <= 64) bm |= BigInt(1) << BigInt(64 - i);
    }
    return bm.toString(16).toUpperCase().padStart(16, '0');
  }

  _parseBitmap(hex) {
    const out = [];
    const bm = BigInt('0x' + hex);
    for (let i = 1; i <= 64; i++) {
      if (bm & (BigInt(1) << BigInt(64 - i))) out.push(i);
    }
    return out;
  }
}

module.exports = {
  ISO8583Service: new ISO8583Service(),
  MTI, PROC_CODE, ACTION_CODE, ACTION_DESC, FIELD_DEF,
};
