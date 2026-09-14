import { platformOpsRouter } from './platform-ops.js';
// Connections (Relay): organisations at <slug>.connections.kaushalstack.com.
export default platformOpsRouter({ key: 'connections', label: 'Connections', envPrefix: 'CONNECTIONS', upstream: '/api/operator/orgs' });
