import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { SimulatedAbdmGatewayAdapter } from '../src/simulated-abdm-gateway';

it('releases only committed request callbacks and preserves order under concurrent drains', async () => {
  const paths: string[] = [];
  let acknowledged = false;
  const server = createServer(async (req, res) => {
    paths.push(req.url!);
    // Delay ACK completion so a concurrent grant delivery would fail.
    if (req.url!.endsWith('on-init')) {
      await new Promise(resolve => setTimeout(resolve, 20));
      acknowledged = true;
    }
    res.writeHead(req.url!.endsWith('notify') && !acknowledged ? 400 : 202);
    res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const adapter = new SimulatedAbdmGatewayAdapter({ dispatchDirectHttp: true,
    callbackBaseUrl: `http://127.0.0.1:${address.port}` });
  const input = { timestamp: new Date().toISOString(), patientAbhaAddress: 'synthetic@sbx',
    purposeCode: 'CAREMGT', purposeText: 'Care Management', hiTypes: ['DiagnosticReport'],
    dateRange: { from: '2026-01-01', to: '2026-10-01' }, dataEraseAt: '2027-01-01', requester: { name: 'Synthetic Clinician' } };
  try {
    await adapter.initiateConsentRequest({ ...input, requestId: 'committed' });
    await adapter.initiateConsentRequest({ ...input, requestId: 'not-committed' });
    await Promise.all([adapter.flushCallbacks('committed'), adapter.flushCallbacks('committed')]);
    expect(paths).toEqual(['/api/v3/hiu/consent/request/on-init', '/api/v3/hiu/consent/request/notify']);
    await adapter.flushCallbacks('not-committed');
    expect(paths).toHaveLength(4);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
