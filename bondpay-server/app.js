const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('./dist/server.js');
