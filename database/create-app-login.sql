-- Optional, run manually in SSMS (not a migration): a dedicated SQL login for the app.
-- Requires "SQL Server and Windows Authentication mode" to be enabled on the server
-- (SSMS > right-click server > Properties > Security), followed by a service restart.
-- Change the password, then run.

-- This login can only read/write data. `npm run migrate` needs a login that can create
-- tables (e.g. sa); set DB_MIGRATE_USER / DB_MIGRATE_PASSWORD in .env.local for that.


USE master;
GO
CREATE LOGIN issue_tracker_app WITH PASSWORD = N'ChangeThis!Str0ngPassword', CHECK_POLICY = ON;
GO
USE IssueTrackerDB;
GO
CREATE USER issue_tracker_app FOR LOGIN issue_tracker_app;
ALTER ROLE db_datareader ADD MEMBER issue_tracker_app;
ALTER ROLE db_datawriter ADD MEMBER issue_tracker_app;
GO
