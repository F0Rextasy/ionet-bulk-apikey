// Probe the shared Mailtrap account's folder/inbox pagination shape.
const mt = require('proxies.txt');
(async () => {
  const folders = await mt.call('GET', '/inbound/folders');
  const fl = Array.isArray(folders.json) ? folders.json : (folders.json && folders.json.data) || [];
  console.log('folders:');
  for (const f of fl) console.log(`  ${f.name} id=${f.id}${f.inboxes_count != null ? ' count=' + f.inboxes_count : ''}`);
  const fid = await mt.folderId('ionet-bulk');
  console.log('ionet-bulk fid =', fid);
  {
    const r = await mt.call('GET', `/inbound/folders/${fid}/inboxes`);
    const list = Array.isArray(r.json) ? r.json : (r.json && r.json.data) || [];
    console.log('raw[0]:', JSON.stringify(list[0]).slice(0, 600));
    console.log('raw[59]:', JSON.stringify(list[59] || list[list.length - 1]).slice(0, 600));
  }
  for (const q of ['', '?page=2', '?page=3', '?per_page=200', '?page=1&per_page=200', '?per_page=100&page=2']) {
    try {
      const r = await mt.call('GET', `/inbound/folders/${fid}/inboxes${q}`);
      const list = Array.isArray(r.json) ? r.json : (r.json && r.json.data) || [];
      console.log(`q="${q}" -> ${r.status} n=${list.length} first=${list[0] && list[0].id} last=${list[list.length - 1] && list[list.length - 1].id}`);
    } catch (e) { console.log(`q="${q}" ERR ${e.message}`); }
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
