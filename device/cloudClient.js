// A small client for the shop's cloud API, used by first-run setup (as the owner, by session
// cookie), and by the sync worker and history reads (as the device, by its token).
const cloudClient = (cloudUrl, { deviceToken } = {}) => {
  let cookie = null;
  const base = String(cloudUrl).replace(/\/+$/, "");

  const call = async (method, path, { body, headers: extraHeaders, timeoutMs = 30000 } = {}) => {
    const headers = { "content-type": "application/json", ...extraHeaders };
    if (cookie) headers.cookie = cookie;
    if (deviceToken) headers.authorization = `Device ${deviceToken}`;
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const error = new Error(`Can't reach the server at ${base} — check the internet connection (${err.cause?.code || err.name})`);
      error.offline = true;
      throw error;
    }
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.message || `Server answered ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return data;
  };
  return { call };
};

module.exports = { cloudClient };
