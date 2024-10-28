import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { co2 } from '@tgwf/co2';
import getTransferSize from './getTransferSize.js';
import 'dotenv/config';

interface SWDOptions {
  dataReloadRatio?: number;
  firstVisitPercentage?: number;
  returnVisitPercentage?: number;
  greenHostingFactor?: number;
  girdIntensity?: {
    device?: number;
    dataCenter?: number;
    networks?: number;
  };
}

const app = new Hono();

app.use('/*', cors());
app.use('/*', bearerAuth({ token: process.env.TOKEN as string }));

// https://sustainablewebdesign.org/estimating-digital-emissions/
app.get('/carbon', async (c) => {
  console.log('GET Carbon');
  const url = c.req.query('url');
  console.log(url);
  if (url) {
    // Get size of transferred files
    const transferBytes = await getTransferSize(url);
    console.log('transferBytes', transferBytes);

    // Check if host is green
    const domain = new URL(url);
    const res = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${domain.host.replace('www.', '')}`);
    const greenCheck = await res.json();
    console.log('greenCheck', greenCheck);

    // Get carbon estimate
    const carbon = new co2({ model: 'swd', version: 4, rating: true });
    const options: SWDOptions = {
      dataReloadRatio: 0.02,
      firstVisitPercentage: 1,
      returnVisitPercentage: 0,
    };
    const estimate = carbon.perVisitTrace(transferBytes, greenCheck.green, options);
    console.log(estimate);
    return c.json({
      report: estimate,
      hosting: greenCheck,
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
