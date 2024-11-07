import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { co2, averageIntensity } from '@tgwf/co2';
import getTransferSize from './getTransferSize.js';
import 'dotenv/config';

interface SWDOptions {
  dataReloadRatio?: number;
  firstVisitPercentage?: number;
  returnVisitPercentage?: number;
  greenHostingFactor?: number;
  gridIntensity?: {
    device?: number | { country: string };
    dataCenter?: number | { country: string };
    networks?: number | { country: string };
  };
}

const app = new Hono();

app.use('/*', cors());
app.use('/co2', bearerAuth({ token: process.env.TOKEN as string }));

const cache = new Map();

// https://sustainablewebdesign.org/estimating-digital-emissions/
app.get('/co2', async (c) => {
  console.log('GET CO2', c.req.url);

  const parseQuery = (query: string | undefined): number | undefined => {
    if (query) {
      const parsedQuery = parseFloat(query);
      if (isNaN(parsedQuery)) {
        return -1;
      } else {
        return parsedQuery;
      }
    } else {
      return undefined;
    }
  };

  const greenHostingFactor = parseQuery(c.req.query('greenHostingFactor'));
  if (greenHostingFactor && (greenHostingFactor < 0 || greenHostingFactor > 1)) {
    return c.text(`Invalid greenHostingFactor: Must be between 0 and 1.`, 400);
  }

  const dataCacheRatio = parseQuery(c.req.query('dataCacheRatio'));
  if (dataCacheRatio && (dataCacheRatio < 0 || dataCacheRatio > 1)) {
    return c.text(`Invalid dataCacheRatio: Must be between 0 and 1.`, 400);
  }

  const returnVisitorRatio = parseQuery(c.req.query('returnVisitorRatio'));
  if (returnVisitorRatio && (returnVisitorRatio < 0 || returnVisitorRatio > 1)) {
    return c.text(`Invalid returnVisitorRatio: Must be between 0 and 1.`, 400);
  }

  const gridIntensity = {
    device: {
      country: c.req.query('device')?.toUpperCase(),
    },
    dataCenter: {
      country: c.req.query('dataCenter')?.toUpperCase(),
    },
    network: {
      country: c.req.query('network')?.toUpperCase(),
    },
  };

  for (const segment in gridIntensity) {
    const country = gridIntensity[segment as keyof typeof gridIntensity].country;
    if (!country) {
      delete gridIntensity[segment as keyof typeof gridIntensity];
    } else if (!Object.keys(averageIntensity.data).includes(country)) {
      delete gridIntensity[segment as keyof typeof gridIntensity];
      return c.text(`Invalid country code "${country}": Use an Alpha-3 ISO country code.`, 400);
    }
  }

  const url = c.req.query('url');
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
        cache.delete(c.req.url);
        deletedReports++;
      }
    });
    console.log(`Deleted ${deletedReports} expired reports from cache`);

    // Check in-memory cache for url
    const cachedResult = cache.get(c.req.url);
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

    // Get carbon estimate
    const carbon = new co2({ model: 'swd', version: 4, rating: true });

    const options: SWDOptions = {
      dataReloadRatio: dataCacheRatio ? dataCacheRatio : 0.02,
      firstVisitPercentage: returnVisitorRatio ? 1 - returnVisitorRatio : 1,
      returnVisitPercentage: returnVisitorRatio ? returnVisitorRatio : 0,
    };

    if (Object.keys(gridIntensity).length > 0) {
      options.gridIntensity = gridIntensity as SWDOptions['gridIntensity'];
    }

    if (greenHostingFactor) {
      options.greenHostingFactor = greenHostingFactor;
    }

    const getGreenCheck = async (): Promise<any> => {
      // Check if host is green
      console.log('Getting host information from greencheck API');
      const res = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${domain.host.replace('www.', '')}`);
      return await res.json();
    };

    let hosting;
    if (greenHostingFactor) {
      hosting = {
        green: greenHostingFactor === 1,
      };
    } else {
      hosting = await getGreenCheck();
    }

    const estimate = carbon.perVisitTrace(transferBytes, greenHostingFactor ? undefined : hosting.green, options);

    const result = {
      report: estimate,
      hosting,
      lastUpdated: Date.now(),
    };

    cache.set(c.req.url, result);
    console.log(result.report.variables.gridIntensity);
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
