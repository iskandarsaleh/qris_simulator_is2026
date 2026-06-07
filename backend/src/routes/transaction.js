const express = require('express');
const Txn     = require('../services/transaction');

const router = express.Router();

// MPM Acquirer
router.post('/mpm/acquirer', async (req, res) => {
  try { res.json({ success: true, result: await Txn.mpmAcquirer(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// MPM Issuer
router.post('/mpm/issuer', async (req, res) => {
  try { res.json({ success: true, result: await Txn.mpmIssuer(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// CPM Acquirer
router.post('/cpm/acquirer', async (req, res) => {
  try { res.json({ success: true, result: await Txn.cpmAcquirer(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// CPM Issuer
router.post('/cpm/issuer', async (req, res) => {
  try { res.json({ success: true, result: await Txn.cpmIssuer(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// QRIS Tuntas
router.post('/tuntas', async (req, res) => {
  try { res.json({ success: true, result: await Txn.tuntas(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Cross Border
router.post('/cross-border', async (req, res) => {
  try { res.json({ success: true, result: await Txn.crossBorder(req.body) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Query
router.get('/rrn/:rrn',       async (req, res) => { res.json({ success: true, result: await Txn.getByRRN(req.params.rrn) }); });
router.get('/all',            async (req, res) => { res.json({ success: true, result: await Txn.getAll() }); });
router.get('/log',            async (req, res) => { res.json({ success: true, result: await Txn.getLog(parseInt(req.query.limit)||50) }); });
router.delete('/clear',       async (req, res) => { res.json({ success: true, result: await Txn.clear() }); });

module.exports = router;
