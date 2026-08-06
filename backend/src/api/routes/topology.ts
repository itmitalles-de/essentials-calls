import { NextFunction, Request, Response, Router } from 'express';
import { Topology, validateTopology, validateTopologyShape, hasErrors } from '@visual-pbx/shared';
import { loadTopology, saveTopology } from '../../model/store';
import { deployTopology } from '../../asterisk/deploy';
import { computeStatuses } from '../../asterisk/status';

export const topologyRouter = Router();

/** Wraps async handlers so a rejected promise reaches the error middleware instead of killing the process. */
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/**
 * Returns the request body as a Topology, or sends a 400 and returns undefined.
 * The body is untrusted JSON, so it has to pass the structural check before any
 * rule validation dereferences its fields.
 */
function parseTopologyBody(req: Request, res: Response): Topology | undefined {
  const shapeIssues = validateTopologyShape(req.body);
  if (shapeIssues.length > 0) {
    res.status(400).json({ saved: false, deployed: false, issues: shapeIssues });
    return undefined;
  }
  return req.body as Topology;
}

topologyRouter.get('/topology', (_req, res) => {
  res.json(loadTopology());
});

topologyRouter.put('/topology', (req, res) => {
  const topology = parseTopologyBody(req, res);
  if (!topology) return;

  const issues = validateTopology(topology);
  if (hasErrors(issues)) {
    res.status(400).json({ saved: false, issues });
    return;
  }
  saveTopology(topology);
  res.json({ saved: true, issues });
});

topologyRouter.post('/topology/validate', (req, res) => {
  const shapeIssues = validateTopologyShape(req.body);
  if (shapeIssues.length > 0) {
    res.json({ issues: shapeIssues });
    return;
  }
  res.json({ issues: validateTopology(req.body as Topology) });
});

topologyRouter.post(
  '/deploy',
  asyncRoute(async (req, res) => {
    // An empty body means "deploy what is stored"; anything else must be a
    // well-formed topology, which is then saved as the new current state.
    const body = req.body as Record<string, unknown> | undefined;
    const useStored = !body || Object.keys(body).length === 0;

    const topology = useStored ? loadTopology() : parseTopologyBody(req, res);
    if (!topology) return;

    const issues = validateTopology(topology);
    if (hasErrors(issues)) {
      res.status(400).json({ deployed: false, issues });
      return;
    }
    if (!useStored) saveTopology(topology);

    const result = await deployTopology(topology);
    res.json({ deployed: result.reloaded, issues, ...result });
  })
);

topologyRouter.get(
  '/status',
  asyncRoute(async (_req, res) => {
    res.json({ statuses: await computeStatuses(loadTopology()) });
  })
);
