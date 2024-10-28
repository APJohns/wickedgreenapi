import puppeteer from 'puppeteer';

export default async function getTransferSize(url: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1900,
    height: 1000,
  });

  let totalTransferSize = 0;

  // Enable network tracking to capture transfer sizes
  const client = await page.createCDPSession();
  await client.send('Network.enable');

  client.on('Network.loadingFinished', async (data) => {
    if (data.encodedDataLength >= 0) {
      totalTransferSize += data.encodedDataLength;
    }
  });

  // Navigate to the page and wait for network activity to finish
  await page.goto(url, { waitUntil: 'networkidle2' });

  await browser.close();
  return totalTransferSize;
}
