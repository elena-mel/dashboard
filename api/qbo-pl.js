const { authUrl, currentYearRange, formatPL, handleOptions, qboFetch, sendJson } = require('./_qbo');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    const dates = currentYearRange(req);
    const report = await qboFetch('ProfitAndLoss', {
      ...dates,
      summarize_column_by: 'Month',
      accounting_method: req.query.accounting_method || 'Accrual'
    });
    sendJson(res, 200, formatPL(report));
  } catch (error) {
    const status = error.statusCode || 500;
    const body = { error: error.message };
    if (status === 401) body.authUrl = await authUrl(req);
    sendJson(res, status, body);
  }
};
