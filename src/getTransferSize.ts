import puppeteer from 'puppeteer';

interface Resource {
  url: string;
  transferSize: number;
  mimeType: string;
}

export interface RequestData {
  resources: Resource[];
  totalTransferSize: number;
}

export default async function getTransferSize(url: string): Promise<RequestData> {
  let totalTransferSize = 0;
  const resources: Resource[] = [];
  const requestIdToUrl: { [key: string]: { url: string; mimeType: string } } = {};
  const browser = await puppeteer.launch({ headless: true, args: ['--incognito'] });
  try {
    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1900, height: 1000 });

    // Enable network tracking to capture transfer sizes
    const client = await page.createCDPSession();
    await client.send('Network.enable');

    const onResponseReceived = (params: { response: { url: string; mimeType: string }; requestId: string }) => {
      const { url, mimeType } = params.response;
      requestIdToUrl[params.requestId] = { url, mimeType };
    };

    const onLoadingFinished = (data: { encodedDataLength: number; requestId: string }) => {
      const { requestId, encodedDataLength } = data;
      const resource = requestIdToUrl[requestId];
      if (resource) {
        resources.push({
          url: resource.url,
          transferSize: encodedDataLength,
          mimeType: resource.mimeType,
        });
        totalTransferSize += encodedDataLength;
      }
    };

    client.on('Network.responseReceived', onResponseReceived);
    client.on('Network.loadingFinished', onLoadingFinished);

    try {
      // Navigate to the page and wait for network activity to finish
      await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (e) {
      console.error(`Failed to load page: ${e}`);
    } finally {
      // Remove event listener and close the CDP session
      client.off('Network.loadingFinished', onLoadingFinished);
      client.off('Network.responseReceived', onResponseReceived);
      await client.detach();
    }
  } catch (e) {
    console.error(`Error setting up Puppeteer: ${e}`);
  } finally {
    await browser.close();
  }

  return {
    resources,
    totalTransferSize,
  };
}
