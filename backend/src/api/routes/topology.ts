import { Router } from 'express';
import { Topology, validateTopology, hasErrors } from '@visual-pbx/shared';
import { loadTopology, saveTopology } from '../../model/store';
import { deployTopology } from '../../asterisk/deploy';
import { computeStatuses } from '../../asterisk/status';

export const topologyRouter = Router();

topologyRouter.get('/topology', (_req, res) => {
  res.json(loadTopology());
});

topologyRouter.put('/topology', (req, res) => {
  const topology = req.body as Topology;
  const issues = validateTopology(topology);
  if (hasErrors(issues)) {
    res.status(400).json({ saved: false, issues });
    return;
  }
  saveTopology(topology);
  res.json({ saved: true, issues });
});

topologyRouter.post('/topology/validate', (req, res) => {
  const topology = req.body as Topology;
  res.json({ issues: validateTopology(topology) });
});

topologyRouter.post('/deploy', async (req, res) => {
  const body = req.body as Partial<Topology> | undefined;
  const topology = body && Array.isArray(body.nodes) ? (body as Topology) : loadTopology();
  const issues = validateTopology(topology);
  if (hasErrors(issues)) {
    res.status(400).json({ deployed: false, issues });
    return;
  }
  saveTopology(topology);
  const result = await deployTopology(topology);
  res.json({ deployed: result.reloaded, issues, ...result });
});

topologyRouter.get('/status', async (_req, res) => {
  const topology = loadTopology();
  res.json({ statuses: await computeStatuses(topology) });
});
