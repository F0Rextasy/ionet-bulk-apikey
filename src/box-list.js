// quick broker box lister:  node src/box-list.js <boxToken>
const http = require('http');
const token = process.argv[2];
http.get({ host: '127.0.0.1', port: 9700, path: '/list?token=' + encodeURIComponent(token), timeout: 30000 }, (res) => {
  let b = '';
  res.setEncoding('utf8');
  res.on('data', (c) => (b += c));
  res.on('end', () => { console.log(b.slice(0, 4000)); });
}).on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
