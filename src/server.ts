import express from 'express';
import { initSchema } from './db.js';
import { authMiddleware } from './auth.js';
import { ordersRouter } from './routes/orders.js';
import { revenueRouter } from './routes/revenue.js';
import { metricsRouter } from './routes/metrics.js';
import { webhooksRouter } from './routes/webhooks.js';
import { seedIfEmpty } from './scripts/seed.js';

initSchema();
seedIfEmpty();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/orders', authMiddleware, ordersRouter);
app.use('/api/revenue', authMiddleware, revenueRouter);
app.use('/api/metrics', authMiddleware, metricsRouter);
app.use('/api/webhooks', authMiddleware, webhooksRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`dashboard server listening on http://localhost:${PORT}`);
});