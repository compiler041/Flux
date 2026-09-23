import { Metric } from '../models/Metric.js';

/**
 * Time series for a site, bucketed into fixed-width buckets so the chart stays
 * readable no matter how chatty the agents are.
 * @returns {Promise<Array<{timestamp:number, request_count:number}>>}
 */
export async function bucketedMetrics(siteId, sinceTs, bucketSeconds) {
  const rows = await Metric.aggregate([
    { $match: { site_id: siteId, timestamp: { $gte: sinceTs } } },
    {
      $group: {
        _id: {
          $multiply: [
            { $floor: { $divide: ['$timestamp', bucketSeconds] } },
            bucketSeconds,
          ],
        },
        request_count: { $sum: '$request_count' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, timestamp: '$_id', request_count: 1 } },
  ]);
  return rows;
}

/** Total requests for a site since `sinceTs`. */
export async function sumSince(siteId, sinceTs) {
  const [row] = await Metric.aggregate([
    { $match: { site_id: siteId, timestamp: { $gte: sinceTs } } },
    { $group: { _id: null, total: { $sum: '$request_count' } } },
  ]);
  return row?.total ?? 0;
}
