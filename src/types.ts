export type Report = {
  co2: {
    total: number;
    rating?: string;
  };
  green: boolean;
  variables: {
    description: string;
    bytes: number;
    gridIntensity: {
      description: string;
      device: {
        country?: string;
        value: number;
      };
      dataCenter: {
        country?: string;
        value: number;
      };
      network: {
        country?: string;
        value: number;
      };
    };
    dataReloadRatio: number;
    firstVisitPercentage: number;
    returnVisitPercentage: number;
    greenHostingFactor: number;
  };
};
