import http from 'node:http';
import { POST as sessionPost, DELETE as sessionDelete } from '../src/app/api/v1/patient-portal/session/route';
import { GET as snapshotGet } from '../src/app/api/v1/patient-portal/snapshot/route';
import { POST as attendancePost } from '../src/app/api/v1/patient-portal/attendance/route';
import { POST as documentsPost } from '../src/app/api/v1/patient-portal/documents/route';
import { GET as documentPageGet } from '../src/app/api/v1/patient-portal/documents/[documentId]/pages/[pageNumber]/route';
import { POST as flagsPost } from '../src/app/api/v1/patient-portal/flags/route';
import { PUT as prepPut } from '../src/app/api/v1/patient-portal/preparation/route';
import { POST as requestsPost } from '../src/app/api/v1/patient-portal/requests/route';
import { GET as caregiversGet, POST as caregiversPost, DELETE as caregiversDelete } from '../src/app/api/v1/patient-portal/caregivers/route';
import { POST as sharesPost, DELETE as sharesDelete } from '../src/app/api/v1/patient-portal/shares/route';
import { POST as voiceTtsPost } from '../src/app/api/v1/patient-portal/voice-tts/route';

const port = Number(process.argv[2] || process.env.PORT || 3000);

function setCors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-actor-role, x-organization-slug');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);

  // Build standard Web Request
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) {
      if (Array.isArray(val)) {
        val.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, val);
      }
    }
  }

  const webReq = new Request(url.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : bodyBuffer,
  });

  try {
    let response: Response | null = null;

    if (pathname === '/api/v1/patient-portal/session') {
      if (req.method === 'POST') response = await sessionPost(webReq);
      else if (req.method === 'DELETE') response = await sessionDelete(webReq);
    } else if (pathname === '/api/v1/patient-portal/snapshot' && req.method === 'GET') {
      response = await snapshotGet(webReq);
    } else if (pathname === '/api/v1/patient-portal/attendance' && req.method === 'POST') {
      response = await attendancePost(webReq);
    } else if (pathname === '/api/v1/patient-portal/documents' && req.method === 'POST') {
      response = await documentsPost(webReq);
    } else if (pathname === '/api/v1/patient-portal/flags' && req.method === 'POST') {
      response = await flagsPost(webReq);
    } else if (pathname === '/api/v1/patient-portal/preparation' && req.method === 'PUT') {
      response = await prepPut(webReq);
    } else if (pathname === '/api/v1/patient-portal/requests' && req.method === 'POST') {
      response = await requestsPost(webReq);
    } else if (pathname === '/api/v1/patient-portal/caregivers') {
      if (req.method === 'GET') response = await caregiversGet(webReq);
      else if (req.method === 'POST') response = await caregiversPost(webReq);
      else if (req.method === 'DELETE') response = await caregiversDelete(webReq);
    } else if (pathname === '/api/v1/patient-portal/shares') {
      if (req.method === 'POST') response = await sharesPost(webReq);
      else if (req.method === 'DELETE') response = await sharesDelete(webReq);
    } else if (pathname === '/api/v1/patient-portal/voice-tts' && req.method === 'POST') {
      response = await voiceTtsPost(webReq);
    } else {
      // Dynamic route regex matching
      const docPageMatch = pathname.match(/^\/api\/v1\/patient-portal\/documents\/([^/]+)\/pages\/([^/]+)$/);
      if (docPageMatch && req.method === 'GET') {
        const [, documentId, pageNumber] = docPageMatch;
        response = await documentPageGet(webReq, {
          params: Promise.resolve({ documentId: documentId!, pageNumber: pageNumber! }),
        });
      }

      const caregiverMatch = pathname.match(/^\/api\/v1\/patient-portal\/caregivers\/([^/]+)$/);
      if (caregiverMatch && req.method === 'DELETE') {
        const [, caregiverId] = caregiverMatch;
        url.searchParams.set('id', caregiverId!);
        const modifiedReq = new Request(url.toString(), {
          method: 'DELETE',
          headers,
        });
        response = await caregiversDelete(modifiedReq);
      }

      const shareMatch = pathname.match(/^\/api\/v1\/patient-portal\/shares\/([^/]+)$/);
      if (shareMatch && req.method === 'DELETE') {
        const [, shareId] = shareMatch;
        url.searchParams.set('id', shareId!);
        const modifiedReq = new Request(url.toString(), {
          method: 'DELETE',
          headers,
        });
        response = await sharesDelete(modifiedReq);
      }
    }

    if (!response) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: `No route for ${req.method} ${pathname}` } }));
      return;
    }

    // Convert Web Response to Node ServerResponse
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    res.writeHead(response.status, resHeaders);
    const resBody = Buffer.from(await response.arrayBuffer());
    res.end(resBody);
  } catch (err: unknown) {
    console.error('Portal server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'internal_error', message: err instanceof Error ? err.message : 'Unknown' } }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`OncoBrief Patient Portal Test Server listening at http://127.0.0.1:${port}`);
});
