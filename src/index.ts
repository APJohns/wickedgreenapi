import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import getTransferSize from './getTransferSize.js';

const app = new Hono();

// https://sustainablewebdesign.org/estimating-digital-emissions/

// Operational
const GRID_CARBON_INTENSITY = 494; // gCO2e/kWh
const ENERGY_INTENSITY_OPDC = 0.055; // kWh/GB
const ENERGY_INTENSITY_OPN = 0.059; // kWh/GB
const ENERGY_INTENSITY_OPUD = 0.08; // kWh/GB

// Embodied
const ENERGY_INTENSITY_EMDC = 0.012; // kWh/GB
const ENERGY_INTENSITY_EMN = 0.013; // kWh/GB
const ENERGY_INTENSITY_EMUD = 0.081; // kWh/GB

// Model Variables
const GREEN_HOSTING_FACTOR = 0;
const NEW_VISITOR_RATIO = 1;
const RETURN_VISITOR_RATIO = 0;
const DATA_CACHE_RATIO = 0.02;

app.get('/', async (c) => {
  const url = c.req.query('url');
  if (url) {
    const transferBytes = await getTransferSize(url);
    const transferGb = transferBytes / 10e8;

    const OPDC = transferGb * ENERGY_INTENSITY_OPDC * GRID_CARBON_INTENSITY;
    const OPN = transferGb * ENERGY_INTENSITY_OPN * GRID_CARBON_INTENSITY;
    const OPUD = transferGb * ENERGY_INTENSITY_OPUD * GRID_CARBON_INTENSITY;

    const EMDC = transferGb * ENERGY_INTENSITY_EMDC * GRID_CARBON_INTENSITY;
    const EMN = transferGb * ENERGY_INTENSITY_EMN * GRID_CARBON_INTENSITY;
    const EMUD = transferGb * ENERGY_INTENSITY_EMUD * GRID_CARBON_INTENSITY;

    const total =
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + EMDC + (OPN + EMN) + (OPUD + EMUD)) * NEW_VISITOR_RATIO +
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + EMDC + (OPN + EMN) + (OPUD + EMUD)) *
        RETURN_VISITOR_RATIO *
        (1 - DATA_CACHE_RATIO);

    return c.json({
      transferSize: transferBytes,
      carbon: total,
    });
  } else {
    return c.body('Invalid url parameter', 400);
  }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
