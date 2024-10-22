import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import puppeteer from 'puppeteer';

const app = new Hono();

async function getPerformanceMetrics(url: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({
    width: 800,
    height: 800,
    deviceScaleFactor: 1,
  });

  // Navigate to the page and wait for network activity to finish
  await page.goto(url, { waitUntil: 'networkidle2' });

  // Use the Chrome DevTools Protocol to gather performance metrics
  const performanceData = await page.evaluate(() => {
    // Extract performance entries for all network resources
    return performance.getEntriesByType('resource').map((entry) => ({
      name: (entry as PerformanceResourceTiming).name,
      transferSize: (entry as PerformanceResourceTiming).transferSize, // Compressed size
      decodedBodySize: (entry as PerformanceResourceTiming).decodedBodySize, // Uncompressed size
      encodedBodySize: (entry as PerformanceResourceTiming).encodedBodySize, // Encoded body size (same as transfer size if compressed)
    }));
  });

  let totalCompressedSize = 0;
  let totalUncompressedSize = 0;

  // Accumulate the sizes for both compressed and uncompressed data
  performanceData.forEach((resource) => {
    totalCompressedSize += resource.transferSize || 0;
    totalUncompressedSize += resource.decodedBodySize || 0;
    console.log(`Resource: ${resource.name}`);
    console.log(`   Compressed Size: ${resource.transferSize} bytes`);
    console.log(`   Uncompressed Size: ${resource.decodedBodySize} bytes`);
  });

  console.log(`Total Compressed Size: ${totalCompressedSize} bytes`);
  console.log(`Total Uncompressed Size: ${totalUncompressedSize} bytes`);

  await browser.close();

  return totalCompressedSize;
}

app.get('/', async (c) => {
  const url = c.req.query('url');
  if (url) {
    const transferSize = await getPerformanceMetrics(url);
    return c.text(transferSize + '');
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
