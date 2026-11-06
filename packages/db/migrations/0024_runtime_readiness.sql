-- Non-sensitive deployment metadata only. Runtime cannot modify migration history.
GRANT SELECT ON TABLE schema_migration TO oncobrief_app;
