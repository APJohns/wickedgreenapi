import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { co2 } from '@tgwf/co2';
import getTransferSize from './getTransferSize.js';

const app = new Hono();

/* const KWG_PER_GB = 1.805;
const RETURNING_VISITOR_PERCENTAGE = 0.75;
const FIRST_TIME_VIEWING_PERCENTAGE = 0.25;
const PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD = 0.02;
const CARBON_PER_KWG_GRID = 475;
const CARBON_PER_KWG_RENEWABLE = 33.4;
const PERCENTAGE_OF_ENERGY_IN_DATACENTER = 0.1008;
const PERCENTAGE_OF_ENERGY_IN_TRANSMISSION_AND_END_USER = 0.8992;
const CO2_GRAMS_TO_LITRES = 0.5562; */

// https://sustainablewebdesign.org/estimating-digital-emissions/
const GRID_CARBON_INTENSITY = 494; // gCO2e/kWh
const ENERGY_INTENSITY_OPDC = 0.055; // kWh/GB
const ENERGY_INTENSITY_OPN = 0.059; // kWh/GB
const ENERGY_INTENSITY_OPUD = 0.08; // kWh/GB

const ENERGY_INTENSITY_EMDC = 0.012; // kWh/GB
const ENERGY_INTENSITY_EMN = 0.013; // kWh/GB
const ENERGY_INTENSITY_EMUD = 0.081; // kWh/GB

const GREEN_HOSTING_FACTOR = 0;
const NEW_VISITOR_RATIO = 1;
const RETURN_VISITOR_RATIO = 0;
const DATA_CACHE_RATIO = 0.02;

app.get('/', async (c) => {
  const url = c.req.query('url');
  if (url) {
    const transferSize = (await getTransferSize(url)) / 10e8;
    const OPDC = transferSize * ENERGY_INTENSITY_OPDC * GRID_CARBON_INTENSITY;
    const OPN = transferSize * ENERGY_INTENSITY_OPN * GRID_CARBON_INTENSITY;
    const OPUD = transferSize * ENERGY_INTENSITY_OPUD * GRID_CARBON_INTENSITY;

    const EMDC = transferSize * ENERGY_INTENSITY_EMDC * GRID_CARBON_INTENSITY;
    const EMN = transferSize * ENERGY_INTENSITY_EMN * GRID_CARBON_INTENSITY;
    const EMUD = transferSize * ENERGY_INTENSITY_EMUD * GRID_CARBON_INTENSITY;

    const em =
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + OPN + OPUD) * NEW_VISITOR_RATIO +
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + OPN + OPUD) * RETURN_VISITOR_RATIO * (1 - DATA_CACHE_RATIO);
    const total =
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + EMDC + (OPN + EMN) + (OPUD + EMUD)) * NEW_VISITOR_RATIO +
      (OPDC * (1 - GREEN_HOSTING_FACTOR) + EMDC + (OPN + EMN) + (OPUD + EMUD)) *
        RETURN_VISITOR_RATIO *
        (1 - DATA_CACHE_RATIO);

    const swdmV4 = new co2({ model: 'swd', version: 4 });
    const onebyte = new co2({ model: '1byte' });

    return c.json({
      transferSize: (transferSize * 10e5).toFixed(2) + 'kb',
      'custom-swd': total,
      'pkg-swd': swdmV4.perByte(transferSize * 10e8),
      'pkg-1byte': onebyte.perByte(transferSize * 10e8),
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
