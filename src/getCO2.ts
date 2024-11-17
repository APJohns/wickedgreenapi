import { co2 } from '@tgwf/co2';
import getTransferSize from './getTransferSize.js';
import type { StatusCode } from 'hono/utils/http-status';
import type { Report } from './types.js';

export interface Options {
  skipGreenCheck?: boolean;
  dataCacheRatio?: number;
  returnVisitorRatio?: number;
  greenHostingFactor?: number;
  gridIntensity?: {
    device?: number | { country: string };
    dataCenter?: number | { country: string };
    networks?: number | { country: string };
  };
}

// Options renamed for co2js package
export interface SWDOptions {
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

export async function getCO2(url: string, options: Options = {}) {
  const isRatioValid = (value: number | undefined) => {
    return value !== undefined && (value >= 0 || value <= 1);
  };
  const { skipGreenCheck, ...modelOptions } = options;
  // Get size of transferred files
  let transferBytes: number;
  try {
    transferBytes = await getTransferSize(url);
  } catch (e) {
    return {
      error: {
        message: 'Error loading the page',
        code: 500 as StatusCode,
      },
    };
  }

  // Get carbon estimate
  const carbon = new co2({ model: 'swd', version: 4, rating: true });

  const co2Options: SWDOptions = {
    dataReloadRatio: isRatioValid(options.dataCacheRatio) ? options.dataCacheRatio : 0.02,
    firstVisitPercentage: isRatioValid(options.returnVisitorRatio) ? 1 - options.returnVisitorRatio! : 1,
    returnVisitPercentage: isRatioValid(options.returnVisitorRatio) ? options.returnVisitorRatio : 0,
  };

  if (Object.keys(options?.gridIntensity || {}).length > 0) {
    co2Options.gridIntensity = options?.gridIntensity as SWDOptions['gridIntensity'];
  }

  if (isRatioValid(options.greenHostingFactor)) {
    co2Options.greenHostingFactor = options.greenHostingFactor;
  }

  const getGreenCheck = async (): Promise<any> => {
    // Check if host is green
    console.log('Getting host information from greencheck API');
    const res = await fetch(
      `https://api.thegreenwebfoundation.org/greencheck/${new URL(url).host.replace('www.', '')}`
    );
    return await res.json();
  };

  let hosting;
  if (isRatioValid(options.greenHostingFactor)) {
    hosting = {
      green: options.greenHostingFactor === 1,
    };
  } else {
    if (!skipGreenCheck) {
      hosting = await getGreenCheck();
    }
  }

  const estimate = carbon.perVisitTrace(
    transferBytes,
    isRatioValid(options.greenHostingFactor) || skipGreenCheck ? undefined : hosting.green,
    co2Options
  );

  const result = {
    report: estimate as unknown as Report,
    hosting,
    lastUpdated: Date.now(),
  };

  return {
    data: result,
  };
}
