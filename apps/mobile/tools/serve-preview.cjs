const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../dist');
http.createServer((req,res) => {
  let file=path.resolve(root,`.${decodeURIComponent((req.url || '/').split('?')[0])}`);
  if (!file.startsWith(`${root}${path.sep}`) && file!==root) { res.writeHead(403).end();return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
  const type=({ '.js':'application/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.css':'text/css','.ttf':'font/ttf' })[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200,{ 'Content-Type':type,'Cache-Control':'no-store' });fs.createReadStream(file).pipe(res);
}).listen(Number(process.argv[2] || 8086),'127.0.0.1',() => process.stdout.write(`OncoBrief mobile preview: http://127.0.0.1:${process.argv[2] || 8086}\n`));
