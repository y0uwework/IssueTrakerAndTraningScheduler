-- Apps and trainers now come from lib/master-config.ts, the single source of truth.
-- The database no longer hard-codes the app list: the API validates App against the config,
-- so adding an app (e.g. "Prod CRM") only needs a config change.

IF OBJECT_ID(N'dbo.CK_Issues_App', N'C') IS NOT NULL
    ALTER TABLE dbo.Issues DROP CONSTRAINT CK_Issues_App;
GO

IF OBJECT_ID(N'dbo.CK_TrainingSessionTrainers_App', N'C') IS NOT NULL
    ALTER TABLE dbo.TrainingSessionTrainers DROP CONSTRAINT CK_TrainingSessionTrainers_App;
GO

IF OBJECT_ID(N'dbo.CK_TrainingAttendees_App', N'C') IS NOT NULL
    ALTER TABLE dbo.TrainingAttendees DROP CONSTRAINT CK_TrainingAttendees_App;
GO

-- Existing records use "yuvraj singh"; the config spells it "Yuvraj Singh".
-- (The column collation is case-insensitive, so this also matches other casings.)
UPDATE dbo.TrainingSessionTrainers SET TrainerName = N'Yuvraj Singh' WHERE TrainerName = N'yuvraj singh';
UPDATE dbo.TrainingAttendeeTrainers SET TrainerName = N'Yuvraj Singh' WHERE TrainerName = N'yuvraj singh';
GO
