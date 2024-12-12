import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCO2 } from './getCO2.js';
import type { Database, Tables, TablesInsert } from './database.types.js';

interface URL extends Tables<'urls'> {
  projects: Pick<Tables<'projects'>, 'id' | 'report_frequency'> | null;
}

export default async function gatherReports(projectID?: string, userID?: string) {
  let lastProject = '';
  let batchID = '';

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_KEY as string
  );

  async function getURLs() {
    if (projectID && userID) {
      return await supabase
        .from('urls')
        .select('*, projects(id, report_frequency)')
        .eq('user_id', userID)
        .eq('project_id', projectID);
    } else {
      return await supabase.from('urls').select('*, projects(id, report_frequency)').order('project_id');
    }
  }

  const { data, error } = await getURLs();
  if (error) {
    console.error(error);
    return null;
  }
  if (!data) {
    return null;
  }

  const reports: TablesInsert<'reports'>[] = [];

  async function getReport(url: URL) {
    if (url.projects) {
      if (url.project_id !== lastProject) {
        const { data: batch } = await supabase
          .from('batches')
          .insert({
            user_id: url.user_id,
            project_id: url.projects.id,
            source: userID && projectID ? 'manual' : 'auto',
          })
          .select()
          .single();
        if (batch) {
          batchID = batch.id;
        }
        lastProject = url.project_id;
      }
      const { data, error } = await getCO2(url.url, {
        greenHostingFactor: url.green_hosting_factor,
      });
      if (error) {
        console.error(error);
      }
      if (data) {
        reports.push({
          url_id: url.id,
          user_id: url.user_id,
          batch_id: batchID,
          co2: data.report.co2.total,
          rating: data.report.co2.rating || '',
          bytes: data.report.variables.bytes,
          data_cache_ratio: data.report.variables.dataReloadRatio,
          return_visitor_ratio: data.report.variables.returnVisitPercentage,
          green_hosting_factor: data.report.variables.greenHostingFactor,
          grid_intensity: {
            device: data.report.variables.gridIntensity.device,
            dataCenter: data.report.variables.gridIntensity.dataCenter,
            network: data.report.variables.gridIntensity.network,
          },
        });
      }
    }
  }

  console.log(`Gathering reports for ${data.length} URLs`);
  for (const u of data) {
    if (u.projects) {
      if (userID && projectID) {
        await getReport(u);
      } else {
        switch (u.projects.report_frequency) {
          case 'daily':
            await getReport(u);
            break;
          case 'weekly':
            // Run on Mondays
            if (new Date().getUTCDay() === 1) {
              await getReport(u);
            }
            break;
          case 'monthly':
            // Run every first day of the month
            if (new Date().getUTCDate() === 1) {
              await getReport(u);
            }
            break;

          default:
            break;
        }
      }
    }
  }

  const { error: dbError } = await supabase.from('reports').insert(reports);

  if (dbError) {
    console.error(error);
  } else {
    console.log(`Successfully gathered ${reports.length} reports`);
  }
}
