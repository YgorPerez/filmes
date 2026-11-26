// The schema's version, which a rebuild stamps in the database's
// `user_version` and `Sqlite` checks on every open (#258). It changes with
// any change to `schema/*.sql`: when a test says it no longer matches
// `schemaHash()`, put the number it gives here. The database on the VPS
// then needs `pnpm db:publish --build` along with the deploy.

export const SCHEMA_VERSION = 54695172
