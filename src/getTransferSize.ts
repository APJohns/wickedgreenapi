import lighthouse from 'lighthouse';
import puppeteer, { HTTPResponse } from 'puppeteer';

export default async function getTransferSize(url: string) {
  contentLength(url);
  return listenReqs(url);
  // const perf = getPerformanceMetrics(url);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({
    width: 1900,
    height: 1000,
  });
  const runnerResult = await lighthouse(
    url,
    {
      logLevel: 'error',
      output: 'json',
      onlyAudits: ['network-requests'],
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
  // requests.items.forEach((item) => console.log(item.url, item.transferSize));
  return requests.items.reduce((acc, curr) => acc + curr.transferSize, 0);
}

// Original method for getting transfer size, less accurate than using lighthouse.
// Can we improve accuracy? Is it faster than lighthouse?
export async function getPerformanceMetrics(url: string) {
  const browser = await puppeteer.launch({ headless: true });
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
    return performance.getEntries().map((entry) => ({
      name: (entry as PerformanceResourceTiming).name,
      transferSize: (entry as PerformanceResourceTiming).transferSize, // Compressed size
      decodedBodySize: (entry as PerformanceResourceTiming).decodedBodySize, // Uncompressed size
      encodedBodySize: (entry as PerformanceResourceTiming).encodedBodySize, // Encoded body size (same as transfer size if compressed)
    }));
  });
  console.log(performanceData);

  let totalCompressedSize = 0;
  let totalUncompressedSize = 0;
  let decodedBodySize = 0;
  let encodedBodySize = 0;

  // Accumulate the sizes for both compressed and uncompressed data
  performanceData.forEach((resource, i) => {
    // console.log(i, resource.name);
    totalCompressedSize += resource.transferSize || 0;
    totalUncompressedSize += resource.decodedBodySize || 0;
    decodedBodySize += resource.decodedBodySize || 0;
    encodedBodySize += resource.encodedBodySize || 0;
    // console.log(`Resource: ${resource.name}`);
    // console.log(`   Compressed Size: ${resource.transferSize} bytes`);
    // console.log(`   Uncompressed Size: ${resource.decodedBodySize} bytes`);
  });

  console.log(`Total Compressed Size: ${totalCompressedSize} bytes`);
  console.log(`Total Uncompressed Size: ${totalUncompressedSize} bytes`);
  console.log(`Total Decoded Size: ${decodedBodySize} bytes`);
  console.log(`Total Encocded Size: ${encodedBodySize} bytes`);

  await browser.close();

  return totalUncompressedSize;
}

export async function contentLength(url: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({
    width: 1900,
    height: 1000,
  });

  let pageTotalBytes = 0;
  let contentLength = 0;
  let i = 0;

  const reses: { url: string; length: number }[] = [];

  const sumBytes = async (response: HTTPResponse) => {
    // console.log(++i, response.url());
    const length = Number(response.headers()['content-length']);
    reses.push({ url: response.url(), length });
    if (!isNaN(length)) {
      contentLength += length;
    }
  };
  page.on('response', sumBytes);

  // Navigate to the page and wait for network activity to finish
  await page.goto(url, { waitUntil: 'networkidle2' });

  page.off('response', sumBytes);
  // console.log('total', pageTotalBytes);
  reses.sort((a, b) => a.length - b.length);
  // console.log(reses);
  console.log('content-length', contentLength);

  await browser.close();

  /* let totalCompressedSize = 0;
  let totalUncompressedSize = 0;

  // Accumulate the sizes for both compressed and uncompressed data
  performanceData.forEach((resource) => {
    totalCompressedSize += resource.transferSize || 0;
    totalUncompressedSize += resource.decodedBodySize || 0;
  });

  console.log(`Total Compressed Size: ${totalCompressedSize} bytes`);
  console.log(`Total Uncompressed Size: ${totalUncompressedSize} bytes`);

  await browser.close();

  return totalUncompressedSize; */
}

export async function listenReqs(url: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1900,
    height: 1000,
  });

  let pageTotalBytes = 0;
  let responseSize = 0;
  let loadedSize = 0;
  let i = 0;
  let totalTransferSize = 0;

  // Enable network tracking to capture transfer sizes
  const client = await page.createCDPSession();
  await client.send('Network.enable');

  // Listen to responseReceived event to get transfer size of each resource
  client.on('Network.responseReceived', async (response) => {
    if (response.response.encodedDataLength >= 0) {
      responseSize += response.response.encodedDataLength;
    }

    // console.log(response.response.mimeType, response.response.url);
    // console.log(`Transfer Size: ${response.response.encodedDataLength} bytes`);
  });

  client.on('Network.loadingFinished', async (data) => {
    i++;
    if (data.encodedDataLength >= 0) {
      loadedSize += data.encodedDataLength;
    }

    // console.log(`URL: ${data.}`);
    // console.log(`Loaded Size: ${data.encodedDataLength} bytes`);
    // console.log(data.encodedDataLength);
  });

  // Navigate to the page and wait for network activity to finish
  await page.goto(url, { waitUntil: 'networkidle2' });

  await browser.close();
  console.log(loadedSize);
  return loadedSize;
  // console.log(`Total Transfer Size for ${url}: ${totalTransferSize} bytes with ${i} requests`);
}
