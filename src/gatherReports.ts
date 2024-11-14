import type { SupabaseClient } from '@supabase/supabase-js';
import { getCO2 } from './getCO2.js';

export default async function gatherReports(urls: any[], supabase: SupabaseClient) {
  for (const u of urls) {
    const { data, error } = await getCO2(u.url, {
      skipGreenCheck: true,
    });
    if (error) {
      console.error(error);
    }
    const { error: dbError } = await supabase.from('reports').insert({
      url_id: u.id,
      user_id: u.user_id,
      co2: data?.report.co2.total,
      rating: data?.report.co2.rating,
      bytes: data?.report.variables.bytes,
      data_cache_ratio: data?.report.variables.dataReloadRatio,
      return_visitor_ratio: data?.report.variables.returnVisitPercentage,
      green_hosting_factor: data?.report.variables.greenHostingFactor,
      grid_intensity: {
        device: data?.report.variables.gridIntensity.device,
        dataCenter: data?.report.variables.gridIntensity.dataCenter,
        network: data?.report.variables.gridIntensity.network,
      },
    });

    if (dbError) {
      console.error(error);
    }
  }
}
