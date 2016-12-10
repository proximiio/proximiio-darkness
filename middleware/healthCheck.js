const stats = {
  requests: {
    processed: 0
  }
};

const mountPoint = (mountPoint) => {
  return (req, res) => {
    stats.requests.processed++; 
    res.send(JSON.stringify(stats));
  }
};

module.exports = {
  mountPoint: mountPoint,
  stats: stats
};
