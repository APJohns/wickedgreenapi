import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { createClient } from '@supabase/supabase-js';
import { averageIntensity } from '@tgwf/co2';
import { getCO2, type Options } from './getCO2.js';
import gatherReports from './gatherReports.js';
import 'dotenv/config';

const app = new Hono();

app.use('/*', cors());
app.use('/co2/*', bearerAuth({ token: process.env.TOKEN as string }));

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
    try {
      new URL(url);
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

    const options: Options = {
      dataCacheRatio: dataCacheRatio ? dataCacheRatio : 0.02,
      returnVisitorRatio: returnVisitorRatio ? returnVisitorRatio : 0,
    };

    if (Object.keys(gridIntensity).length > 0) {
      options.gridIntensity = gridIntensity as Options['gridIntensity'];
    }

    if (greenHostingFactor) {
      options.greenHostingFactor = greenHostingFactor;
    }

    const co2Report = await getCO2(url, options);
    if (co2Report.error) {
      return c.text(co2Report.error.message, co2Report.error.code);
    }

    console.log(co2Report.data);
    cache.set(c.req.url, co2Report.data);
    return c.json(co2Report.data);
  } else {
    return c.text('Invalid url parameter', 400);
  }
});

app.get('/co2/gather', async (c) => {
  const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_KEY as string);
  const { data, error } = await supabase.from('urls').select('*, projects(id)').order('project_id');
  if (error) {
    console.error(error);
  }
  if (data) {
    console.log(`Gathering reports for ${data.length} URLs`);
    gatherReports(data, supabase);
  }

  return c.text(`Gathering reports for ${data?.length ? data.length : 0} URLs`);
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
