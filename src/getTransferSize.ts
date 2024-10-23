import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer';

export default async function getTransferSize(url: string) {
  // const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({
    width: 1900,
    height: 1000,
  });
  const runnerResult = await lighthouse(
    url,
    {
      logLevel: 'error',
      output: 'json',
      // onlyCategories: ['performance'],
      onlyAudits: ['network-requests'],
      // port: chrome.port,
      screenEmulation: {
        width: 1900,
        height: 1000,
      },
    },
    undefined,
    page
  );

  await browser.close();

  interface Reqs {
    items: {
      url: string;
      sessionTargetType: string;
      protocol: string;
      rendererStartTime: number;
      networkRequestTime: number;
      networkEndTime: number;
      finished: boolean;
      transferSize: number;
      resourceSize: number;
      statusCode: number;
      mimeType: string;
      resourceType: string;
      priority: string;
      entity: string;
    }[];
  }

  const requests = runnerResult?.lhr.audits['network-requests'].details as unknown as Reqs;
  return requests.items.reduce((acc, curr) => acc + curr.transferSize, 0);
}

// Original method for getting transfer size, less accurate than using lighthouse.
// Can we improve accuracy? Is it faster than lighthouse?
export async function getPerformanceMetrics(url: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({
    width: 1900,
    height: 1000,
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
    // console.log(`Resource: ${resource.name}`);
    // console.log(`   Compressed Size: ${resource.transferSize} bytes`);
    // console.log(`   Uncompressed Size: ${resource.decodedBodySize} bytes`);
  });

  console.log(`Total Compressed Size: ${totalCompressedSize} bytes`);
  console.log(`Total Uncompressed Size: ${totalUncompressedSize} bytes`);

  await browser.close();

  return totalUncompressedSize;
}
