const { authUrl, handleOptions, sendJson } = require('./_qbo');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    res.statusCode = 302;
    res.setHeader('Location', await authUrl(req));
    res.end();
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
