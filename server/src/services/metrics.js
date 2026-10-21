export async function bucketedMetrics(siteId, sinceTs, bucketSeconds, route) {
  const match = {
    site_id: siteId,
    timestamp: { $gte: sinceTs },
  };

  if (route !== undefined) {
    match.route = route;
  }

  return Metric.aggregate([
    { $match: match },
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
    {
      $project: {
        _id: 0,
        timestamp: '$_id',
        request_count: 1,
      },
    },
  ]);
}

export async function listRoutes(siteId, sinceTs) {
  return Metric.aggregate([
    {
      $match: {
        site_id: siteId,
        timestamp: { $gte: sinceTs },
        route: { $type: 'string' },
      },
    },
    {
      $group: {
        _id: '$route',
        total: { $sum: '$request_count' },
      },
    },
    { $sort: { total: -1, _id: 1 } },
    {
      $project: {
        _id: 0,
        route: '$_id',
        total: 1,
      },
    },
  ]);
}
