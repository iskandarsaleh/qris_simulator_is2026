const express = require('express');
const TLV     = require('../services/tlv');
const Mapping = require('../services/mapping');

const router = express.Router();

// Encode TLV
router.post('/encode', (req, res) => {
  try {
    const { tag, value } = req.body;
    const encoded = TLV.encode(tag, value);
    res.json({ success: true, tag, value, encoded });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Decode TLV
router.post('/decode', (req, res) => {
  try {
    const decoded = TLV.decode(req.body.tlvString);
    res.json({ success: true, decoded });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Build from tag array
router.post('/build', (req, res) => {
  try {
    const built = TLV.build(req.body.tags);
    res.json({ success: true, tlvString: built });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Recursive decode
router.post('/decode-recursive', (req, res) => {
  try {
    const decoded = TLV.decodeRecursive(req.body.tlvString);
    res.json({ success: true, decoded });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Map TLV → ISO8583
router.post('/map-to-iso', (req, res) => {
  try {
    const QRIS = require('../services/qris');
    const parsed = QRIS.parse(req.body.qrisString);
    const mapping = Mapping.mapTLVToISO(parsed);
    res.json({ success: true, mapping });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Map ISO8583 → TLV
router.post('/map-to-tlv', (req, res) => {
  try {
    const mapping = Mapping.mapISOToTLV(req.body.fields);
    res.json({ success: true, mapping });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Get mapping reference
router.get('/mapping-reference', (req, res) => res.json(Mapping.getReference()));

module.exports = router;
