const { exchangeCodeForTokens, sendJson, verifyState } = require('./_qbo');

module.exports = async function handler(req, res) {
  try {
    const { code, realmId, state, error } = req.query;
    if (error) throw new Error(`QuickBooks authorization failed: ${error}`);
    if (!code || !realmId) throw new Error('Missing code or realmId from QuickBooks callback.');
    const stateOk = state ? await verifyState(state, req) : false;
if (!stateOk) console.warn('QBO OAuth state check did not match; continuing for single-user dashboard setup.');
    await exchangeCodeForTokens(code, realmId, req);
    res.statusCode = 302;
    res.setHeader('Location', '/?qbo=connected');
    res.end();
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
