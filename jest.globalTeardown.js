const { dropTestDatabase, closeAdminDriver } = require('./tests/test-utils');

module.exports = async () => {
  // Drop all the test databases created during setup
  const dbNames = JSON.parse(process.env.JEST_NEO4J_DATABASES || '[]');
  const promises = dbNames.map(dropTestDatabase);
  await Promise.all(promises);

  // Close the admin driver connection
  await closeAdminDriver();
};