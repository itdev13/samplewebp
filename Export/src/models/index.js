const OAuthToken = require('./OAuthToken');
const Location = require('./Location');
const ExportJob = require('./ExportJob');
const ExportHistory = require('./ExportHistory');

// Define relationships
Location.hasMany(ExportJob, {
  foreignKey: 'locationId',
  sourceKey: 'locationId',
  as: 'exportJobs'
});

ExportJob.belongsTo(Location, {
  foreignKey: 'locationId',
  targetKey: 'locationId',
  as: 'location'
});

Location.hasMany(ExportHistory, {
  foreignKey: 'locationId',
  sourceKey: 'locationId',
  as: 'exportHistory'
});

ExportHistory.belongsTo(Location, {
  foreignKey: 'locationId',
  targetKey: 'locationId',
  as: 'location'
});

ExportJob.hasOne(ExportHistory, {
  foreignKey: 'exportJobId',
  sourceKey: 'id',
  as: 'history'
});

ExportHistory.belongsTo(ExportJob, {
  foreignKey: 'exportJobId',
  targetKey: 'id',
  as: 'job'
});

Location.hasOne(OAuthToken, {
  foreignKey: 'locationId',
  sourceKey: 'locationId',
  as: 'oauthToken'
});

OAuthToken.belongsTo(Location, {
  foreignKey: 'locationId',
  targetKey: 'locationId',
  as: 'location'
});

module.exports = {
  OAuthToken,
  Location,
  ExportJob,
  ExportHistory
};

