const { currentYearRange, handleOptions, qboFetch, sendJson } = require('./_qbo');

function collectCashRows(rows, out = []) {
  (rows?.Row || []).forEach((row) => {
    if (row.Rows?.Row) collectCashRows({ Row: row.Rows.Row }, out);
    const label = row.ColData?.[0]?.value || '';
    if (/cash|checking|savings|bank/i.test(label)) {
      out.push({
        account: label,
        value: Number(String(row.ColData?.[1]?.value || '0').replace(/[$,]/g, '')) || 0
      });
    }
  });
  return out;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    const report = await qboFetch('BalanceSheet', {
      end_date: currentYearRange(req).end_date,
      accounting_method: req.query.accounting_method || 'Accrual'
    });
    const cashAccounts = collectCashRows(report.Rows);
    sendJson(res, 200, {
      cashAccounts,
      cashTotal: cashAccounts.reduce((sum, row) => sum + row.value, 0),
      fetchedAt: new Date().toISOString(),
      raw: report
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
