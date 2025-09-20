const proxyChain = require('proxy-chain');
const config = require('../config/scraper');

class ProxyManager {
  constructor() {
    this.anonymizedProxy = null;
    this.credentials = null;
  }

  async init() {
    const proxyString = config.proxy.proxyString;
    if (!proxyString) return;

    const [username, password, host, port] = proxyString.split(':');
    this.credentials = { username, password };
    
    this.anonymizedProxy = await proxyChain.anonymizeProxy(`http://${host}:${port}`);
  }

  getProxyUrl() {
    return this.anonymizedProxy;
  }

  getCredentials() {
    return this.credentials;
  }

  async close() {
    if (this.anonymizedProxy) {
      await proxyChain.closeAnonymizedProxy(this.anonymizedProxy, true);
    }
  }
}

module.exports = ProxyManager;