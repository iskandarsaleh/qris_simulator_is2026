const express = require('express');
const { ISO8583Service, MTI, PROC_CODE, ACTION_CODE, ACTION_DESC, FIELD_DEF } = require('../services/iso8583');

const router = express.Router();

// Build ISO8583 message
router.post('/build', (req, res) => {
  try {
    const { mti, fields } = req.body;
    const raw = ISO8583Service.buildMessage(mti, fields);
    res.json({ success: true, mti, fields, raw });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Parse ISO8583 message
router.post('/parse', (req, res) => {
  try {
    const parsed = ISO8583Service.parseMessage(req.body.raw);
    res.json({ success: true, parsed });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Build QRIS-specific ISO message
router.post('/qris-request', (req, res) => {
  try {
    const { type, params } = req.body;
    const result = ISO8583Service.buildQRISRequest(type, params);
    res.json({ success: true, result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Reference data
router.get('/reference/mti', (req, res) => res.json(MTI));
router.get('/reference/proc-codes', (req, res) => res.json(PROC_CODE));
router.get('/reference/action-codes', (req, res) => res.json({ codes: ACTION_CODE, descriptions: ACTION_DESC }));
router.get('/reference/fields', (req, res) => res.json(FIELD_DEF));

module.exports = router;
