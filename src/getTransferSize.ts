import puppeteer from 'puppeteer';

export default async function getTransferSize(url: string) {
  let totalTransferSize = 0;
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1900, height: 1000 });

    // Enable network tracking to capture transfer sizes
    const client = await page.createCDPSession();
    await client.send('Network.enable');

    const onLoadingFinished = (data: { encodedDataLength: number }) => {
      if (data.encodedDataLength >= 0) {
        totalTransferSize += data.encodedDataLength;
      }
    };
    client.on('Network.loadingFinished', onLoadingFinished);

    try {
      // Navigate to the page and wait for network activity to finish
      await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (e) {
      console.error(`Failed to load page: ${e}`);
    } finally {
      // Remove event listener and close the CDP session
      client.off('Network.loadingFinished', onLoadingFinished);
      await client.detach();
    }
  } catch (e) {
    console.error(`Error setting up Puppeteer: ${e}`);
  } finally {
    await browser.close();
  }

  return totalTransferSize;
}
