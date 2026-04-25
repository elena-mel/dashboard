const { exchangeCodeForTokens, sendJson, verifyState } = require('./_qbo');

module.exports = async function handler(req, res) {
  try {
    const { code, realmId, state, error } = req.query;
    if (error) throw new Error(`QuickBooks authorization failed: ${error}`);
    if (!code || !realmId || !state) throw new Error('Missing code, realmId, or state from QuickBooks callback.');
    if (!(await verifyState(state))) throw new Error('OAuth state did not match. Start the QBO connection again.');
    await exchangeCodeForTokens(code, realmId, req);
    res.statusCode = 302;
    res.setHeader('Location', '/?qbo=connected');
    res.end();
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
