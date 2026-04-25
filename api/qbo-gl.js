const { currentYearRange, handleOptions, qboFetch, sendJson } = require('./_qbo');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    const report = await qboFetch('GeneralLedger', {
      ...currentYearRange(req),
      accounting_method: req.query.accounting_method || 'Accrual'
    });
    sendJson(res, 200, {
      fetchedAt: new Date().toISOString(),
      raw: report
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
