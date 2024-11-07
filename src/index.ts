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
app.use('/carbon', bearerAuth({ token: process.env.TOKEN as string }));

const cache = new Map();

// https://sustainablewebdesign.org/estimating-digital-emissions/
app.get('/carbon', async (c) => {
  console.log('GET Carbon');
  const url = c.req.query('url');
  console.log(url);
  if (url) {
    // Ensure url is an actual url
    let domain: URL;
    try {
      domain = new URL(url);
    } catch (e) {
      return c.text('Invalid url parameter', 400);
    }

    let deletedReports = 0;
    // Check in-memory cache and delete reports older than 10 minutes
    cache.forEach((report) => {
      if (Date.now() - report.lastUpdated > 60000 * 10) {
        cache.delete(url);
        deletedReports++;
      }
    });
    console.log(`Deleted ${deletedReports} expired reports from cache`);

    // Check in-memory cache for url
    const cachedResult = cache.get(url);
    if (cachedResult) {
      console.log('Found cached report', cachedResult);
      return c.json(cachedResult);
    }

    // Get size of transferred files
    let transferBytes: number;
    try {
      transferBytes = await getTransferSize(url);
    } catch (e) {
      return c.text('Error loading the page', 500);
    }

    // Check if host is green
    const res = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${domain.host.replace('www.', '')}`);
    const greenCheck = await res.json();

    // Get carbon estimate
    const carbon = new co2({ model: 'swd', version: 4, rating: true });
    const options: SWDOptions = {
      dataReloadRatio: 0.02,
      firstVisitPercentage: 1,
      returnVisitPercentage: 0,
    };
    const estimate = carbon.perVisitTrace(transferBytes, greenCheck.green, options);

    const result = {
      report: estimate,
      hosting: greenCheck,
      lastUpdated: Date.now(),
    };
    cache.set(url, result);
    console.log(result);
    return c.json(result);
  } else {
    return c.text('Invalid url parameter', 400);
  }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
