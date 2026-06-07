const express = require('express');
const QRIS = require('../services/qris');
const TLV  = require('../services/tlv');
const Mock = require('../mock/data');

const router = express.Router();

// Generate MPM QR
router.post('/generate/mpm', (req, res) => {
  try {
    const qris = QRIS.generateMPM(req.body);
    const parsed = QRIS.parse(qris);
    res.json({ success: true, qrisString: qris, parsed });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Generate CPM QR
router.post('/generate/cpm', (req, res) => {
  try {
    const qris = QRIS.generateCPM(req.body);
    const parsed = QRIS.parse(qris);
    res.json({ success: true, qrisString: qris, parsed });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Parse any QRIS string
router.post('/parse', (req, res) => {
  try {
    const parsed = QRIS.parse(req.body.qrisString);
    res.json({ success: true, parsed });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Validate CRC
router.post('/validate', (req, res) => {
  try {
    const parsed = QRIS.parse(req.body.qrisString);
    res.json({ success: true, valid: parsed.valid, crcExpected: parsed.crcExpected, crcActual: parsed.crcActual });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Get mock data
router.get('/mock/merchants', (req, res) => res.json(Mock.MPM_MERCHANTS));
router.get('/mock/consumers', (req, res) => res.json(Mock.CPM_CONSUMERS));
router.get('/mock/cross-border', (req, res) => res.json(Mock.CROSS_BORDER_MERCHANTS));
router.get('/mock/scenarios', (req, res) => res.json(Mock.SCENARIOS));
router.get('/mock/tlv-samples', (req, res) => res.json(Mock.TLV_SAMPLES));

module.exports = router;
